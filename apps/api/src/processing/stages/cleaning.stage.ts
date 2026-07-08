import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { LLMService, ModelConfigService, Stage } from '../../llm';
import { CLEANING_PROMPT } from '../prompts/cleaning.prompt';
import { IProcessingStage, StageContext, StageResult } from './stage.interface';

const cleaningResponseSchema = z.object({
  cleanedTranscript: z.string().describe('The cleaned transcript text'),
});

@Injectable()
export class CleaningStage implements IProcessingStage {
  readonly name = 'cleaning';

  constructor(
    private readonly llmService: LLMService,
    private readonly modelConfig: ModelConfigService
  ) {}

  /**
   * Clean transcript - fix medical terms, remove fillers, improve formatting
   */
  async execute(input: string, context: StageContext): Promise<StageResult> {
    const messages = await CLEANING_PROMPT.formatMessages({ transcript: input });

    const response = await this.llmService.invokeStructured(messages, cleaningResponseSchema, {
      ...this.modelConfig.resolve(Stage.Cleaning),
      temperature: 0.1,
    });

    return {
      text: response.data.cleanedTranscript,
      metadata: {
        stage: this.name,
        model: response.model,
        tokensUsed: response.tokensUsed,
        messageId: context.messageId.toString(),
      },
    };
  }
}
