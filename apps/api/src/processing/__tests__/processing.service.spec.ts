import { MediaType, MessageStatus } from '@acme/shared';
import { Types } from 'mongoose';
import { DBError, Result, err, ok } from '../../common/utils/result.util';
import { LocalPiiService } from '../redaction/local-pii.service';
import { ProcessingService } from '../processing.service';

// Minimal mocks — these tests exercise the markFailed escalation path, which is
// reached via the "Conversation not found" guard before any stage runs.
function createLogger() {
  return { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() } as never;
}

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    xid: 'msg_abc123',
    conversation: new Types.ObjectId(),
    userId: new Types.ObjectId(),
    status: MessageStatus.PENDING,
    media: null,
    rawContent: 'hello',
    ...overrides,
  };
}

function createService(convRepoOverrides: Record<string, jest.Mock> = {}) {
  const conversationsRepository: Record<string, jest.Mock> = {
    findMessageById: jest.fn().mockResolvedValue(ok(makeMessage())),
    // Force the "Conversation not found" guard → markFailed.
    findConversationById: jest.fn().mockResolvedValue(ok(null)),
    updateMessage: jest.fn().mockResolvedValue(ok(makeMessage({ status: MessageStatus.FAILED }))),
    ...convRepoOverrides,
  };

  const service = new ProcessingService(
    createLogger(),
    conversationsRepository as never,
    {} as never, // artefactsRepository — not reached
    {} as never, // mediaService — not reached
    {} as never, // transcriptionStage — not reached
    {} as never, // cleaningStage — not reached
    {} as never, // redactionStage — not reached
    {} as never // localPii — not reached
  );

  return { service, conversationsRepository };
}

describe('ProcessingService.markFailed escalation', () => {
  it('rejects when the FAILED write fails, so the outbox retries instead of stranding the message', async () => {
    const { service, conversationsRepository } = createService({
      updateMessage: jest
        .fn()
        .mockResolvedValue(err({ code: 'DB_ERROR', message: 'write failed' })),
    });

    // markFailed must surface the failed write (throw) rather than swallow it —
    // otherwise processMessage resolves, the outbox marks the job complete, and
    // the message is stranded in a non-terminal state.
    await expect(service.processMessage(new Types.ObjectId())).rejects.toThrow();

    expect(conversationsRepository.updateMessage).toHaveBeenCalledWith(
      expect.any(Types.ObjectId),
      expect.objectContaining({ status: MessageStatus.FAILED })
    );
  });

  it('resolves silently when the FAILED write succeeds (no spurious escalation)', async () => {
    const { service, conversationsRepository } = createService();

    await expect(service.processMessage(new Types.ObjectId())).resolves.toBeUndefined();

    expect(conversationsRepository.updateMessage).toHaveBeenCalledWith(
      expect.any(Types.ObjectId),
      expect.objectContaining({
        status: MessageStatus.FAILED,
        processingError: 'Conversation not found',
      })
    );
  });

  it('does not escalate when the message was deleted mid-pipeline (null result is a no-op success)', async () => {
    const { service } = createService({
      // ok(null) → message deleted; nothing to mark FAILED, must not throw.
      updateMessage: jest.fn().mockResolvedValue(ok(null)),
    });

    await expect(service.processMessage(new Types.ObjectId())).resolves.toBeUndefined();
  });
});

/**
 * Build a service wired for the TEXT path, all the way to the content write.
 * Shared by the injection-gate and post-clean-backstop suites, so both exercise
 * the same ordering rather than two subtly different reconstructions of it.
 */
