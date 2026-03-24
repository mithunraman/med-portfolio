import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { LLMService, OpenAIModels } from '../../llm/llm.service';
import { REDACTION_PROMPT } from '../prompts/redaction.prompt';
import { redactStructuredPii } from '../utils/pii-regex';
import { IProcessingStage, StageContext, StageResult } from './stage.interface';

const redactionResponseSchema = z.object({
  needsRedaction: z.boolean().describe('Whether the text contains PII that needs redacting'),
  redactedText: z
    .string()
    .describe(
      'The text with PII replaced by typed placeholders. If needsRedaction is false, return the input text unchanged'
    ),
  redactedEntities: z
    .array(z.string())
    .describe(
      'List of entity types that were redacted, e.g. ["person_name", "organisation", "location"]. Empty array if needsRedaction is false'
    ),
});

@Injectable()
export class RedactionStage implements IProcessingStage {
  readonly name = 'redaction';
  private readonly logger = new Logger(RedactionStage.name);

  constructor(private readonly llmService: LLMService) {}

  /**
   * Redact PII from text using a two-layer approach:
   * 1. Regex pass — deterministic, catches structured PII (NHS numbers, phones, emails, etc.)
   * 2. LLM pass — contextual, catches unstructured PII (names, organisations, locations)
   */
  async execute(input: string, context: StageContext): Promise<StageResult> {
    // Layer 1: Regex-based redaction for structured PII
    const regexResult = redactStructuredPii(input);

    if (regexResult.redactedEntities.length > 0) {
      this.logger.log(
        `Regex redacted [${regexResult.redactedEntities.join(', ')}] for message ${context.messageId}`
      );
    }

    // Layer 2: LLM-based redaction for unstructured PII (names, orgs, locations)
    const messages = await REDACTION_PROMPT.formatMessages({ text: regexResult.redactedText });

    const response = await this.llmService.invokeStructured(messages, redactionResponseSchema, {
      temperature: 0,
      model: OpenAIModels.GPT_5_4_NANO,
    });

    const { needsRedaction, redactedText, redactedEntities: llmEntities } = response.data;

    // Combine results from both layers
    const allRedactedEntities = [...regexResult.redactedEntities, ...llmEntities];

    const finalText = needsRedaction ? redactedText : regexResult.redactedText;

    if (needsRedaction) {
      this.logger.log(
        `LLM redacted [${llmEntities.join(', ')}] for message ${context.messageId}`
      );
    }

    return {
      text: finalText,
      metadata: {
        stage: this.name,
        model: response.model,
        tokensUsed: response.tokensUsed,
        messageId: context.messageId.toString(),
        regexRedactedEntities: regexResult.redactedEntities,
        llmRedactedEntities: llmEntities,
        allRedactedEntities,
        needsLlmRedaction: needsRedaction,
      },
    };
  }
}
