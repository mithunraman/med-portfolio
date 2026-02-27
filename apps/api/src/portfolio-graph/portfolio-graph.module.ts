import { forwardRef, Module } from '@nestjs/common';
import { ArtefactsModule } from '../artefacts/artefacts.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { LLMModule } from '../llm';
import { PortfolioGraphService } from './portfolio-graph.service';

@Module({
  imports: [
    ArtefactsModule,
    LLMModule,
    forwardRef(() => ConversationsModule),
  ],
  providers: [PortfolioGraphService],
  exports: [PortfolioGraphService],
})
export class PortfolioGraphModule {}
