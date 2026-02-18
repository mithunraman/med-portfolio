import { Injectable } from '@nestjs/common';
import { LLMService, TranscriptionResult } from '../../llm/llm.service';
import { IProcessingStage, StageContext, StageResult } from './stage.interface';

export interface TranscriptionStageResult extends StageResult {
  transcription: {
    confidence: number | null;
    audioDurationMs: number | null;
    wordCount: number | null;
  };
}

@Injectable()
export class TranscriptionStage implements IProcessingStage {
  readonly name = 'transcription';

  constructor(private readonly llmService: LLMService) {}

  /**
   * Transcribe audio using AssemblyAI
   * Input is the presigned URL for the audio file
   */
  async execute(audioUrl: string, context: StageContext): Promise<TranscriptionStageResult> {
    const result: TranscriptionResult = await this.llmService.transcribeAudio(audioUrl);

    return {
      text: result.text,
      metadata: {
        stage: this.name,
        messageId: context.messageId.toString(),
      },
      transcription: {
        confidence: result.confidence,
        audioDurationMs: result.audioDurationMs,
        wordCount: result.wordCount,
      },
    };
  }
}
