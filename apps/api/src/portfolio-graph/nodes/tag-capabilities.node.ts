import { Specialty } from '@acme/shared';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { Logger } from '@nestjs/common';
import { z } from 'zod';
import { getSpecialtyConfig } from '../../specialties/specialty.registry';
import { GraphDeps } from '../graph-deps';
import { CapabilityTag, PortfolioStateType } from '../portfolio-graph.state';

const logger = new Logger('TagCapabilitiesNode');

const MAX_CAPABILITIES = 5;

/* ------------------------------------------------------------------ */
/*  Zod schema — single source of truth for the LLM response shape    */
/* ------------------------------------------------------------------ */

const capabilityTagSchema = z.object({
  code: z.string().describe('Capability code from the list above (e.g. "C-06")'),
  name: z.string().describe('Capability name'),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe('Confidence that this capability is evidenced, 0-1'),
  evidence: z
    .array(z.string())
    .describe(
      'Direct quotes or close paraphrases from the transcript that support this tag. Each element is one distinct piece of evidence.'
    ),
});

/**
 * Schema passed to OpenAI's structured output (function calling).
 * The API constrains token generation to only produce valid JSON
 * matching this shape — no markdown fences, no parsing needed.
 */
const tagCapabilitiesResponseSchema = z.object({
  capabilities: z
    .array(capabilityTagSchema)
    .describe('Capabilities evidenced in the transcript'),
});

type TagCapabilitiesResponse = z.infer<typeof tagCapabilitiesResponseSchema>;

/* ------------------------------------------------------------------ */
/*  Prompt template                                                    */
/* ------------------------------------------------------------------ */

/**
 * ChatPromptTemplate separates the template structure from runtime data.
 *
 * Variables:
 *  - specialtyName: e.g. "General Practice"
 *  - capabilityBlock: formatted capability definitions (built at call time)
 *  - entryType: classified entry type for context
 *
 * The human message is the raw transcript — passed directly from state.
 *
 * No "Response Format" section — the Zod schema enforces the shape
 * via OpenAI's structured output. The prompt focuses purely on the task.
 */
const tagCapabilitiesPrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are a UK medical portfolio capability mapper for {specialtyName} trainees.

Your task: given a trainee's transcript for a {entryType} entry, identify which curriculum capabilities are evidenced by the content.

## Curriculum Capabilities

{capabilityBlock}

## Instructions

1. Read the full transcript carefully.
2. Identify capabilities that are CLEARLY evidenced — the trainee must have described actions, reasoning, or behaviours that demonstrate the capability.
3. For each capability, provide one or more direct quotes or close paraphrases from the transcript as evidence. Each quote should be a distinct piece of evidence — not the same point rephrased.
4. For each capability, provide a confidence score (0-1) reflecting how strongly the transcript evidences it. Use these guidelines:
   - 0.9-1.0: Explicit, detailed evidence directly demonstrating the capability.
   - 0.7-0.89: Clear evidence but could be more detailed or specific.
   - 0.5-0.69: Some evidence present but indirect or partial.
   - Below 0.5: Do not include — evidence is too weak.
5. Return up to ${MAX_CAPABILITIES} capabilities. Do NOT tag a capability unless there is clear, specific evidence in the transcript.
6. Prefer fewer, well-evidenced capabilities over many weakly-evidenced ones.
7. The entry type ({entryType}) gives context but should not override what the transcript actually contains.`,
  ],
  ['human', '{transcript}'],
]);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Build the capability block that gets injected into the prompt template.
 * Each capability is rendered with its code, name, description, and domain.
 */
function formatCapabilityBlock(specialty: Specialty): string {
  const config = getSpecialtyConfig(specialty);
  return config.capabilities
    .map(
      (cap) =>
        `### ${cap.code} — ${cap.name}\n` +
        `Domain: ${cap.domainName}\n` +
        `${cap.description}`
    )
    .join('\n\n');
}

/* ------------------------------------------------------------------ */
/*  Post-validation                                                    */
/* ------------------------------------------------------------------ */

/**
 * Validate, filter, sort, and normalise the LLM response.
 *
 * Structured output guarantees the JSON shape, but not that the codes
 * exist in our config — that's a semantic check we still own.
 *
 * Steps:
 *  1. Reject unknown capability codes
 *  2. Deduplicate by code (LLMs occasionally return the same capability twice)
 *  3. Drop entries with empty evidence arrays
 *  4. Sort by confidence descending (we own the ranking, not the LLM)
 *  5. Enforce max count
 *  6. Use canonical name from config, not the LLM's rephrasing
 */
function validateAndRank(
  response: TagCapabilitiesResponse,
  validCodes: Map<string, string>
): CapabilityTag[] {
  const seen = new Set<string>();
  const validated: CapabilityTag[] = [];

  for (const cap of response.capabilities) {
    if (!validCodes.has(cap.code)) continue;
    if (seen.has(cap.code)) continue;
    if (cap.evidence.length === 0) continue;
    seen.add(cap.code);

    validated.push({
      code: cap.code,
      name: validCodes.get(cap.code)!,
      evidence: cap.evidence,
      confidence: Math.round(cap.confidence * 100) / 100,
    });
  }

  // Sort by confidence descending — we own the ranking
  validated.sort((a, b) => b.confidence - a.confidence);

  return validated.slice(0, MAX_CAPABILITIES);
}

/* ------------------------------------------------------------------ */
/*  Node factory                                                       */
/* ------------------------------------------------------------------ */

/**
 * Factory that creates the tag-capabilities node with injected dependencies.
 *
 * Uses ChatPromptTemplate for prompt composition and
 * LLMService.invokeStructured() with a Zod schema so OpenAI's
 * structured output guarantees valid JSON. The node then applies
 * post-validation to ensure only known capability codes are returned,
 * and sorts by confidence score rather than relying on LLM ordering.
 *
 * Entry type is included as context to help the LLM focus on relevant
 * capabilities, but the transcript evidence is what ultimately determines
 * whether a capability is tagged.
 */
export function createTagCapabilitiesNode(deps: GraphDeps) {
  return async function tagCapabilitiesNode(
    state: PortfolioStateType
  ): Promise<Partial<PortfolioStateType>> {
    logger.log(`Tagging capabilities for conversation ${state.conversationId}`);

    const specialty = Number(state.specialty) as Specialty;
    const config = getSpecialtyConfig(specialty);

    // Map of code → canonical name for validation and normalisation
    const validCodes = new Map(config.capabilities.map((cap) => [cap.code, cap.name]));

    // Format the prompt template with runtime data
    const messages = await tagCapabilitiesPrompt.formatMessages({
      specialtyName: config.name,
      capabilityBlock: formatCapabilityBlock(specialty),
      entryType: state.entryType ?? 'unknown',
      transcript: state.fullTranscript,
    });

    const { data: response } = await deps.llmService.invokeStructured(
      messages,
      tagCapabilitiesResponseSchema,
      { temperature: 0.1, maxTokens: 1000 }
    );

    // Structured output guarantees the shape; we still check codes are valid
    const capabilities = validateAndRank(response, validCodes);

    if (capabilities.length === 0) {
      logger.warn('No valid capabilities tagged — this is unusual');
    }

    logger.log(
      `Tagged ${capabilities.length} capabilities: ` +
        capabilities.map((c) => `${c.code}(${c.confidence})`).join(', ')
    );

    return { capabilities };
  };
}
