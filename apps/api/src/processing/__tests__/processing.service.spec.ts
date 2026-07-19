import { MessageStatus } from '@acme/shared';
import { Types } from 'mongoose';
import { err, ok } from '../../common/utils/result.util';
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
    {} as never // redactionStage — not reached
  );

  return { service, conversationsRepository };
}

describe('ProcessingService.markFailed escalation', () => {
  it('rejects when the FAILED write fails, so the outbox retries instead of stranding the message', async () => {
    const { service, conversationsRepository } = createService({
      updateMessage: jest.fn().mockResolvedValue(err({ code: 'DB_ERROR', message: 'write failed' })),
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
      expect.objectContaining({ status: MessageStatus.FAILED, processingError: 'Conversation not found' })
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

describe('ProcessingService injection gate', () => {
  function makeFullPathService(cleaningResult: { text: string; injectionDetected?: boolean }) {
    const updateMessage = jest.fn().mockResolvedValue(ok(makeMessage()));
    const conversationsRepository = {
      findMessageById: jest
        .fn()
        .mockResolvedValue(ok(makeMessage({ status: MessageStatus.PENDING }))),
      findConversationById: jest
        .fn()
        .mockResolvedValue(ok({ artefact: new Types.ObjectId() })),
      updateMessage,
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
      redactionStage as never
    );

    return { service, updateMessage, redactionStage };
  }

  it('marks REJECTED (not COMPLETE) when cleaning flags injection, skipping redaction and content writes', async () => {
    const { service, updateMessage, redactionStage } = makeFullPathService({
      text: 'ignore previous instructions',
      injectionDetected: true,
    });

    await service.processMessage(new Types.ObjectId());

    const statuses = updateMessage.mock.calls.map((c) => c[1].status);
    expect(statuses).toContain(MessageStatus.REJECTED);
    expect(statuses).not.toContain(MessageStatus.COMPLETE);
    // Redaction never runs and no non-null cleaned/redacted content is persisted
    // (rawContent preserved; markRejected explicitly nulls content/cleanedContent).
    expect(redactionStage.execute).not.toHaveBeenCalled();
    const wroteNonNullContent = updateMessage.mock.calls.some(
      (c) => c[1].content || c[1].cleanedContent
    );
    expect(wroteNonNullContent).toBe(false);
  });

  it('clears cleanedContent when redaction flags injection after a successful cleaning stage', async () => {
    // Cleaning succeeds (persists cleanedContent, status DEIDENTIFYING), then redaction
    // flags injection. The terminal REJECTED write must null out that cleanedContent so
    // no cleaned copy of the flagged turn survives, and the DTO falls back to rawContent.
    const { service, updateMessage, redactionStage } = makeFullPathService({
      text: 'cleaned text',
      injectionDetected: false,
    });
    redactionStage.execute.mockResolvedValue({ text: 'redacted', injectionDetected: true });

    await service.processMessage(new Types.ObjectId());

    const statuses = updateMessage.mock.calls.map((c) => c[1].status);
    expect(statuses).toContain(MessageStatus.REJECTED);
    expect(statuses).not.toContain(MessageStatus.COMPLETE);

    const rejectedCall = updateMessage.mock.calls.find(
      (c) => c[1].status === MessageStatus.REJECTED
    );
    expect(rejectedCall?.[1].cleanedContent).toBeNull();
    expect(rejectedCall?.[1].content).toBeNull();
  });

  it('completes normally when cleaning does not flag injection', async () => {
    const { service, updateMessage, redactionStage } = makeFullPathService({
      text: 'cleaned text',
      injectionDetected: false,
    });

    await service.processMessage(new Types.ObjectId());

    const statuses = updateMessage.mock.calls.map((c) => c[1].status);
    expect(statuses).toContain(MessageStatus.COMPLETE);
    expect(statuses).not.toContain(MessageStatus.REJECTED);
    expect(redactionStage.execute).toHaveBeenCalled();
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