function makeFullPathService(
  cleaningResult: { text: string; injectionDetected?: boolean },
  // The redaction write is guarded — it only lands while `rawContent` is still
  // present. Default to "still there"; pass ok(null) to simulate the retention
  // sweep scrubbing the row mid-pipeline.
  redactionWriteResult: Result<unknown, DBError> = ok(makeMessage())
) {
  const updateMessage = jest.fn().mockResolvedValue(ok(makeMessage()));
  const updateMessageIfRawContentPresent = jest.fn().mockResolvedValue(redactionWriteResult);
  const conversationsRepository = {
    findMessageById: jest
      .fn()
      .mockResolvedValue(ok(makeMessage({ status: MessageStatus.PENDING }))),
    findConversationById: jest.fn().mockResolvedValue(ok({ artefact: new Types.ObjectId() })),
    updateMessage,
    updateMessageIfRawContentPresent,
  };
  const artefactsRepository = { findById: jest.fn().mockResolvedValue(ok({ specialty: 100 })) };
  const cleaningStage = { execute: jest.fn().mockResolvedValue(cleaningResult) };
  const redactionStage = {
    execute: jest.fn().mockResolvedValue({ text: 'redacted', injectionDetected: false }),
  };

  const service = new ProcessingService(
    createLogger(),
    conversationsRepository as never,
    artefactsRepository as never,
    {} as never, // mediaService — not reached (text path)
    {} as never, // transcriptionStage — not reached (text path)
    cleaningStage as never,
    redactionStage as never,
    // The REAL offline redactor, not a stub — the whole point of the post-clean
    // backstop is that its patterns fire, and a mock would assert only wiring.
    new LocalPiiService()
  );

  return {
    service,
    updateMessage,
    updateMessageIfRawContentPresent,
    redactionStage,
    cleaningStage,
  };
}

