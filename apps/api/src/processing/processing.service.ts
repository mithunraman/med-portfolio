import { MediaType, MessageStatus } from '@acme/shared';
import { Inject, Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
  ARTEFACTS_REPOSITORY,
  IArtefactsRepository,
} from '../artefacts/artefacts.repository.interface';
import { isErr } from '../common/utils/result.util';
import {
  CONVERSATIONS_REPOSITORY,
  IConversationsRepository,
  UpdateMessageData,
} from '../conversations/conversations.repository.interface';
import { Message } from '../conversations/schemas/message.schema';
import { MediaService } from '../media/media.service';
import { Media } from '../media/schemas/media.schema';
import { CleaningStage } from './stages/cleaning.stage';
import { RedactionStage } from './stages/redaction.stage';
import { StageContext } from './stages/stage.interface';
import { TranscriptionStage, TranscriptionStageResult } from './stages/transcription.stage';

@Injectable()
export class ProcessingService {
  constructor(
    @InjectPinoLogger(ProcessingService.name)
    private readonly logger: PinoLogger,
    @Inject(CONVERSATIONS_REPOSITORY)
    private readonly conversationsRepository: IConversationsRepository,
    @Inject(ARTEFACTS_REPOSITORY)
    private readonly artefactsRepository: IArtefactsRepository,
    private readonly mediaService: MediaService,
    private readonly transcriptionStage: TranscriptionStage,
    private readonly cleaningStage: CleaningStage,
    private readonly redactionStage: RedactionStage
  ) {}

  /**
   * Process a message - orchestrates the pipeline based on message type
   * This is called asynchronously after message creation
   */
  async processMessage(messageId: Types.ObjectId): Promise<void> {
    this.logger.info(`Starting processing for message ${messageId}`);

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

    // Idempotency guard: skip if already in a terminal state (safe for outbox retry)
    if (
      message.status === MessageStatus.COMPLETE ||
      message.status === MessageStatus.FAILED
    ) {
      this.logger.info(`Message ${messageId} already ${message.status}, skipping`);
      return;
    }

    // Look up artefact via conversation to get specialty
    const convResult = await this.conversationsRepository.findConversationById(
      message.conversation
    );
    if (isErr(convResult) || !convResult.value) {
      this.logger.error(`Conversation not found for message ${messageId}`);
      await this.markFailed(messageId, 'Conversation not found');
      return;
    }
    const artefactResult = await this.artefactsRepository.findById(convResult.value.artefact);
    if (isErr(artefactResult) || !artefactResult.value) {
      this.logger.error(`Artefact not found for message ${messageId}`);
      await this.markFailed(messageId, 'Artefact not found');
      return;
    }
    const specialty = artefactResult.value.specialty;

    // Build context
    const context: StageContext = {
      messageId: message._id,
      conversationId: message.conversation,
      specialty,
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
   * Process audio message: Transcribe → Clean → Redact PII
   */
  private async processAudioMessage(message: Message, context: StageContext): Promise<void> {
    const messageId = message._id;
    const media = message.media as unknown as Media;

    // Update status to TRANSCRIBING
    if (!(await this.applyUpdate(messageId, { status: MessageStatus.TRANSCRIBING }))) return;

    // Get presigned URL for the audio
    const audioUrl = await this.mediaService.getPresignedUrl(media.xid);

    // Stage 1: Transcription
    this.logger.info(`Transcribing audio for message ${message.xid}`);
    const transcriptionResult: TranscriptionStageResult = await this.transcriptionStage.execute(
      audioUrl,
      context
    );

    // Update with raw transcript and transcription metadata
    const cleaningAlive = await this.applyUpdate(messageId, {
      rawContent: transcriptionResult.text,
      status: MessageStatus.CLEANING,
      transcription: transcriptionResult.transcription,
    });
    if (!cleaningAlive) return;

    // Stage 2: Cleaning
    this.logger.info(`Cleaning transcript for message ${message.xid}`);
    const cleaningResult = await this.cleaningStage.execute(transcriptionResult.text, context);

    // Update with cleaned content
    const deidentifyAlive = await this.applyUpdate(messageId, {
      cleanedContent: cleaningResult.text,
      status: MessageStatus.DEIDENTIFYING,
    });
    if (!deidentifyAlive) return;

    // Stage 3: PII Redaction (regex + LLM)
    const redactedContent = await this.redactPii(cleaningResult.text, context);

    // Update with final redacted content
    if (
      !(await this.applyUpdate(messageId, {
        content: redactedContent,
        status: MessageStatus.COMPLETE,
      }))
    )
      return;

    this.logger.info(`Message processing complete for ${message.xid}`);
  }

  /**
   * Process text message: Clean → Redact PII
   */
  private async processTextMessage(message: Message, context: StageContext): Promise<void> {
    const messageId = message._id;

    // Update status to CLEANING
    if (!(await this.applyUpdate(messageId, { status: MessageStatus.CLEANING }))) return;

    // Stage 1: Cleaning
    this.logger.info(`Cleaning text for message ${message.xid}`);
    if (!message.rawContent) {
      await this.markFailed(messageId, 'No raw content to clean');
      return;
    }
    const cleaningResult = await this.cleaningStage.execute(message.rawContent, context);

    // Update with cleaned content
    const deidentifyAlive = await this.applyUpdate(messageId, {
      cleanedContent: cleaningResult.text,
      status: MessageStatus.DEIDENTIFYING,
    });
    if (!deidentifyAlive) return;

    // Stage 2: PII Redaction (regex + LLM)
    const redactedContent = await this.redactPii(cleaningResult.text, context);

    // Update with final redacted content
    if (
      !(await this.applyUpdate(messageId, {
        content: redactedContent,
        status: MessageStatus.COMPLETE,
      }))
    )
      return;

    this.logger.info(`Message processing complete for ${message.xid}`);
  }

  /**
   * Run PII redaction: regex for structured PII, then LLM for names/orgs/locations.
   * Shared by both audio and text processing paths.
   */
  private async redactPii(text: string, context: StageContext): Promise<string> {
    this.logger.info(`Redacting PII for message ${context.messageId}`);
    const redactionResult = await this.redactionStage.execute(text, context);
    return redactionResult.text;
  }

  /**
   * Apply a message update that must not resurrect a tombstoned row. The repo
   * filters out DELETED messages, so a null result means the message was deleted
   * (a delete raced this in-flight pipeline). Returns true while the message is
   * still live, false once it's gone — callers short-circuit to stop spending
   * transcription/LLM budget on a doomed message.
   */
  private async applyUpdate(
    messageId: Types.ObjectId,
    data: UpdateMessageData
  ): Promise<boolean> {
    const result = await this.conversationsRepository.updateMessage(messageId, data);
    if (isErr(result)) {
      throw new Error(result.error.message);
    }
    if (!result.value) {
      this.logger.warn(`Halting processing for message ${messageId} — deleted mid-pipeline`);
      return false;
    }
    return true;
  }

  private async markFailed(messageId: Types.ObjectId, error: string): Promise<void> {
    await this.conversationsRepository.updateMessage(messageId, {
      status: MessageStatus.FAILED,
      processingError: error,
    });
  }
}
