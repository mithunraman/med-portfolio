import { forwardRef, Module } from '@nestjs/common';
import { ArtefactsModule } from '../artefacts/artefacts.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { LLMModule } from '../llm';
import { MediaModule } from '../media';
import { ProcessingService } from './processing.service';
import { CleaningStage } from './stages/cleaning.stage';
import { RedactionStage } from './stages/redaction.stage';
import { TranscriptionStage } from './stages/transcription.stage';

@Module({
  imports: [
    LLMModule,
    MediaModule,
    forwardRef(() => ConversationsModule),
    forwardRef(() => ArtefactsModule),
  ],
  providers: [ProcessingService, TranscriptionStage, CleaningStage, RedactionStage],
  exports: [ProcessingService],
})
export class ProcessingModule {}
