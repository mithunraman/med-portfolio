import { MediaType, MessageProcessingStatus, Specialty } from '@acme/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { isErr } from '../common/utils/result.util';
import {
  CONVERSATIONS_REPOSITORY,
  IConversationsRepository,
} from '../conversations/conversations.repository.interface';
import { Message } from '../conversations/schemas/message.schema';
import { MediaService } from '../media/media.service';
import { Media } from '../media/schemas/media.schema';
import { CleaningStage } from './stages/cleaning.stage';
import { StageContext } from './stages/stage.interface';
import { TranscriptionStage, TranscriptionStageResult } from './stages/transcription.stage';

@Injectable()
export class ProcessingService {
  private readonly logger = new Logger(ProcessingService.name);

  constructor(
    @Inject(CONVERSATIONS_REPOSITORY)
    private readonly conversationsRepository: IConversationsRepository,
    private readonly mediaService: MediaService,
    private readonly transcriptionStage: TranscriptionStage,
    private readonly cleaningStage: CleaningStage
  ) {}

  /**
   * Process a message - orchestrates the pipeline based on message type
   * This is called asynchronously after message creation
   */
  async processMessage(messageId: Types.ObjectId): Promise<void> {
    this.logger.log(`Starting processing for message ${messageId}`);

    // Fetch message with media populated
    const findResult = await this.conversationsRepository.findMessageById(messageId);

    if (isErr(findResult)) {
      this.logger.error(`Failed to find message ${messageId}: ${findResult.error.message}`);
      return;
    }

    const message = findResult.value;

    if (!message) {
      this.logger.error(`Message ${messageId} not found`);
      return;
    }

    // Build context
    const context: StageContext = {
      messageId: message._id,
      conversationId: message.conversation,
      specialty: Specialty.GP, // Default for now, could get from user
      mediaType: message.media ? (message.media as unknown as Media).mediaType : null,
    };

    try {
      // Determine pipeline based on content type
      if (message.media && context.mediaType === MediaType.AUDIO) {
        await this.processAudioMessage(message, context);
      } else if (message.rawContent) {
        await this.processTextMessage(message, context);
      } else {
        await this.markFailed(messageId, 'No content to process');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Processing failed for message ${messageId}: ${errorMessage}`);
      await this.markFailed(messageId, errorMessage);
    }
  }

  /**
   * Process audio message: Transcribe → Clean
   * Note: PII redaction is handled by AssemblyAI during transcription
   */
  private async processAudioMessage(
    message: Message,
    context: StageContext
  ): Promise<void> {
    const messageId = message._id;
    const media = message.media as unknown as Media;

    // Update status to TRANSCRIBING
    await this.updateStatus(messageId, MessageProcessingStatus.TRANSCRIBING);

    // Get presigned URL for the audio
    const audioUrl = await this.mediaService.getPresignedUrl(media.xid);

    // Stage 1: Transcription (with PII redaction via AssemblyAI)
    this.logger.log(`Transcribing audio for message ${message.xid}`);
    const transcriptionResult: TranscriptionStageResult = await this.transcriptionStage.execute(
      audioUrl,
      context
    );

    // Update with raw transcript and transcription metadata
    await this.conversationsRepository.updateMessage(messageId, {
      rawContent: transcriptionResult.text,
      processingStatus: MessageProcessingStatus.CLEANING,
      transcription: transcriptionResult.transcription,
    });

    // Stage 2: Cleaning
    this.logger.log(`Cleaning transcript for message ${message.xid}`);
    const cleaningResult = await this.cleaningStage.execute(transcriptionResult.text, context);

    // Update with cleaned content (final)
    await this.conversationsRepository.updateMessage(messageId, {
      cleanedContent: cleaningResult.text,
      content: cleaningResult.text, // Final content
      processingStatus: MessageProcessingStatus.COMPLETE,
    });

    this.logger.log(`Message processing complete for ${message.xid}`);
  }

  /**
   * Process text message: Clean only
   * Note: Text from user input doesn't need transcription or PII redaction
   * (user is responsible for not including PII in manual text input)
   */
  private async processTextMessage(message: Message, context: StageContext): Promise<void> {
    const messageId = message._id;

    // Update status to CLEANING
    await this.updateStatus(messageId, MessageProcessingStatus.CLEANING);

    // Stage 1: Cleaning
    this.logger.log(`Cleaning text for message ${message.xid}`);
    if (!message.rawContent) {
      await this.markFailed(messageId, 'No raw content to clean');
      return;
    }
    const cleaningResult = await this.cleaningStage.execute(message.rawContent, context);

    // Update with cleaned content (final)
    await this.conversationsRepository.updateMessage(messageId, {
      cleanedContent: cleaningResult.text,
      content: cleaningResult.text, // Final content
      processingStatus: MessageProcessingStatus.COMPLETE,
    });

    this.logger.log(`Message processing complete for ${message.xid}`);
  }

  private async updateStatus(
    messageId: Types.ObjectId,
    status: MessageProcessingStatus
  ): Promise<void> {
    await this.conversationsRepository.updateMessage(messageId, {
      processingStatus: status,
    });
  }

  private async markFailed(messageId: Types.ObjectId, error: string): Promise<void> {
    await this.conversationsRepository.updateMessage(messageId, {
      processingStatus: MessageProcessingStatus.FAILED,
      processingError: error,
    });
  }
}
