import { Module } from '@nestjs/common';
import { LLMService } from './llm.service';
import { ModelConfigService } from './model-config.service';

@Module({
  providers: [LLMService, ModelConfigService],
  exports: [LLMService, ModelConfigService],
})
export class LLMModule {}
