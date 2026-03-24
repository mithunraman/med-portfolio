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
    const processMessage = jest.fn().mockResolvedValue(undefined);
    const { handler } = createHandler({ processMessage });

    await handler.handle({ messageId: messageId.toString() });

    expect(processMessage).toHaveBeenCalledTimes(1);
    expect(processMessage).toHaveBeenCalledWith(
      expect.objectContaining({ _bsontype: 'ObjectId' })
    );
    expect(processMessage.mock.calls[0][0].toString()).toBe(messageId.toString());
  });

  it('should propagate errors so the outbox consumer can retry', async () => {
    const processMessage = jest.fn().mockRejectedValue(new Error('Transcription timeout'));
    const { handler } = createHandler({ processMessage });

    await expect(
      handler.handle({ messageId: new Types.ObjectId().toString() })
    ).rejects.toThrow('Transcription timeout');
  });
});
