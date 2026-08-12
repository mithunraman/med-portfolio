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
import { LocalPiiService } from './redaction/local-pii.service';
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
    private readonly redactionStage: RedactionStage,
    private readonly localPii: LocalPiiService
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
      message.status === MessageStatus.FAILED ||
      message.status === MessageStatus.REJECTED
    ) {
      this.logger.info(`Message ${messageId} already ${message.status}, skipping`);
      return;
    }

    // Look up artefact via conversation to get specialty
    const convResult = await this.conversationsRepository.findConversationById(
      message.conversation,
      message.userId
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
   * Process audio message: Transcribe → Redact PII → Clean
   */
  private async processAudioMessage(message: Message, context: StageContext): Promise<void> {
    const messageId = message._id;
    const media = message.media as unknown as Media;

    // Update status to TRANSCRIBING
    if (!(await this.applyUpdate(messageId, { status: MessageStatus.TRANSCRIBING }))) return;

    // Get presigned URL for the audio. Short-lived: this URL is sent to the
    // transcription provider and unlocks un-redacted audio.
    const audioUrl = await this.mediaService.getTranscriptionUrl(
      message.userId.toString(),
      media.xid
    );

    // Stage 1: Transcription
    this.logger.info(`Transcribing audio for message ${message.xid}`);
    const transcriptionResult: TranscriptionStageResult = await this.transcriptionStage.execute(
      audioUrl,
      context
    );

    // Update with raw transcript and transcription metadata. Redaction runs
    // next, so the message enters DEIDENTIFYING.
    const stillAlive = await this.applyUpdate(messageId, {
      rawContent: transcriptionResult.text,
      // This IS the moment raw content comes into existence for an audio message
      // — the schema default stamped the anchor at message creation, before the
      // transcript existed. Bumping it keeps the field honest and starts the
      // retention clock from the write rather than from the upload.
      //
      // It also matters for a reprocessed message: after a scrub the anchor is
      // null, so without this the row would match the sweep on the very next
      // tick and could be scrubbed out from under the pipeline that is still
      // transcribing it.
      rawContentWrittenAt: new Date(),
      status: MessageStatus.DEIDENTIFYING,
      transcription: transcriptionResult.transcription,
    });
    if (!stillAlive) return;

    // Stages 2-3: Redact → Clean → COMPLETE (or REJECTED on injection)
    await this.redactCleanAndComplete(messageId, transcriptionResult.text, context);
  }

  /**
   * Process text message: Redact PII → Clean
   */
  private async processTextMessage(message: Message, context: StageContext): Promise<void> {
    const messageId = message._id;

    if (!message.rawContent) {
      await this.markFailed(messageId, 'No raw content to process');
      return;
    }

    // Redaction runs first, so the message enters DEIDENTIFYING.
    if (!(await this.applyUpdate(messageId, { status: MessageStatus.DEIDENTIFYING }))) return;

    // Stages 1-2: Redact → Clean → COMPLETE (or REJECTED on injection)
    await this.redactCleanAndComplete(messageId, message.rawContent, context);
  }

  /**
   * Shared tail for both processing paths: Redact → Clean → COMPLETE.
   *
   * Redaction runs FIRST so the only text the (US-hosted) cleaning LLM ever sees
   * is already Azure-PHI-redacted — raw PHI never crosses the residency boundary.
   * The redacted output is persisted to `redactedContent` (a redacted-at-rest
   * intermediate, consistent with how the edit path uses that field); the cleaning
   * stage then produces the final display `content`.
   *
   * Injection gate: detection lives on the cleaning stage, which now runs LAST.
   * If it flags the (already-redacted) input, the message is marked REJECTED and
   * no cleaned/redacted content survives — markRejected nulls both content and the
   * redactedContent that redaction persisted a moment earlier; rawContent is kept.
   * This keeps the flagged turn out of the AI transcript (gather-context filters
   * status===COMPLETE) without substituting a sentinel string into content.
   *
   * Fail-closed: the redaction stage throws on an Azure failure; the processMessage
   * catch marks the message FAILED, before any cleaning spend, so un-redacted text
   * can never reach `content`.
   */
  private async redactCleanAndComplete(
    messageId: Types.ObjectId,
    input: string,
    context: StageContext
  ): Promise<void> {
    // Stage: PII Redaction (Azure PHI + offline backstop). Runs on raw text.
    this.logger.info(`Redacting PII for message ${messageId}`);
    const redaction = await this.redactionStage.execute(input, context);
    // Guarded, not a plain applyUpdate: `redactedContent` is DERIVED from
    // `rawContent`, and the retention sweep can clear `rawContent` while the
    // Azure call above is in flight. A blind write would then leave a row with
    // `rawContent: null` and `redactedContent` set — a state the sweep's
    // predicate keys on `rawContent`, so it can never be found again and the
    // text is retained forever. The precondition is folded into the query so it
    // is atomic with the write.
    if (
      !(await this.applyDerivedUpdate(messageId, {
        redactedContent: redaction.text,
        status: MessageStatus.CLEANING,
      }))
    )
      return;

    // Stage: Cleaning — runs on redacted text (only ever sees placeholders, never
    // raw PHI). Also the injection gate.
    this.logger.info(`Cleaning text for message ${messageId}`);
    const cleaningResult = await this.cleaningStage.execute(redaction.text, context);
    if (cleaningResult.injectionDetected) return this.markRejected(messageId);

    // Backstop: re-run the offline structured-identifier redactor on the CLEANED
    // text, because cleaning is the last writer to `content` and can CREATE an
    // identifier that neither redaction layer ever saw.
    //
    // Found by the G-1 measurement on 2026-08-05. A trainee spoke an NHS number
    // ("nine nine nine one three one..."); Azure did not recognise the spoken
    // form, the regex layer saw no digits, and the cleaning model then normalised
    // it into numerals — downstream of everything that could have removed it.
    // Every layer behaved correctly; the gap was in the ORDERING, which is a
    // consequence of the Redact→Clean reorder made for residency.
    //
    // Deliberately `redactLocal` (checksum/format-gated: NHS, CHI, NINO,
    // postcode, sort code + account) rather than the wider `redactStandalone`.
    // It is offline, deterministic and cannot itself hallucinate — the right
    // shape for a guard on a generative stage — and it cannot over-redact
    // clinical prose. It does NOT close the whole class: an identifier the model
    // garbles into an invalid form still gets through, and phone/email are not in
    // this set. See DPIA §6.3.
    //
    // Runs on whichever text cleaning actually returned, including its degraded
    // fallback — skipping the anomalous branch would skip exactly the cases most
    // likely to be wrong.
    const backstop = await this.localPii.redactLocal(cleaningResult.text);
    if (backstop.entities.length > 0) {
      this.logger.warn(
        `Post-clean backstop removed [${backstop.entities.map((e) => e.type).join(', ')}] ` +
          `for message ${messageId} — cleaning emitted an identifier redaction never saw`
      );
    }

    if (
      !(await this.applyUpdate(messageId, {
        content: backstop.redactedText,
        status: MessageStatus.COMPLETE,
      }))
    )
      return;

    this.logger.info(`Message processing complete for message ${messageId}`);
  }

  /**
   * Apply a message update that must not resurrect a tombstoned row. The repo
   * filters out DELETED messages, so a null result means the message was deleted
   * (a delete raced this in-flight pipeline). Returns true while the message is
   * still live, false once it's gone — callers short-circuit to stop spending
   * transcription/LLM budget on a doomed message.
   */
  private async applyUpdate(messageId: Types.ObjectId, data: UpdateMessageData): Promise<boolean> {
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

  /**
   * Apply an update that persists content **derived** from `rawContent`, and
   * that must not land on a row whose `rawContent` has been removed.
   *
   * The retention sweep (C-2) can clear `rawContent` at any moment, including
   * between a pipeline stage reading it and that stage writing its output. A
   * blind write in that window produces a row with `rawContent: null` and
   * `redactedContent` populated — and because the sweep's finder keys on
   * `rawContent`, such a row is invisible to every future sweep and its
   * redacted text is retained indefinitely. The precondition therefore lives in
   * the repository query, atomic with the write, rather than in a prior read.
   *
   * Unlike `applyUpdate`, a null result is marked FAILED rather than silently
   * abandoned. Deletion mid-pipeline leaves no row to care about; a scrub
   * mid-pipeline leaves a live row that would otherwise sit at a non-terminal
   * status forever. `markFailed` treats a missing row as a no-op success, so the
   * deleted case stays correct.
   */
  private async applyDerivedUpdate(
    messageId: Types.ObjectId,
    data: UpdateMessageData
  ): Promise<boolean> {
    const result = await this.conversationsRepository.updateMessageIfRawContentPresent(
      messageId,
      data
    );
    if (isErr(result)) {
      throw new Error(result.error.message);
    }
    if (!result.value) {
      this.logger.warn(
        `Halting processing for message ${messageId} — raw content deleted or scrubbed mid-pipeline`
      );
      await this.markFailed(messageId, 'Raw content no longer available');
      return false;
    }
    return true;
  }

  /**
   * Terminal REJECTED: the content was flagged as a prompt-injection attempt.
   * rawContent is preserved but content and redactedContent are explicitly cleared —
   * the redaction stage has already persisted redactedContent (the redacted text)
   * before the cleaning stage flags the injection, so nulling both here makes the
   * "no cleaned/redacted content survives" invariant hold. That keeps
   * the message out of the AI transcript (gather-context filters COMPLETE only) and
   * makes the DTO fall back to rawContent uniformly, so the UI shows the trainee's own
   * words on both rejection paths and renders "not added". Unlike markFailed this is a
   * deliberate rejection, not an error, so no processingError is set. A null result
   * (message deleted mid-pipeline) is a no-op success, mirroring markFailed.
   */
  private async markRejected(messageId: Types.ObjectId): Promise<void> {
    this.logger.warn(`Message ${messageId} flagged as prompt injection — marking REJECTED`);
    const result = await this.conversationsRepository.updateMessage(messageId, {
      status: MessageStatus.REJECTED,
      content: null,
      redactedContent: null,
    });
    if (isErr(result)) {
      throw new Error(
        `Failed to persist REJECTED status for message ${messageId}: ${result.error.message}`
      );
    }
  }

  private async markFailed(messageId: Types.ObjectId, error: string): Promise<void> {
    const result = await this.conversationsRepository.updateMessage(messageId, {
      status: MessageStatus.FAILED,
      processingError: error,
    });
    // Do not swallow a failed FAILED-write. If we returned silently, processMessage
    // would complete normally, the outbox would mark the job done, and the message
    // would be stranded in a non-terminal state (e.g. TRANSCRIBING) with the error
    // invisible. Throwing routes into the outbox's bounded retry + dead-letter +
    // Sentry path (capped at maxAttempts), so a transient write gets retried and a
    // persistent one is escalated rather than lost. Mirrors applyUpdate.
    // A null value (message deleted mid-pipeline) is a no-op success — there is no
    // live row to mark FAILED, and retrying would be pointless.
    if (isErr(result)) {
      this.logger.error(
        `Failed to mark message ${messageId} as FAILED (original error: ${error}): ${result.error.message}`
      );
      throw new Error(
        `Failed to persist FAILED status for message ${messageId}: ${result.error.message}`
      );
    }
  }
}
