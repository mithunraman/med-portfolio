import { Injectable, Logger } from '@nestjs/common';
import { ProcessingService } from '../../processing/processing.service';
import type { OutboxHandler } from '../outbox.consumer';
import { requiredObjectId } from './payload.util';

export interface MessageProcessingPayload {
  messageId: string;
  /** Owner of the message — every repository write in the pipeline is scoped by it. */
  userId: string;
}

@Injectable()
export class MessageProcessingHandler implements OutboxHandler {
  readonly type = 'message.process';
  private readonly logger = new Logger(MessageProcessingHandler.name);

  constructor(private readonly processingService: ProcessingService) {}

  async handle(payload: Record<string, unknown>): Promise<void> {
    // Validated, not cast: `new Types.ObjectId(undefined)` mints a random id
    // rather than throwing, which would turn a broken job into a silent success.
    // See `requiredObjectId`.
    const messageId = requiredObjectId(payload, 'messageId', this.type);
    const userId = requiredObjectId(payload, 'userId', this.type);

    this.logger.log(`Processing message ${messageId.toString()} via outbox`);
    await this.processingService.processMessage(messageId, userId);
  }
}
