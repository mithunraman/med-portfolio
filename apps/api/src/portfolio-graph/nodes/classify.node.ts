import { Specialty } from '@acme/shared';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { Logger } from '@nestjs/common';
import { z } from 'zod';
import { getSpecialtyConfig } from '../../specialties/specialty.registry';
import { GraphDeps } from '../graph-deps';
import { ClassificationAlternative, PortfolioStateType } from '../portfolio-graph.state';

const logger = new Logger('ClassifyNode');

/* ------------------------------------------------------------------ */
/*  Zod schema — single source of truth for the LLM response shape    */
/* ------------------------------------------------------------------ */

const classificationAlternativeSchema = z.object({
  entryType: z.string().describe('Entry type code from the list above'),
  confidence: z.number().min(0).max(1).describe('Confidence score 0-1'),
  reasoning: z.string().describe('Why this alternative is plausible'),
});

/**
 * Schema passed to OpenAI's structured output (function calling).
 * The API constrains token generation to only produce valid JSON
 * matching this shape — no markdown fences, no parsing needed.
 */
const classifyResponseSchema = z.object({
  entryType: z.string().describe('The best-matching entry type code'),
  confidence: z.number().min(0).max(1).describe('Confidence score 0-1'),
  reasoning: z.string().describe('1-2 sentence explanation of why this type was chosen'),
  signalsFound: z
    .array(z.string())
    .describe(
      'Classification signals from the entry type definition that appear in the transcript'
    ),
  alternatives: z
    .array(classificationAlternativeSchema)
    .describe('Other plausible entry types, ordered by confidence'),
});

type ClassifyResponse = z.infer<typeof classifyResponseSchema>;

/* ------------------------------------------------------------------ */
/*  Prompt template                                                    */
/* ------------------------------------------------------------------ */

/**
 * ChatPromptTemplate separates the template structure from runtime data.
 *
 * Variables:
 *  - specialtyName: e.g. "General Practice"
 *  - entryTypeBlock: formatted entry type definitions (built at call time)
 *
 * The human message is the raw transcript — no template variables needed
 * since it's passed directly from state.
 *
 * No "Response Format" section — the Zod schema enforces the shape
 * via OpenAI's structured output. The prompt focuses purely on the task.
 */
const classificationPrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are a UK medical portfolio classifier for {specialtyName} trainees.

Your task: given a transcript of one or more dictated messages from a trainee, determine which portfolio entry type best fits the content.

## Entry Types

{entryTypeBlock}

## Instructions

1. Read the full transcript carefully.
2. Identify which signals from the list above appear in the text.
3. Choose the SINGLE best-matching entry type.
4. If the transcript could plausibly be more than one type, list alternatives.
5. Be honest about confidence — a short or ambiguous transcript should NOT get high confidence.`,
  ],
  ['human', '{transcript}'],
]);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Build the entry type block that gets injected into the prompt template.
 * Each entry type is rendered with its code, label, description, and signals.
 */
function formatEntryTypeBlock(specialty: Specialty): string {
  const config = getSpecialtyConfig(specialty);
  return config.entryTypes
    .map(
      (et) =>
        `### ${et.code} — ${et.label}\n` +
        `${et.description}\n` +
        `Signals: ${et.classificationSignals.join(', ')}`
    )
    .join('\n\n');
}

/* ------------------------------------------------------------------ */
/*  Confidence adjustment                                              */
/* ------------------------------------------------------------------ */

/**
 * Apply structural overrides to the LLM's self-reported confidence.
 *
 * LLMs are systematically overconfident. These rules can only LOWER
 * the score, never raise it, ensuring the router's threshold (0.7)
 * triggers clarification when evidence is genuinely thin.
 *
 * Rules:
 *  - Transcript < 50 words  → cap at 0.85 (not enough signal)
 *  - < 2 signals matched    → cap at 0.9  (weak evidence)
 *  - Top-2 within 0.15      → reduce by 0.1 (genuine ambiguity)
 */
function adjustConfidence(
  raw: number,
  wordCount: number,
  signalCount: number,
  alternatives: ClassificationAlternative[]
): number {
  let adjusted = Math.min(raw, 1.0);

  if (wordCount < 50) {
    adjusted = Math.min(adjusted, 0.85);
  }

  if (signalCount < 2) {
    adjusted = Math.min(adjusted, 0.9);
  }

  if (alternatives.length > 0) {
    const topAlt = alternatives[0].confidence;
    if (adjusted - topAlt < 0.15) {
      adjusted = Math.max(adjusted - 0.1, 0);
    }
  }

  return Math.round(adjusted * 100) / 100;
}

/* ------------------------------------------------------------------ */
/*  Post-validation                                                    */
/* ------------------------------------------------------------------ */

/**
 * Verify the LLM returned a valid entry type code for this specialty.
 * Structured output guarantees the shape, but not that the code exists
 * in our config — that's a semantic check we still own.
 */
function validateEntryType(response: ClassifyResponse, validCodes: Set<string>): void {
  if (!validCodes.has(response.entryType)) {
    throw new Error(`Unknown entry type code: ${response.entryType}`);
  }
}

/* ------------------------------------------------------------------ */
/*  Node factory                                                       */
/* ------------------------------------------------------------------ */

/**
 * Factory that creates the classify node with injected dependencies.
 *
 * Uses ChatPromptTemplate for prompt composition and
 * LLMService.invokeStructured() with a Zod schema so OpenAI's
 * structured output guarantees valid JSON. The node then applies
 * structural confidence adjustments on top.
 *
 * Downstream, the classifyRouter checks if confidence >= 0.7:
 *  - Yes → proceed to check_completeness
 *  - No  → route to ask_clarification (up to 2 rounds)
 */
export function createClassifyNode(deps: GraphDeps) {
  return async function classifyNode(
    state: PortfolioStateType
  ): Promise<Partial<PortfolioStateType>> {
    logger.log(`Classifying entry for conversation ${state.conversationId}`);

    const specialty = Number(state.specialty) as Specialty;
    const config = getSpecialtyConfig(specialty);
    const validCodes = new Set(config.entryTypes.map((et) => et.code));

    // Format the prompt template with runtime data
    const messages = await classificationPrompt.formatMessages({
      specialtyName: config.name,
      entryTypeBlock: formatEntryTypeBlock(specialty),
      transcript: state.fullTranscript,
    });

    const { data: classification } = await deps.llmService.invokeStructured(
      messages,
      classifyResponseSchema,
      { temperature: 0.1, maxTokens: 800 }
    );

    // Structured output guarantees the shape; we still check the code is valid
    validateEntryType(classification, validCodes);

    const wordCount = state.fullTranscript.split(/\s+/).filter(Boolean).length;

    const adjustedConfidence = adjustConfidence(
      classification.confidence,
      wordCount,
      classification.signalsFound.length,
      classification.alternatives
    );

    logger.log(
      `Classification: ${classification.entryType} ` +
        `(raw: ${classification.confidence}, adjusted: ${adjustedConfidence}, ` +
        `signals: ${classification.signalsFound.length}, words: ${wordCount})`
    );

    return {
      entryType: classification.entryType,
      classificationConfidence: adjustedConfidence,
      classificationReasoning: classification.reasoning,
      classificationSignals: classification.signalsFound,
      alternatives: classification.alternatives,
    };
  };
}
