import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { LLMService, OpenAIModels } from '../../llm/llm.service';
import { CLEANING_PROMPT } from '../prompts/cleaning.prompt';
import { IProcessingStage, StageContext, StageResult } from './stage.interface';

const cleaningResponseSchema = z.object({
  cleanedTranscript: z.string().describe('The cleaned transcript text'),
});

@Injectable()
export class CleaningStage implements IProcessingStage {
  readonly name = 'cleaning';

  constructor(private readonly llmService: LLMService) {}

  /**
   * Clean transcript - fix medical terms, remove fillers, improve formatting
   */
  async execute(input: string, context: StageContext): Promise<StageResult> {
    const messages = await CLEANING_PROMPT.formatMessages({ transcript: input });

    const response = await this.llmService.invokeStructured(messages, cleaningResponseSchema, {
      temperature: 0.1,
      model: OpenAIModels.GPT_5_4_NANO,
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
