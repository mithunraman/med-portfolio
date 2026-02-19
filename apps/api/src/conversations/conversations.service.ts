import type { Message, MessageListResponse } from '@acme/shared';
import { MediaRefCollection, MediaStatus, MediaType, MessageRole, MessageType } from '@acme/shared';
import {
  BadRequestException,
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
import { ProcessingService } from '../processing/processing.service';
import {
  CONVERSATIONS_REPOSITORY,
  IConversationsRepository,
} from './conversations.repository.interface';
import { ListMessagesDto, SendMessageDto } from './dto';
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
    private readonly processingService: ProcessingService
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
