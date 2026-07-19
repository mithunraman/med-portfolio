import { forwardRef, Module } from '@nestjs/common';
import { ArtefactsModule } from '../artefacts/artefacts.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { LanguageModule } from '../language';
import { LLMModule } from '../llm';
import { MediaModule } from '../media';
import { ProcessingService } from './processing.service';
import { RedactionModule } from './redaction/redaction.module';
import { CleaningStage } from './stages/cleaning.stage';
import { RedactionStage } from './stages/redaction.stage';
import { TranscriptionStage } from './stages/transcription.stage';

@Module({
  imports: [
    LLMModule,
    LanguageModule,
    RedactionModule,
    MediaModule,
    forwardRef(() => ConversationsModule),
    forwardRef(() => ArtefactsModule),
  ],
  providers: [ProcessingService, TranscriptionStage, CleaningStage, RedactionStage],
  exports: [ProcessingService],
})
export class ProcessingModule {}
