import { forwardRef, Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module';
import { LLMModule } from '../llm';
import { PortfolioGraphService } from './portfolio-graph.service';

@Module({
  imports: [
    LLMModule,
    forwardRef(() => ConversationsModule),
  ],
  providers: [PortfolioGraphService],
  exports: [PortfolioGraphService],
})
export class PortfolioGraphModule {}
