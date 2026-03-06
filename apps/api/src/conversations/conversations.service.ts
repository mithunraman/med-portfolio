import type {
  AnalysisActionRequest,
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
  MessageProcessingStatus,
  MessageRole,
  MessageType,
  Specialty,
} from '@acme/shared';
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
import { AnalysisRunsService } from '../analysis-runs/analysis-runs.service';
import { generateXid } from '../common/utils/nanoid.util';
import { isErr } from '../common/utils/result.util';
import { TransactionService } from '../database';
import { IMediaRepository, MEDIA_REPOSITORY, MediaService } from '../media';
import { Media } from '../media/schemas/media.schema';
import { OutboxService } from '../outbox/outbox.service';
import {
  type GraphStatus,
  type InterruptNode,
  PortfolioGraphService,
} from '../portfolio-graph/portfolio-graph.service';
import { ProcessingService } from '../processing/processing.service';
import {
  CONVERSATIONS_REPOSITORY,
  IConversationsRepository,
} from './conversations.repository.interface';
import { ListMessagesDto, SendMessageDto } from './dto';
import { buildMediaData, toMessageDto } from './mappers/message.mapper';
import { Message as MessageSchema } from './schemas/message.schema';

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    @Inject(CONVERSATIONS_REPOSITORY)
    private readonly conversationsRepository: IConversationsRepository,
    @Inject(MEDIA_REPOSITORY)
    private readonly mediaRepository: IMediaRepository,
    private readonly mediaService: MediaService,
    private readonly transactionService: TransactionService,
    private readonly processingService: ProcessingService,
    private readonly portfolioGraphService: PortfolioGraphService,
    private readonly analysisRunsService: AnalysisRunsService,
    private readonly outboxService: OutboxService,
  ) {}

  async sendMessage(userId: string, conversationId: string, dto: SendMessageDto): Promise<Message> {
    // Validate at least one of content or mediaId is provided
    if (!dto.content && !dto.mediaId)
      throw new BadRequestException('Either content or mediaId must be provided');

    // Phase 1: Pre-validation (outside transaction)
    const conversationResult = await this.conversationsRepository.findConversationByXid(
      conversationId,
      new Types.ObjectId(userId)
    );

    if (isErr(conversationResult))
      throw new InternalServerErrorException(conversationResult.error.message);
    if (!conversationResult.value) throw new NotFoundException('Conversation not found');

    const conversation = conversationResult.value;

    // Guard: reject messages when the conversation or graph state doesn't accept them
    await this.assertCanSendMessage(conversation._id.toString(), conversation.status);

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
            userId: new Types.ObjectId(userId),
            role: MessageRole.USER,
            messageType,
            rawContent: dto.content || null,
            media: validatedMedia?.mediaId || null,
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

        return createdMessage;
      },
      { context: `sendMessage:${conversationId}` }
    );

    // Phase 3: Post-transaction (async processing)
    // TODO: Replace with BullMQ job queue for production
    this.processingService.processMessage(message._id).catch((err) => {
      this.logger.error(`Processing failed for message ${message.xid}: ${err.message}`);
    });

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
  ): Promise<void> {
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
      throw new ConflictException('This conversation is closed. Analysis cannot be started or resumed.');
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
    if (dto.type === 'start') return this.handleStart(userId, convIdStr, conversation);

    return this.handleResume(
      userId,
      convIdStr,
      conversation._id,
      dto.messageId,
      'value' in dto ? (dto.value as Record<string, unknown>) : undefined
    );
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
    idempotencyKey?: string,
  ): Promise<void> {
    const hasCheckpoint = await this.portfolioGraphService.hasCheckpoint(convIdStr);

    if (hasCheckpoint) {
      throw new ConflictException('Analysis already started. Use { type: "resume" } to continue.');
    }

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
    const langGraphThreadId = convIdStr; // Thread ID = conversation _id (matches existing behavior)

    // Transactional: create analysis_run + outbox entry atomically
    await this.transactionService.withTransaction(
      async (session) => {
        const { run } = await this.analysisRunsService.createRun(
          conversation._id,
          effectiveIdempotencyKey,
          langGraphThreadId,
          session,
        );

        await this.outboxService.enqueue(
          {
            type: 'analysis.start',
            payload: {
              analysisRunId: run._id.toString(),
              conversationId: convIdStr,
              artefactId: conversation.artefact.toString(),
              userId,
              specialty: Specialty.GP.toString(),
            },
          },
          session,
        );
      },
      { context: `handleStart:${convIdStr}` },
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

    // 3. Verify graph is actually paused at this node
    const pausedNode = await this.portfolioGraphService.getPausedNode(convIdStr);
    if (!pausedNode) throw new ConflictException('Analysis is not paused at any node');
    if (pausedNode !== node)
      throw new ConflictException(`Analysis is paused at "${pausedNode}", not "${node}"`);

    // 4. Read questionType for SHAPE validation, node for DOMAIN mapping
    const questionType = (message.question as Question).questionType;

    // 5a. Validate value SHAPE based on questionType (generic — works for any question)
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

    // 5b. Build graph resume value based on NODE (domain-specific)
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
              processingStatus: MessageProcessingStatus.COMPLETE,
            },
            session,
          );
        }
        if (questionType === 'multi_select' && selectedKeys) {
          const qm = message.question as MultiSelectQuestion;
          const labels = selectedKeys.map(
            (k) => qm.options.find((o) => o.key === k)?.label ?? k,
          );
          await this.conversationsRepository.createMessage(
            {
              conversation: conversationOid,
              userId: userOid,
              role: MessageRole.USER,
              messageType: MessageType.TEXT,
              content: `Selected: ${labels.join(', ')}`,
              processingStatus: MessageProcessingStatus.COMPLETE,
            },
            session,
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
            },
          },
          session,
        );
      },
      { context: `handleResume:${convIdStr}:${node}` },
    );
  }

  /**
   * Reject sendMessage() calls when the conversation or graph state doesn't accept new messages.
   *
   * Conversation-level: CLOSED conversations reject all messages.
   * Graph-level:
   *   Allowed: not_started (composing), paused at ask_followup (answering questions).
   *   Rejected: running, paused at classification/capabilities, completed.
   */
  private async assertCanSendMessage(
    convIdStr: string,
    conversationStatus: ConversationStatus,
  ): Promise<void> {
    if (conversationStatus === ConversationStatus.CLOSED) {
      throw new ConflictException('This conversation is closed. No further messages can be sent.');
    }

    const graphStatus: GraphStatus = await this.portfolioGraphService.getGraphStatus(convIdStr);

    switch (graphStatus.status) {
      case 'not_started':
        return; // User is composing initial messages
      case 'running':
        throw new ConflictException('Analysis is in progress. Please wait for it to complete.');
      case 'completed':
        throw new ConflictException('Analysis is complete. No further messages can be sent.');
      case 'paused':
        if (graphStatus.node === 'ask_followup') return; // User is answering follow-up questions
        if (graphStatus.node === 'present_classification')
          throw new ConflictException('Please select an entry type to continue.');
        if (graphStatus.node === 'present_capabilities')
          throw new ConflictException('Please confirm capabilities to continue.');
    }
  }

  async listMessages(
    userId: string,
    conversationId: string,
    query: ListMessagesDto
  ): Promise<MessageListResponse> {
    const limit = query.limit || 50;
    const cursor = query.cursor ? new Types.ObjectId(query.cursor) : undefined;

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

    // Get messages (media is populated by the repository)
    const messagesResult = await this.conversationsRepository.listMessages({
      conversation: conversation._id,
      cursor,
      limit,
    });

    if (isErr(messagesResult)) {
      throw new InternalServerErrorException(messagesResult.error.message);
    }

    const messages = messagesResult.value.messages;
    const hasMore = messages.length === limit;
    const nextCursor = hasMore ? messages[messages.length - 1]._id.toString() : null;

    // Enrich audio messages with presigned download URLs in parallel
    const enriched = await Promise.all(
      messages.map(async (msg) => {
        const audioUrl = await this.resolveAudioUrl(msg);
        return toMessageDto(msg, conversation.xid, buildMediaData(msg, audioUrl));
      })
    );

    return { messages: enriched, nextCursor, limit };
  }

  async pollMessages(userId: string, xids: string[]): Promise<Message[]> {
    if (xids.length === 0) return [];

    const result = await this.conversationsRepository.findMessagesByXids(
      xids,
      new Types.ObjectId(userId)
    );

    if (isErr(result)) {
      throw new InternalServerErrorException(result.error.message);
    }

    const messages = result.value;

    // Enrich audio messages with presigned download URLs in parallel
    return Promise.all(
      messages.map(async (msg) => {
        const conversationDoc = msg.conversation as unknown as { xid: string };
        const audioUrl = await this.resolveAudioUrl(msg);
        return toMessageDto(msg, conversationDoc.xid, buildMediaData(msg, audioUrl));
      })
    );
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
