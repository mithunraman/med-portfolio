import { Types } from 'mongoose';
import { ProcessingService } from '../../../processing/processing.service';
import { MessageProcessingHandler } from '../message-processing.handler';

function createHandler(overrides: { processMessage?: jest.Mock } = {}) {
  const processingService = {
    processMessage: overrides.processMessage ?? jest.fn().mockResolvedValue(undefined),
  } as unknown as ProcessingService;

  return {
    handler: new MessageProcessingHandler(processingService),
    mocks: { processingService },
  };
}

describe('MessageProcessingHandler', () => {
  it('should have type "message.process"', () => {
    const { handler } = createHandler();
    expect(handler.type).toBe('message.process');
  });

  it('should call processingService.processMessage with the correct ObjectId', async () => {
    const messageId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const processMessage = jest.fn().mockResolvedValue(undefined);
    const { handler } = createHandler({ processMessage });

    await handler.handle({ messageId: messageId.toString(), userId: userId.toString() });

    expect(processMessage).toHaveBeenCalledTimes(1);
    expect(processMessage).toHaveBeenCalledWith(
      expect.objectContaining({ _bsontype: 'ObjectId' }),
      expect.objectContaining({ _bsontype: 'ObjectId' })
    );
    expect(processMessage.mock.calls[0][0].toString()).toBe(messageId.toString());
  });

  it('should propagate errors so the outbox consumer can retry', async () => {
    const processMessage = jest.fn().mockRejectedValue(new Error('Transcription timeout'));
    const { handler } = createHandler({ processMessage });

    await expect(
      handler.handle({
        messageId: new Types.ObjectId().toString(),
        userId: new Types.ObjectId().toString(),
      })
    ).rejects.toThrow('Transcription timeout');
  });

  /**
   * `new Types.ObjectId(undefined)` mints a random id instead of throwing, so a
   * payload missing a field used to produce a valid-looking ObjectId that matched
   * nothing. The handler then returned normally and the consumer marked the job
   * COMPLETED — a broken job laundered into a success, with the message left at
   * PENDING and the conversation's send/analyse guards blocked forever.
   *
   * Rejecting instead routes into the outbox's bounded-retry → dead-letter →
   * Sentry path. Note this buys visibility, not availability: the message is still
   * stranded either way.
   *
   * Both tests below passed before the guard existed — that is what made the
   * failure invisible.
   */
  describe('payload validation', () => {
    it.each(['userId', 'messageId'])(
      'rejects and never invokes the pipeline when %s is absent',
      async (field) => {
        const processMessage = jest.fn().mockResolvedValue(undefined);
        const { handler } = createHandler({ processMessage });

        const payload: Record<string, unknown> = {
          messageId: new Types.ObjectId().toString(),
          userId: new Types.ObjectId().toString(),
        };
        delete payload[field];

        await expect(handler.handle(payload)).rejects.toThrow(
          `message.process: payload.${field} is missing or not a string`
        );
        expect(processMessage).not.toHaveBeenCalled();
      }
    );

    it('rejects an explicitly null id rather than minting one', async () => {
      const processMessage = jest.fn().mockResolvedValue(undefined);
      const { handler } = createHandler({ processMessage });

      await expect(
        handler.handle({ messageId: new Types.ObjectId().toString(), userId: null })
      ).rejects.toThrow('payload.userId is missing or not a string (got null)');
      expect(processMessage).not.toHaveBeenCalled();
    });
  });
});
