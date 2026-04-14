import type {
  AnalysisActionRequest,
  ConversationContext,
  Message,
  MessageListResponse,
  MultiSelectQuestion,
  Question,
  SingleSelectQuestion,
} from '@acme/shared';
import {
  ConversationStatus,
  MediaRefCollection,
  MediaStatus,
  MediaType,
  MessageStatus,
  MessageRole,
  MessageType,
} from '@acme/shared';
import { ArtefactStatus } from '@acme/shared';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import {
  ANALYSIS_RUNS_REPOSITORY,
  IAnalysisRunsRepository,
} from '../analysis-runs/analysis-runs.repository.interface';
import { AnalysisRunsService } from '../analysis-runs/analysis-runs.service';
import {
  ARTEFACTS_REPOSITORY,
  IArtefactsRepository,
} from '../artefacts/artefacts.repository.interface';
import { generateXid, nanoidAlphanumeric } from '../common/utils/nanoid.util';
import { isErr } from '../common/utils/result.util';
import { TransactionService } from '../database';
import { IMediaRepository, MEDIA_REPOSITORY, MediaService } from '../media';
import { Media } from '../media/schemas/media.schema';
import { IOutboxRepository, OUTBOX_REPOSITORY } from '../outbox/outbox.repository.interface';
import { OutboxService } from '../outbox/outbox.service';
import {
  IPdpGoalsRepository,
  PDP_GOALS_REPOSITORY,
} from '../pdp-goals/pdp-goals.repository.interface';
import {
  type InterruptNode,
  PortfolioGraphService,
} from '../portfolio-graph/portfolio-graph.service';
import { ConversationContextService } from './conversation-context.service';
import {
  CONVERSATIONS_REPOSITORY,
  IConversationsRepository,
} from './conversations.repository.interface';
import { SendMessageDto } from './dto';
import { buildMediaData, toMessageDto } from './mappers/message.mapper';
import { Message as MessageSchema } from './schemas/message.schema';

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    @Inject(CONVERSATIONS_REPOSITORY)
    private readonly conversationsRepository: IConversationsRepository,
    @Inject(ARTEFACTS_REPOSITORY)
    private readonly artefactsRepository: IArtefactsRepository,
    @Inject(MEDIA_REPOSITORY)
    private readonly mediaRepository: IMediaRepository,
    @Inject(PDP_GOALS_REPOSITORY)
    private readonly pdpGoalsRepository: IPdpGoalsRepository,
    @Inject(ANALYSIS_RUNS_REPOSITORY)
    private readonly analysisRunsRepository: IAnalysisRunsRepository,
    @Inject(OUTBOX_REPOSITORY)
    private readonly outboxRepository: IOutboxRepository,
    private readonly mediaService: MediaService,
    private readonly transactionService: TransactionService,
    private readonly portfolioGraphService: PortfolioGraphService,
    private readonly analysisRunsService: AnalysisRunsService,
    private readonly outboxService: OutboxService,
    private readonly contextService: ConversationContextService
  ) {}

  async deleteConversation(
    userId: string,
    conversationXid: string
  ): Promise<{ message: string }> {
    const userOid = new Types.ObjectId(userId);

    const convResult = await this.conversationsRepository.findConversationByXid(
      conversationXid,
      userOid
    );
    if (isErr(convResult)) throw new InternalServerErrorException(convResult.error.message);
    if (!convResult.value) throw new NotFoundException('Conversation not found');

    const conversation = convResult.value;

    if (conversation.status === ConversationStatus.DELETED) {
      throw new NotFoundException('Conversation not found');
    }

    const artefactResult = await this.artefactsRepository.findById(conversation.artefact);
    if (isErr(artefactResult)) throw new InternalServerErrorException(artefactResult.error.message);
    if (!artefactResult.value) throw new NotFoundException('Artefact not found');

    const artefact = artefactResult.value;

    if (artefact.status !== ArtefactStatus.IN_CONVERSATION) {
      throw new BadRequestException(
        'Conversation can only be deleted while the entry is in progress'
      );
    }

    // Get message IDs for media cleanup
    const msgIdsResult = await this.conversationsRepository.findMessageIdsByConversation(
      conversation._id
    );
    const messageIds = isErr(msgIdsResult) ? [] : msgIdsResult.value;

    await this.transactionService.withTransaction(
      async (session) => {
        const cancelResult = await this.outboxRepository.cancelByConversationId(
          conversation._id.toString(),
          session
        );
        if (isErr(cancelResult))
          throw new InternalServerErrorException(cancelResult.error.message);
        if (messageIds.length > 0) {
          const mediaResult = await this.mediaRepository.markDeletedByMessageIds(
            messageIds,
            session
          );
          if (isErr(mediaResult))
            throw new InternalServerErrorException(mediaResult.error.message);
        }
        const convAnon = await this.conversationsRepository.anonymizeConversation(
          conversation._id,
          session
        );
        if (isErr(convAnon)) throw new InternalServerErrorException(convAnon.error.message);

        const artAnon = await this.artefactsRepository.anonymizeArtefact(artefact._id, session);
        if (isErr(artAnon)) throw new InternalServerErrorException(artAnon.error.message);

        const goalsAnon = await this.pdpGoalsRepository.anonymizeByArtefactId(
          artefact._id,
          session
        );
        if (isErr(goalsAnon)) throw new InternalServerErrorException(goalsAnon.error.message);
      },
      { context: `deleteConversation:${conversationXid}` }
    );

    // Best-effort outside transaction (no session support on this method)
    await this.analysisRunsRepository.anonymizeByConversationIds([conversation._id]);

    return { message: 'Conversation deleted successfully' };
  }

  async sendMessage(userId: string, conversationId: string, dto: SendMessageDto): Promise<Message> {
    // Validate at least one of content or mediaId is provided
    if (!dto.content && !dto.mediaId)
      throw new BadRequestException('Either content or mediaId must be provided');

    const userOid = new Types.ObjectId(userId);

    // Idempotency check: if key is provided, look for an existing message
    if (dto.idempotencyKey) {
      const existingResult = await this.conversationsRepository.findMessageByIdempotencyKey(
        userOid,
        dto.idempotencyKey
      );
      if (isErr(existingResult))
        throw new InternalServerErrorException(existingResult.error.message);
      if (existingResult.value) {
        const existing = existingResult.value;
        this.logger.log(
          `Idempotent hit for key ${dto.idempotencyKey}, returning existing message ${existing.xid}`
        );
        // Return existing message — find conversation xid for the DTO
        const convResult = await this.conversationsRepository.findConversationById(
          existing.conversation
        );
        if (isErr(convResult)) throw new InternalServerErrorException(convResult.error.message);
        return toMessageDto(
          existing,
          convResult.value?.xid ?? conversationId,
          buildMediaData(existing, null)
        );
      }
    }

    // Phase 1: Pre-validation (outside transaction)
    const conversationResult = await this.conversationsRepository.findConversationByXid(
      conversationId,
      userOid
    );

    if (isErr(conversationResult))
      throw new InternalServerErrorException(conversationResult.error.message);
    if (!conversationResult.value) throw new NotFoundException('Conversation not found');

    const conversation = conversationResult.value;

    // Guard: reject messages when the conversation or analysis state doesn't accept them
    await this.assertCanSendMessage(conversation._id, conversation.status);

    // Validate media upload if provided (S3 HEAD + content-type check)
    let validatedMedia: Awaited<ReturnType<MediaService['validateMediaUpload']>> | null = null;

    if (dto.mediaId) {
      validatedMedia = await this.mediaService.validateMediaUpload(userId, dto.mediaId);
    }

    // Determine message type
    const messageType = validatedMedia
      ? validatedMedia.mediaType === MediaType.AUDIO
        ? MessageType.AUDIO
        : MessageType.IMAGE
      : MessageType.TEXT;

    // Phase 2: Transaction (message creation + media attachment)
    const message = await this.transactionService.withTransaction<MessageSchema>(
      async (session) => {
        // Create the message
        const messageResult = await this.conversationsRepository.createMessage(
          {
            conversation: conversation._id,
            userId: userOid,
            role: MessageRole.USER,
            messageType,
            rawContent: dto.content || null,
            media: validatedMedia?.mediaId || null,
            idempotencyKey: dto.idempotencyKey || nanoidAlphanumeric(),
          },
          session
        );

        if (isErr(messageResult))
          throw new InternalServerErrorException(messageResult.error.message);

        const createdMessage = messageResult.value;

        // Attach media to message (update media status and ref)
        if (validatedMedia) {
          const updateResult = await this.mediaRepository.updateStatus(
            validatedMedia.xid,
            {
              status: MediaStatus.ATTACHED,
              refCollection: MediaRefCollection.MESSAGES,
              refDocumentId: createdMessage._id,
              sizeBytes: validatedMedia.sizeBytes,
            },
            session
          );

          if (isErr(updateResult))
            throw new InternalServerErrorException(updateResult.error.message);
        }

        // Enqueue processing job in same transaction (outbox pattern)
        await this.outboxService.enqueue(
          {
            type: 'message.process',
            payload: { messageId: createdMessage._id.toString() },
            maxAttempts: 3,
          },
          session
        );

        return createdMessage;
      },
      { context: `sendMessage:${conversationId}` }
    );

    // Build media data from validated media info (no presigned URL — audio is still PENDING)
    const mediaData = validatedMedia
      ? {
          id: validatedMedia.xid,
          mimeType: validatedMedia.mimeType,
          sizeBytes: validatedMedia.sizeBytes,
          durationMs: validatedMedia.durationMs,
          audioUrl: null,
        }
      : null;

    return toMessageDto(message, conversation.xid, mediaData);
  }

  /**
   * Unified analysis endpoint — handles both starting and resuming the graph.
   *
   * Discriminated on dto.type:
   *  - "start": First AI button tap. Starts a new graph.
   *  - "resume": Doctor responds to an AI prompt. Sends messageId + generic value.
   *
   * Steps:
   *  1. Validate conversation ownership
   *  2. Guard: reject if any user messages are still being processed
   *  3. Branch on type: start → launch graph, resume → validate pause state + resume
   */
  async handleAnalysis(
    userId: string,
    conversationId: string,
    dto: AnalysisActionRequest
  ): Promise<ConversationContext> {
    // 1. Validate conversation ownership
    const conversationResult = await this.conversationsRepository.findConversationByXid(
      conversationId,
      new Types.ObjectId(userId)
    );

    if (isErr(conversationResult))
      throw new InternalServerErrorException(conversationResult.error.message);
    if (!conversationResult.value) throw new NotFoundException('Conversation not found');

    const conversation = conversationResult.value;
    const convIdStr = conversation._id.toString();

    // 2a. Guard: reject if conversation is closed
    if (conversation.status === ConversationStatus.CLOSED) {
      throw new ConflictException(
        'This conversation is closed. Analysis cannot be started or resumed.'
      );
    }

    // 2b. Guard: reject if any user messages are still being processed
    const processingResult = await this.conversationsRepository.hasProcessingMessages(
      conversation._id
    );
    if (isErr(processingResult))
      throw new InternalServerErrorException(processingResult.error.message);
    if (processingResult.value) {
      throw new ConflictException(
        'Cannot start or resume analysis while messages are still being processed'
      );
    }

    // 3. Branch on action type
    if (dto.type === 'start') {
      await this.handleStart(userId, convIdStr, conversation);
    } else {
      await this.handleResume(
        userId,
        convIdStr,
        conversation._id,
        dto.messageId,
        'value' in dto ? (dto.value as Record<string, unknown>) : undefined
      );
    }

    // 4. Compute and return updated context (run is now PENDING → phase = 'analysing')
    const artefactXidResult = await this.conversationsRepository.findArtefactXidByConversationId(
      conversation._id
    );
    const artefactId = !isErr(artefactXidResult) ? (artefactXidResult.value ?? '') : '';

    return this.contextService.computeContext(conversation._id, conversation.status, artefactId);
  }

  /**
   * Start a new analysis run. Creates an analysis_run + outbox entry in a single
   * transaction. The outbox consumer picks up the job and invokes LangGraph.
   *
   * Rejects if a checkpoint already exists or no messages are ready.
   * Uses idempotency key (conversationId-scoped) to prevent duplicate runs.
   */
  private async handleStart(
    userId: string,
    convIdStr: string,
    conversation: { _id: Types.ObjectId; artefact: Types.ObjectId },
    idempotencyKey?: string
  ): Promise<void> {
    // Guard: require at least one COMPLETE user message before starting
    const completeResult = await this.conversationsRepository.hasCompleteMessages(conversation._id);
    if (isErr(completeResult)) throw new InternalServerErrorException(completeResult.error.message);
    if (!completeResult.value)
      throw new BadRequestException('Cannot start analysis without any completed messages.');

    // Check for existing active run (e.g. user already triggered analysis)
    const existingRun = await this.analysisRunsService.findActiveRun(conversation._id);
    if (existingRun) {
      throw new ConflictException('An analysis run is already in progress for this conversation.');
    }

    const effectiveIdempotencyKey = idempotencyKey || generateXid();

    // Look up artefact to get specialty + trainingStage for the graph
    const artefactResult = await this.artefactsRepository.findById(conversation.artefact);
    if (isErr(artefactResult) || !artefactResult.value) {
      throw new InternalServerErrorException('Artefact not found for conversation');
    }
    const artefact = artefactResult.value;

    // Transactional: create analysis_run + outbox entry atomically.
    // threadId is derived internally by createRun as `${conversationId}:${runNumber}`.
    await this.transactionService.withTransaction(
      async (session) => {
        const { run } = await this.analysisRunsService.createRun(
          conversation._id,
          effectiveIdempotencyKey,
          session
        );

        await this.outboxService.enqueue(
          {
            type: 'analysis.start',
            payload: {
              analysisRunId: run._id.toString(),
              conversationId: convIdStr,
              artefactId: conversation.artefact.toString(),
              userId,
              specialty: artefact.specialty.toString(),
              trainingStage: artefact.trainingStage ?? '',
              langGraphThreadId: run.langGraphThreadId,
            },
          },
          session
        );
      },
      { context: `handleStart:${convIdStr}` }
    );
  }

  /**
   * Resume a paused graph at the node identified by the ASSISTANT question message.
   *
   * The client sends messageId (the question message xid) + a generic response value.
   * The backend resolves the graph node from analysisRun.currentQuestion (source of truth),
   * validates the response shape using questionType, and maps generic → domain values.
   */
  private async handleResume(
    userId: string,
    convIdStr: string,
    conversationOid: Types.ObjectId,
    messageId: string,
    value?: Record<string, unknown>
  ): Promise<void> {
    // 1. Look up the ASSISTANT question message by xid
    const userOid = new Types.ObjectId(userId);
    const msgResult = await this.conversationsRepository.findMessagesByXids([messageId], userOid);
    if (isErr(msgResult)) throw new InternalServerErrorException(msgResult.error.message);
    const message = msgResult.value[0];
    if (!message) throw new NotFoundException('Question message not found');
    if (message.role !== MessageRole.ASSISTANT || !message.question)
      throw new BadRequestException('Message is not a question');

    // 2. Get node from analysis run (source of truth — scales to multiple nodes per questionType)
    const activeRun = await this.analysisRunsService.findActiveRun(conversationOid);
    if (!activeRun?.currentQuestion) throw new ConflictException('No active question');
    if (activeRun.currentQuestion.messageId.toString() !== message._id.toString())
      throw new ConflictException('This question is no longer the current question');
    const node = activeRun.currentQuestion.node as InterruptNode;

    // 3. Reject terminal questions — these are informational and cannot be resumed
    if (activeRun.currentQuestion.questionType === 'terminal') {
      throw new BadRequestException(
        'This analysis has ended. Start a new conversation to try again.',
      );
    }

    // 4. Verify graph is actually paused at this node
    const pausedNode = await this.portfolioGraphService.getPausedNode(activeRun.langGraphThreadId);
    if (!pausedNode) throw new ConflictException('Analysis is not paused at any node');
    if (pausedNode !== node)
      throw new ConflictException(`Analysis is paused at "${pausedNode}", not "${node}"`);

    // 5. Read questionType for SHAPE validation, node for DOMAIN mapping
    const questionType = (message.question as Question).questionType;

    // 6a. Validate value SHAPE based on questionType (generic — works for any question)
    //     Validate selected keys against question.options (not specialty config)
    let selectedKey: string | undefined;
    let selectedKeys: string[] | undefined;
    switch (questionType) {
      case 'free_text': {
        // Guard: last message must be USER (they answered the follow-up)
        const lastRoleResult =
          await this.conversationsRepository.getLastMessageRole(conversationOid);
        if (isErr(lastRoleResult))
          throw new InternalServerErrorException(lastRoleResult.error.message);
        if (lastRoleResult.value !== MessageRole.USER)
          throw new BadRequestException('Please send at least one message before continuing.');
        break;
      }
      case 'single_select': {
        selectedKey = value?.selectedKey as string;
        if (!selectedKey || typeof selectedKey !== 'string')
          throw new BadRequestException('value.selectedKey is required');
        const qm = message.question as SingleSelectQuestion;
        const validKeys = new Set(qm.options.map((o) => o.key));
        if (!validKeys.has(selectedKey))
          throw new BadRequestException(`Invalid selection "${selectedKey}"`);
        break;
      }
      case 'multi_select': {
        selectedKeys = value?.selectedKeys as string[];
        if (!Array.isArray(selectedKeys) || selectedKeys.length === 0)
          throw new BadRequestException('value.selectedKeys is required');
        const qm = message.question as MultiSelectQuestion;
        const validKeys = new Set(qm.options.map((o) => o.key));
        const invalid = selectedKeys.filter((k) => !validKeys.has(k));
        if (invalid.length > 0)
          throw new BadRequestException(`Invalid selections: ${invalid.join(', ')}`);
        break;
      }
    }

    // 6b. Build graph resume value based on NODE (domain-specific)
    let resumeValue: Record<string, unknown> | true = true;
    switch (node) {
      case 'present_classification':
        resumeValue = { entryType: selectedKey };
        break;
      case 'present_capabilities':
        resumeValue = { selectedCodes: selectedKeys };
        break;
      case 'ask_followup':
        resumeValue = true;
        break;
    }

    // Extract idempotency key from value (client sends it alongside selection data)
    const idempotencyKey = (value?.idempotencyKey as string) || nanoidAlphanumeric();

    // Idempotency check: if key is provided and message already exists, skip creation
    if (idempotencyKey) {
      const existingResult = await this.conversationsRepository.findMessageByIdempotencyKey(
        userOid,
        idempotencyKey
      );
      if (isErr(existingResult))
        throw new InternalServerErrorException(existingResult.error.message);
      if (existingResult.value) {
        this.logger.log(
          `Idempotent hit for resume key ${idempotencyKey}, skipping message creation`
        );
        return; // Already processed — outbox entry already enqueued
      }
    }

    // 6. Transaction: USER text message (for selections) + outbox entry
    await this.transactionService.withTransaction(
      async (session) => {
        // Record user selection as plain USER text message
        // Use option labels from question for human-readable content
        if (questionType === 'single_select' && selectedKey) {
          const qm = message.question as SingleSelectQuestion;
          const label = qm.options.find((o) => o.key === selectedKey)?.label ?? selectedKey;
          await this.conversationsRepository.createMessage(
            {
              conversation: conversationOid,
              userId: userOid,
              role: MessageRole.USER,
              messageType: MessageType.TEXT,
              content: `Selected: ${label}`,
              status: MessageStatus.COMPLETE,
              idempotencyKey,
            },
            session
          );
        }
        if (questionType === 'multi_select' && selectedKeys) {
          const qm = message.question as MultiSelectQuestion;
          const labels = selectedKeys.map((k) => qm.options.find((o) => o.key === k)?.label ?? k);
          await this.conversationsRepository.createMessage(
            {
              conversation: conversationOid,
              userId: userOid,
              role: MessageRole.USER,
              messageType: MessageType.TEXT,
              content: `Selected: ${labels.join(', ')}`,
              status: MessageStatus.COMPLETE,
              idempotencyKey,
            },
            session
          );
        }

        // Persist answer on the ASSISTANT question message for read-only rendering
        if (questionType === 'single_select' && selectedKey) {
          await this.conversationsRepository.updateMessage(
            message._id,
            { answer: { selectedKey } },
            session
          );
        } else if (questionType === 'multi_select' && selectedKeys) {
          await this.conversationsRepository.updateMessage(
            message._id,
            { answer: { selectedKeys } },
            session
          );
        }

        await this.outboxService.enqueue(
          {
            type: 'analysis.resume',
            payload: {
              analysisRunId: activeRun._id.toString(),
              conversationId: convIdStr,
              node,
              resumeValue,
              langGraphThreadId: activeRun.langGraphThreadId,
            },
          },
          session
        );
      },
      { context: `handleResume:${convIdStr}:${node}` }
    );
  }

  /**
   * Reject sendMessage() calls when the conversation or analysis state doesn't accept new messages.
   * Derives permissions from AnalysisRun state via ConversationContextService.
   */
  private async assertCanSendMessage(
    conversationOid: Types.ObjectId,
    conversationStatus: ConversationStatus
  ): Promise<void> {
    const context = await this.contextService.computeContext(
      conversationOid,
      conversationStatus,
      ''
    );
    if (!context.actions.sendMessage.allowed) {
      throw new ConflictException(
        context.actions.sendMessage.reason || 'Cannot send messages at this time.'
      );
    }
  }

  async listMessages(userId: string, conversationId: string): Promise<MessageListResponse> {
    // Find conversation by xid
    const conversationResult = await this.conversationsRepository.findConversationByXid(
      conversationId,
      new Types.ObjectId(userId)
    );

    if (isErr(conversationResult)) {
      throw new InternalServerErrorException(conversationResult.error.message);
    }

    if (!conversationResult.value) {
      throw new NotFoundException('Conversation not found');
    }

    const conversation = conversationResult.value;

    // Get all messages (no pagination — conversations are <50 messages)
    const messagesResult = await this.conversationsRepository.listMessages({
      conversation: conversation._id,
    });

    if (isErr(messagesResult)) {
      throw new InternalServerErrorException(messagesResult.error.message);
    }

    const messages = messagesResult.value.messages;

    // Enrich audio messages with presigned download URLs in parallel
    const enriched = await Promise.all(
      messages.map(async (msg) => {
        const audioUrl = await this.resolveAudioUrl(msg);
        return toMessageDto(msg, conversation.xid, buildMediaData(msg, audioUrl));
      })
    );

    // Resolve artefact xid for the context
    const artefactXidResult = await this.conversationsRepository.findArtefactXidByConversationId(
      conversation._id
    );
    const artefactId = !isErr(artefactXidResult) ? (artefactXidResult.value ?? '') : '';

    // Compute context (server-driven action state)
    let context = await this.contextService.computeContext(
      conversation._id,
      conversation.status,
      artefactId
    );

    // Guard against a read-timing race: the messages query and the context query
    // read from different collections without snapshot isolation. If the handler's
    // transaction committed between the two reads, context may reference a question
    // message that isn't in the messages list yet. In that case, downgrade the
    // context to 'analysing' so the client keeps its spinner and fast-polls — the
    // next poll (2s later) will pick up both the message and the correct context.
    if (context.activeQuestion) {
      const questionInList = enriched.some(
        (m) => m.id === context.activeQuestion!.messageId
      );
      if (!questionInList) {
        context = {
          ...context,
          phase: 'analysing',
          activeQuestion: undefined,
          actions: {
            sendMessage: { allowed: false, code: 'ANALYSIS_RUNNING', reason: 'Analysis is in progress.' },
            sendAudio: { allowed: false, code: 'ANALYSIS_RUNNING', reason: 'Analysis is in progress.' },
            startAnalysis: { allowed: false, code: 'ANALYSIS_RUNNING', reason: 'Analysis is already in progress.' },
            resumeAnalysis: { allowed: false, code: 'ANALYSIS_RUNNING', reason: 'Analysis is running, not paused.' },
          },
        };
      }
    }

    return { messages: enriched, context };
  }

  /**
   * Generate a presigned download URL for audio messages.
   * Returns null for non-audio messages or if the media is not yet attached.
   */
  private async resolveAudioUrl(msg: MessageSchema): Promise<string | null> {
    if (msg.messageType !== MessageType.AUDIO || !msg.media) return null;
    const mediaDoc = msg.media as unknown as Media;
    try {
      return await this.mediaService.getPresignedUrl(mediaDoc.xid);
    } catch {
      return null;
    }
  }
}
