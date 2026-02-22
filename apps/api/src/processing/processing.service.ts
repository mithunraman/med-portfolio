import {
  MediaType,
  MessageProcessingStatus,
  MessageRole,
  MessageType,
  Specialty,
} from '@acme/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { isErr } from '../common/utils/result.util';
import {
  CONVERSATIONS_REPOSITORY,
  IConversationsRepository,
} from '../conversations/conversations.repository.interface';
import { ConversationDocument } from '../conversations/schemas/conversation.schema';
import { MessageDocument } from '../conversations/schemas/message.schema';
import { MediaService } from '../media/media.service';
import { MediaDocument } from '../media/schemas/media.schema';
import { PortfolioGraphService } from '../portfolio-graph/portfolio-graph.service';
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
    private readonly cleaningStage: CleaningStage,
    private readonly portfolioGraphService: PortfolioGraphService
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
      mediaType: message.media ? (message.media as unknown as MediaDocument).mediaType : null,
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
    message: MessageDocument,
    context: StageContext
  ): Promise<void> {
    const messageId = message._id;
    const media = message.media as unknown as MediaDocument;

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

    this.logger.log(`Message processing complete for ${message.xid}, triggering portfolio graph`);

    // Layer 2: Portfolio graph (classification, reflection, etc.)
    await this.triggerPortfolioGraph(context.conversationId, message.userId);
  }

  /**
   * Process text message: Clean only
   * Note: Text from user input doesn't need transcription or PII redaction
   * (user is responsible for not including PII in manual text input)
   */
  private async processTextMessage(message: MessageDocument, context: StageContext): Promise<void> {
    const messageId = message._id;

    // Update status to CLEANING
    await this.updateStatus(messageId, MessageProcessingStatus.CLEANING);

    // Stage 1: Cleaning
    this.logger.log(`Cleaning text for message ${message.xid}`);
    const cleaningResult = await this.cleaningStage.execute(message.rawContent!, context);

    // Update with cleaned content (final)
    await this.conversationsRepository.updateMessage(messageId, {
      cleanedContent: cleaningResult.text,
      content: cleaningResult.text, // Final content
      processingStatus: MessageProcessingStatus.COMPLETE,
    });

    this.logger.log(`Message processing complete for ${message.xid}, triggering portfolio graph`);

    // Layer 2: Portfolio graph (classification, reflection, etc.)
    await this.triggerPortfolioGraph(context.conversationId, message.userId);
  }

  /**
   * Trigger the portfolio graph after message cleaning completes.
   *
   * Inspects which node the graph is paused at before deciding whether to resume:
   *  - ask_followup: resume — the user's content answers the follow-up question
   *  - present_classification / present_draft: DON'T resume — these need a structured
   *    response (entry type selection or approval), not free-form content.
   *    Send an acknowledgment so the doctor knows their input was noted.
   *  - null / unknown: DON'T resume — fail-safe to avoid corrupting graph state
   */
  private async triggerPortfolioGraph(
    conversationId: Types.ObjectId,
    userId: Types.ObjectId
  ): Promise<void> {
    const convIdStr = conversationId.toString();

    try {
      const hasCheckpoint = await this.portfolioGraphService.hasCheckpoint(convIdStr);

      if (hasCheckpoint) {
        const pausedNode = await this.portfolioGraphService.getPausedNode(convIdStr);

        if (pausedNode === 'ask_followup') {
          // Graph was paused waiting for user content — resume it
          this.logger.log(`Resuming portfolio graph for conversation ${convIdStr}`);
          await this.portfolioGraphService.resumeGraph(convIdStr, 'ask_followup');
        } else if (pausedNode === 'present_classification' || pausedNode === 'present_draft') {
          // Graph is waiting for a structured response (entry type selection or draft approval).
          // A content message can't satisfy these — leave the graph paused.
          // The new message will be picked up by gather_context on the next loop.
          this.logger.log(
            `Graph paused at "${pausedNode}" for conversation ${convIdStr} — ` +
              `content message noted, graph not resumed`
          );
          await this.sendPendingActionAcknowledgment(conversationId, userId, pausedNode);
        } else {
          // Unknown or no interrupt node — don't resume to avoid corrupting state
          this.logger.warn(
            `Graph checkpoint exists for conversation ${convIdStr} but ` +
              `paused node is "${pausedNode}" — skipping resume`
          );
        }
      } else {
        // First run — look up the artefact ID from the conversation
        const convResult = await this.conversationsRepository.findConversationById(conversationId);
        if (isErr(convResult) || !convResult.value) {
          this.logger.error(`Cannot find conversation ${convIdStr} to start portfolio graph`);
          return;
        }

        const conversation = convResult.value as ConversationDocument;
        await this.portfolioGraphService.startGraph({
          conversationId: convIdStr,
          artefactId: conversation.artefact.toString(),
          userId: userId.toString(),
          specialty: Specialty.GP.toString(),
        });
      }
    } catch (error) {
      // Portfolio graph errors should not fail the message processing
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Portfolio graph error for conversation ${convIdStr}: ${errorMessage}`);
    }
  }

  /**
   * Send an acknowledgment message when the doctor sends content while
   * the graph is waiting for a structured action (classification or approval).
   * Lets the doctor know their input was received without resuming the graph.
   */
  private async sendPendingActionAcknowledgment(
    conversationId: Types.ObjectId,
    userId: Types.ObjectId,
    pausedNode: 'present_classification' | 'present_draft'
  ): Promise<void> {
    const content =
      pausedNode === 'present_classification'
        ? "Got it, I've noted your additional details. Please select the entry type above to continue."
        : "Got it, I've noted your additional details. Please review the draft above to continue.";

    const result = await this.conversationsRepository.createMessage({
      conversation: conversationId,
      userId,
      role: MessageRole.ASSISTANT,
      messageType: MessageType.TEXT,
      rawContent: content,
      metadata: { type: 'pending_action_acknowledgment', pausedNode },
    });

    if (result.ok) {
      await this.conversationsRepository.updateMessage(result.value._id, {
        content,
        processingStatus: MessageProcessingStatus.COMPLETE,
      });
    }
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
