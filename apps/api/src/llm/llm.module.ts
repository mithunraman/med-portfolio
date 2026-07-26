import { Module } from '@nestjs/common';
import { LlmRateLimiterService } from './llm-rate-limiter.service';
import { LLMService } from './llm.service';
import { ModelConfigService } from './model-config.service';

@Module({
  providers: [LLMService, ModelConfigService, LlmRateLimiterService],
  exports: [LLMService, ModelConfigService],
})
export class LLMModule {}
