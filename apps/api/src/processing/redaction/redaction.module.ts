import { Module } from '@nestjs/common';
import { LocalPiiService } from './local-pii.service';

/**
 * Provides the offline structured-identifier redactor (OpenRedaction). Its own
 * module because two features consume it — the processing pipeline's redaction
 * stage and the message-edit path in ConversationsService — and LocalPiiService
 * has no dependencies, so sharing it this way introduces no DI cycle.
 */
@Module({
  providers: [LocalPiiService],
  exports: [LocalPiiService],
})
export class RedactionModule {}
