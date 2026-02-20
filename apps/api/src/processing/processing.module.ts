import { forwardRef, Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module';
import { LLMModule } from '../llm';
import { MediaModule } from '../media';
import { PortfolioGraphModule } from '../portfolio-graph';
import { ProcessingService } from './processing.service';
import { CleaningStage } from './stages/cleaning.stage';
import { TranscriptionStage } from './stages/transcription.stage';

@Module({
  imports: [LLMModule, MediaModule, forwardRef(() => ConversationsModule), PortfolioGraphModule],
  providers: [ProcessingService, TranscriptionStage, CleaningStage],
  exports: [ProcessingService],
})
export class ProcessingModule {}
