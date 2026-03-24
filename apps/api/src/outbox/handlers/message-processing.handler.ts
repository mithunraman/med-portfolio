import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { ProcessingService } from '../../processing/processing.service';
import type { OutboxHandler } from '../outbox.consumer';

export interface MessageProcessingPayload {
  messageId: string;
}

@Injectable()
export class MessageProcessingHandler implements OutboxHandler {
  readonly type = 'message.process';
  private readonly logger = new Logger(MessageProcessingHandler.name);

  constructor(private readonly processingService: ProcessingService) {}

  async handle(payload: Record<string, unknown>): Promise<void> {
    const data = payload as unknown as MessageProcessingPayload;
    this.logger.log(`Processing message ${data.messageId} via outbox`);
    await this.processingService.processMessage(new Types.ObjectId(data.messageId));
  }
}
