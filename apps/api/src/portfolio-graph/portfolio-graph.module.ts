import { forwardRef, Module } from '@nestjs/common';
import { ArtefactsModule } from '../artefacts/artefacts.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { DatabaseModule } from '../database';
import { LLMModule } from '../llm';
import { PdpActionsModule } from '../pdp-actions/pdp-actions.module';
import { PortfolioGraphService } from './portfolio-graph.service';

@Module({
  imports: [
    ArtefactsModule,
    DatabaseModule,
    LLMModule,
    PdpActionsModule,
    forwardRef(() => ConversationsModule),
  ],
  providers: [PortfolioGraphService],
  exports: [PortfolioGraphService],
})
export class PortfolioGraphModule {}
