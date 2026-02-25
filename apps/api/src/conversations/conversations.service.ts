import type {
  CapabilitySelectionMetadata,
  ClassificationSelectionMetadata,
  DraftReviewMetadata,
  Message,
  MessageListResponse,
} from '@acme/shared';
import {
  InteractionType,
  MediaRefCollection,
  MediaStatus,
  MediaType,
  MessageMetadataType,
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
import { isErr } from '../common/utils/result.util';
import { TransactionService } from '../database';
import { IMediaRepository, MEDIA_REPOSITORY, MediaService } from '../media';
import { MediaDocument } from '../media/schemas/media.schema';
import {
  type GraphStatus,
  PortfolioGraphService,
} from '../portfolio-graph/portfolio-graph.service';
import { ProcessingService } from '../processing/processing.service';
import { getSpecialtyConfig } from '../specialties/specialty.registry';
import {
  CONVERSATIONS_REPOSITORY,
  IConversationsRepository,
} from './conversations.repository.interface';
import { AnalysisActionDto, ListMessagesDto, SendMessageDto } from './dto';
import { buildMediaData, toMessageDto } from './mappers/message.mapper';
import { MessageDocument } from './schemas/message.schema';

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
    private readonly portfolioGraphService: PortfolioGraphService
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

    // Guard: reject messages when the graph state doesn't accept them
    await this.assertCanSendMessage(conversation._id.toString());

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
    const message = await this.transactionService.withTransaction<MessageDocument>(
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
   *  - "resume": Doctor responds to an AI prompt (classification, follow-up, draft).
   *
   * Steps:
   *  1. Validate conversation ownership
   *  2. Guard: reject if any user messages are still being processed
   *  3. Branch on type: start → launch graph, resume → validate pause state + resume
   *  4. For structured actions (classification, draft) create an audit message
   *  5. Fire-and-forget the graph invocation
   */
  async handleAnalysis(
    userId: string,
    conversationId: string,
    dto: AnalysisActionDto
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

    // 2. Guard: reject if any user messages are still being processed
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

    // type === 'resume' — validate node is required
    if (!dto.node) throw new BadRequestException('node is required for resume actions');

    return this.handleResume(userId, convIdStr, conversation._id, dto.node, dto.value);
  }

  /**
   * Start a new graph. Rejects if a checkpoint already exists (the client
   * should send { type: "resume" } instead) or if no messages are ready.
   */
  private async handleStart(
    userId: string,
    convIdStr: string,
    conversation: { _id: Types.ObjectId; artefact: Types.ObjectId }
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

    this.portfolioGraphService
      .startGraph({
        conversationId: convIdStr,
        artefactId: conversation.artefact.toString(),
        userId,
        specialty: Specialty.GP.toString(),
      })
      .catch((err) => {
        this.logger.error(`Graph start failed for conversation ${convIdStr}: ${err.message}`);
      });
  }

  /**
   * Resume a paused graph at the specified node.
   * Validates that the graph is actually paused at the expected node (409 if mismatch).
   * Creates audit messages for structured actions (classification, draft).
   */
  private async handleResume(
    userId: string,
    convIdStr: string,
    conversationOid: Types.ObjectId,
    node: NonNullable<AnalysisActionDto['node']>,
    value?: Record<string, unknown>
  ): Promise<void> {
    const pausedNode = await this.portfolioGraphService.getPausedNode(convIdStr);
    if (!pausedNode) throw new ConflictException('Analysis is not paused at any node');
    if (pausedNode !== node)
      throw new ConflictException(`Analysis is paused at "${pausedNode}", not "${node}"`);

    const userOid = new Types.ObjectId(userId);

    switch (node) {
      case 'ask_followup': {
        // Guard: the last message must be a USER message (i.e. the user actually answered)
        const lastRoleResult =
          await this.conversationsRepository.getLastMessageRole(conversationOid);
        if (isErr(lastRoleResult))
          throw new InternalServerErrorException(lastRoleResult.error.message);
        if (lastRoleResult.value !== MessageRole.USER)
          throw new BadRequestException('Please send at least one message before continuing.');

        this.portfolioGraphService.resumeGraph(convIdStr, 'ask_followup').catch((err) => {
          this.logger.error(`Graph resume failed for conversation ${convIdStr}: ${err.message}`);
        });
        break;
      }

      case 'present_classification': {
        const entryType = value?.entryType;
        if (!entryType || typeof entryType !== 'string') {
          throw new BadRequestException('value.entryType is required and must be a string');
        }

        // Validate against specialty config
        const config = getSpecialtyConfig(Specialty.GP);
        const validCodes = config.entryTypes.map((et) => et.code);
        if (!validCodes.includes(entryType)) {
          throw new BadRequestException(
            `Invalid entry type "${entryType}". Valid values: ${validCodes.join(', ')}`
          );
        }

        await this.createAuditMessage(conversationOid, userOid, {
          type: MessageMetadataType.CLASSIFICATION_SELECTION,
          interactionType: InteractionType.DISPLAY_ONLY,
          entryType,
        });

        this.portfolioGraphService
          .resumeGraph(convIdStr, 'present_classification', { entryType })
          .catch((err) => {
            this.logger.error(`Graph resume failed for conversation ${convIdStr}: ${err.message}`);
          });
        break;
      }

      case 'present_capabilities': {
        const selectedCodes = value?.selectedCodes;
        if (
          !Array.isArray(selectedCodes) ||
          selectedCodes.length === 0 ||
          !selectedCodes.every((c: unknown) => typeof c === 'string')
        ) {
          throw new BadRequestException(
            'value.selectedCodes is required and must be a non-empty string array'
          );
        }

        await this.createAuditMessage(conversationOid, userOid, {
          type: MessageMetadataType.CAPABILITY_SELECTION,
          interactionType: InteractionType.DISPLAY_ONLY,
          selectedCodes,
        });

        this.portfolioGraphService
          .resumeGraph(convIdStr, 'present_capabilities', { selectedCodes })
          .catch((err) => {
            this.logger.error(`Graph resume failed for conversation ${convIdStr}: ${err.message}`);
          });
        break;
      }

      case 'present_draft': {
        const approved = value?.approved;
        if (typeof approved !== 'boolean') {
          throw new BadRequestException('value.approved is required and must be a boolean');
        }

        await this.createAuditMessage(conversationOid, userOid, {
          type: MessageMetadataType.DRAFT_REVIEW,
          interactionType: InteractionType.DISPLAY_ONLY,
          approved,
        });

        this.portfolioGraphService
          .resumeGraph(convIdStr, 'present_draft', { approved })
          .catch((err) => {
            this.logger.error(`Graph resume failed for conversation ${convIdStr}: ${err.message}`);
          });
        break;
      }
    }
  }

  /**
   * Reject sendMessage() calls when the graph is in a state that doesn't accept new messages.
   *
   * Allowed: not_started (user composing first messages), paused at ask_followup (answering questions).
   * Rejected: running (transcript already gathered), paused at classification/draft (wrong action),
   *           completed (analysis finished).
   */
  private async assertCanSendMessage(convIdStr: string): Promise<void> {
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
        if (graphStatus.node === 'present_draft')
          throw new ConflictException('Please approve or reject the draft to continue.');
    }
  }

  /**
   * Create a SYSTEM message that records a structured action in the chat.
   * Marked COMPLETE immediately since it doesn't need processing.
   * Uses SYSTEM role so it's excluded from gather_context (which filters USER only).
   */
  private async createAuditMessage(
    conversationId: Types.ObjectId,
    userId: Types.ObjectId,
    metadata: ClassificationSelectionMetadata | CapabilitySelectionMetadata | DraftReviewMetadata
  ): Promise<void> {
    let content: string;
    switch (metadata.type) {
      case MessageMetadataType.CLASSIFICATION_SELECTION:
        content = `Selected: ${metadata.entryType}`;
        break;
      case MessageMetadataType.CAPABILITY_SELECTION:
        content = `Capabilities confirmed: ${metadata.selectedCodes.join(', ')}`;
        break;
      case MessageMetadataType.DRAFT_REVIEW:
        content = `Draft ${metadata.approved ? 'approved' : 'rejected'}`;
        break;
      default:
        content = `Action recorded`;
    }

    await this.conversationsRepository.createMessage({
      conversation: conversationId,
      userId,
      role: MessageRole.SYSTEM,
      messageType: MessageType.TEXT,
      content,
      processingStatus: MessageProcessingStatus.COMPLETE,
      metadata,
    });
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
  private async resolveAudioUrl(msg: MessageDocument): Promise<string | null> {
    if (msg.messageType !== MessageType.AUDIO || !msg.media) return null;
    const mediaDoc = msg.media as unknown as MediaDocument;
    try {
      return await this.mediaService.getPresignedUrl(mediaDoc.xid);
    } catch {
      return null;
    }
  }
}