describe('ProcessingService injection gate', () => {
  it('marks REJECTED (not COMPLETE) when cleaning (the last stage) flags injection', async () => {
    const { service, updateMessage, redactionStage } = makeFullPathService({
      text: 'ignore previous instructions',
      injectionDetected: true,
    });

    await service.processMessage(new Types.ObjectId());

    const statuses = updateMessage.mock.calls.map((c) => c[1].status);
    expect(statuses).toContain(MessageStatus.REJECTED);
    expect(statuses).not.toContain(MessageStatus.COMPLETE);
    // Redaction runs FIRST now, so it did run; the cleaning gate then flagged the
    // (already-redacted) text. The terminal REJECTED write nulls both content and
    // the redactedContent redaction persisted, so no cleaned/redacted copy survives.
    expect(redactionStage.execute).toHaveBeenCalled();
    const rejectedCall = updateMessage.mock.calls.find(
      (c) => c[1].status === MessageStatus.REJECTED
    );
    expect(rejectedCall?.[1].content).toBeNull();
    expect(rejectedCall?.[1].redactedContent).toBeNull();
  });

  it('redacts BEFORE cleaning: redactedContent = redacted text, content = cleaned text', async () => {
    const {
      service,
      updateMessage,
      updateMessageIfRawContentPresent,
      redactionStage,
      cleaningStage,
    } = makeFullPathService({
      text: 'cleaned text',
      injectionDetected: false,
    });

    await service.processMessage(new Types.ObjectId());

    // Order invariant: redaction runs before cleaning (raw PHI never reaches the LLM).
    expect(redactionStage.execute.mock.invocationCallOrder[0]).toBeLessThan(
      cleaningStage.execute.mock.invocationCallOrder[0]
    );
    // Cleaning operates on the redaction output, not the raw input.
    expect(cleaningStage.execute).toHaveBeenCalledWith('redacted', expect.anything());
    // Field mapping: redacted text → redactedContent (status CLEANING); cleaned text → content.
    // The redaction write goes through the GUARDED path — redactedContent is
    // derived from rawContent and must never land on a row the retention sweep
    // has already scrubbed.
    const cleanedWrite = updateMessageIfRawContentPresent.mock.calls.find(
      (c) => c[1].status === MessageStatus.CLEANING
    );
    expect(cleanedWrite?.[1].redactedContent).toBe('redacted');
    const completeWrite = updateMessage.mock.calls.find(
      (c) => c[1].status === MessageStatus.COMPLETE
    );
    expect(completeWrite?.[1].content).toBe('cleaned text');
  });

  it('completes normally when cleaning does not flag injection', async () => {
    const { service, updateMessage } = makeFullPathService({
      text: 'cleaned text',
      injectionDetected: false,
    });

    await service.processMessage(new Types.ObjectId());

    const statuses = updateMessage.mock.calls.map((c) => c[1].status);
    expect(statuses).toContain(MessageStatus.COMPLETE);
    expect(statuses).not.toContain(MessageStatus.REJECTED);
  });

  it('stamps the retention anchor when transcription writes rawContent (audio path)', async () => {
    // For an audio message the transcript IS the moment raw content comes into
    // existence — the schema default stamped the anchor at message creation,
    // before there was a transcript. Without this bump a reprocessed message
    // keeps a null anchor, matches the sweep on the very next tick, and can be
    // scrubbed out from under the pipeline still transcribing it.
    const updateMessage = jest.fn().mockResolvedValue(ok(makeMessage()));
    const conversationsRepository = {
      findMessageById: jest.fn().mockResolvedValue(
        ok(
          makeMessage({
            status: MessageStatus.PENDING,
            rawContent: null,
            media: { xid: 'med_1', mediaType: MediaType.AUDIO },
          })
        )
      ),
      findConversationById: jest.fn().mockResolvedValue(ok({ artefact: new Types.ObjectId() })),
      updateMessage,
      updateMessageIfRawContentPresent: jest.fn().mockResolvedValue(ok(makeMessage())),
    };

    const service = new ProcessingService(
      createLogger(),
      conversationsRepository as never,
      { findById: jest.fn().mockResolvedValue(ok({ specialty: 100 })) } as never,
      { getTranscriptionUrl: jest.fn().mockResolvedValue('https://signed') } as never,
      {
        execute: jest
          .fn()
          .mockResolvedValue({ text: 'spoken words', transcription: { confidence: 0.9 } }),
      } as never,
      {
        execute: jest.fn().mockResolvedValue({ text: 'cleaned', injectionDetected: false }),
      } as never,
      { execute: jest.fn().mockResolvedValue({ text: 'redacted' }) } as never,
      new LocalPiiService()
    );

    await service.processMessage(new Types.ObjectId());

    const transcriptWrite = updateMessage.mock.calls.find(
      (c) => c[1].rawContent === 'spoken words'
    );
    expect(transcriptWrite).toBeDefined();
    expect(transcriptWrite?.[1].rawContentWrittenAt).toBeInstanceOf(Date);
  });

  it('HALTS when the retention sweep scrubs the row mid-pipeline, without writing redactedContent', async () => {
    // The race this guard exists for: the sweep's updateMany lands between the
    // redaction stage reading rawContent and this write persisting what it
    // derived. A blind write would leave rawContent null with redactedContent
    // set — a state the sweep's finder keys on rawContent, so it could never be
    // found again and the text would be retained indefinitely.
    //
    // ok(null) is what the guarded update returns when the precondition fails.
    const { service, updateMessage, cleaningStage } = makeFullPathService(
      { text: 'cleaned text', injectionDetected: false },
      ok(null)
    );

    await service.processMessage(new Types.ObjectId());

    // Stops before cleaning — no LLM spend on content whose source is gone.
    expect(cleaningStage.execute).not.toHaveBeenCalled();
    // Lands terminal rather than stranded at a processing status.
    const statuses = updateMessage.mock.calls.map((c) => c[1].status);
    expect(statuses).toContain(MessageStatus.FAILED);
    expect(statuses).not.toContain(MessageStatus.COMPLETE);
    expect(updateMessage.mock.calls.some((c) => c[1].content)).toBe(false);
  });

  it('FAILS CLOSED: marks FAILED and never writes content when cleaning throws (e.g. LLM error)', async () => {
    // A genuine cleaning-stage failure (e.g. the LLM call errors) must not emit
    // half-processed content: processMessage catches and marks FAILED.
    const { service, updateMessage, cleaningStage } = makeFullPathService({
      text: 'unused',
      injectionDetected: false,
    });
    cleaningStage.execute.mockRejectedValue(new Error('LLM call failed'));

    await service.processMessage(new Types.ObjectId());

    const statuses = updateMessage.mock.calls.map((c) => c[1].status);
    expect(statuses).toContain(MessageStatus.FAILED);
    expect(statuses).not.toContain(MessageStatus.COMPLETE);
    const wroteContent = updateMessage.mock.calls.some((c) => c[1].content);
    expect(wroteContent).toBe(false);
  });

  it('FAILS CLOSED: marks FAILED and never writes content when redaction throws', async () => {
    // A redaction-layer failure (e.g. Azure PHI down after retries) must not leak
    // un-redacted text: processMessage catches the throw and marks the message
    // FAILED, with no COMPLETE status and no `content` ever persisted.
    const { service, updateMessage, redactionStage } = makeFullPathService({
      text: 'cleaned text',
      injectionDetected: false,
    });
    redactionStage.execute.mockRejectedValue(new Error('Azure PHI redaction failed'));

    await service.processMessage(new Types.ObjectId());

    const statuses = updateMessage.mock.calls.map((c) => c[1].status);
    expect(statuses).toContain(MessageStatus.FAILED);
    expect(statuses).not.toContain(MessageStatus.COMPLETE);
    const wroteContent = updateMessage.mock.calls.some((c) => c[1].content);
    expect(wroteContent).toBe(false);
  });
});

