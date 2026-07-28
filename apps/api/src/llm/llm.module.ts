import { Module } from '@nestjs/common';
import { LlmEndpointResolver } from './llm-endpoint.resolver';
import { LlmRateLimiterService } from './llm-rate-limiter.service';
import { LLMService } from './llm.service';
import { ModelConfigService } from './model-config.service';

@Module({
  providers: [LLMService, ModelConfigService, LlmRateLimiterService, LlmEndpointResolver],
  exports: [LLMService, ModelConfigService],
})
export class LLMModule {}
