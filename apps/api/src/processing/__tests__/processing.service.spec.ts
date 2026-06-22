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