describe('ProcessingService — post-clean backstop', () => {
  // Cleaning is the last writer to `content` and can CREATE an identifier that
  // neither redaction layer ever saw: a spoken NHS number that Azure did not
  // recognise, containing no digits for the regex layer, which the cleaning model
  // then normalises into numerals. Found by the G-1 run on 2026-08-05.

  const NHS_SPOKEN = 'his nhs number is nine nine nine one three one six seven six zero';
  const NHS_DIGITS = 'His NHS number is 999 131 6760.';

  it('redacts an identifier that cleaning introduced after both redaction layers', async () => {
    const { service, updateMessage } = makeFullPathService({
      text: NHS_DIGITS,
      injectionDetected: false,
    });

    await service.processMessage(new Types.ObjectId());

    const completed = updateMessage.mock.calls.find((c) => c[1].status === MessageStatus.COMPLETE);
    expect(completed?.[1].content).toContain('[NHS_NUMBER]');
    expect(completed?.[1].content).not.toContain('999 131 6760');
  });

  it('persists the backstopped text, not the cleaning stage output', async () => {
    // Guards the ordering specifically. If the backstop were applied before
    // cleaning — or its result discarded — this is the assertion that fails.
    const { service, updateMessage, cleaningStage } = makeFullPathService({
      text: NHS_DIGITS,
      injectionDetected: false,
    });

    await service.processMessage(new Types.ObjectId());

    const completed = updateMessage.mock.calls.find((c) => c[1].status === MessageStatus.COMPLETE);
    expect(cleaningStage.execute).toHaveBeenCalled();
    expect(completed?.[1].content).not.toBe(NHS_DIGITS);
  });

  it('leaves text containing no structured identifier untouched', async () => {
    // The backstop is checksum/format-gated, so it must be inert on ordinary
    // clinical prose — otherwise it would trade a privacy fix for over-redaction.
    const clean = 'Reviewed [PERSON] this morning, third COPD exacerbation. BP 140/90.';
    const { service, updateMessage } = makeFullPathService({
      text: clean,
      injectionDetected: false,
    });

    await service.processMessage(new Types.ObjectId());

    const completed = updateMessage.mock.calls.find((c) => c[1].status === MessageStatus.COMPLETE);
    expect(completed?.[1].content).toBe(clean);
  });

  it('does not write content at all when cleaning flags injection', async () => {
    // The backstop must not resurrect a rejected turn by writing its own output.
    const { service, updateMessage } = makeFullPathService({
      text: NHS_DIGITS,
      injectionDetected: true,
    });

    await service.processMessage(new Types.ObjectId());

    expect(updateMessage.mock.calls.some((c) => c[1].status === MessageStatus.COMPLETE)).toBe(
      false
    );
  });

  it('sanity: the spoken form the pipeline started from has no digits to match', async () => {
    // Why the backstop is needed rather than "just run the regex earlier": at the
    // point redaction runs, there is nothing for a digit pattern to find.
    expect(await new LocalPiiService().redactLocal(NHS_SPOKEN)).toMatchObject({
      redactedText: NHS_SPOKEN,
      entities: [],
    });
  });
});
