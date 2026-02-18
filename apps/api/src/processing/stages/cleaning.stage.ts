import { Injectable } from '@nestjs/common';
import { LLMService } from '../../llm/llm.service';
import { CLEANING_PROMPT } from '../prompts/cleaning.prompt';
import { IProcessingStage, StageContext, StageResult } from './stage.interface';

@Injectable()
export class CleaningStage implements IProcessingStage {
  readonly name = 'cleaning';

  constructor(private readonly llmService: LLMService) {}

  /**
   * Clean transcript - fix medical terms, remove fillers, improve formatting
   */
  async execute(input: string, context: StageContext): Promise<StageResult> {
    const response = await this.llmService.invoke(CLEANING_PROMPT, input, {
      temperature: 0.1,
      model: 'gpt-4.1',
    });

    return {
      text: response.content,
      metadata: {
        stage: this.name,
        model: response.model,
        tokensUsed: response.tokensUsed,
        messageId: context.messageId.toString(),
      },
    };
  }
}
