import { Specialty } from '@acme/shared';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { Logger } from '@nestjs/common';
import { z } from 'zod';
import { getSpecialtyConfig } from '../../specialties/specialty.registry';
import { GraphDeps } from '../graph-deps';
import { PdpAction, PortfolioStateType } from '../portfolio-graph.state';

const logger = new Logger('GeneratePdpNode');

const MAX_PDP_ACTIONS = 2;

/* ------------------------------------------------------------------ */
/*  Zod schema — single source of truth for the LLM response shape    */
/* ------------------------------------------------------------------ */

const pdpActionSchema = z.object({
  action: z
    .string()
    .describe(
      'A specific, actionable learning objective. Should be concrete enough to verify completion.'
    ),
  timeframe: z
    .string()
    .describe(
      'When this action should be completed (e.g. "within 4 weeks", "by end of current placement", "next 2 months")'
    ),
});

/**
 * Schema passed to OpenAI's structured output (function calling).
 * The API constrains token generation to only produce valid JSON
 * matching this shape — no markdown fences, no parsing needed.
 */
const generatePdpResponseSchema = z.object({
  actions: z
    .array(pdpActionSchema)
    .describe('SMART PDP actions derived from the reflection and capabilities'),
});

/* ------------------------------------------------------------------ */
/*  Prompt template                                                    */
/* ------------------------------------------------------------------ */

/**
 * ChatPromptTemplate separates the template structure from runtime data.
 *
 * Variables:
 *  - specialtyName: e.g. "General Practice"
 *  - entryType: classified entry type
 *  - capabilityBlock: tagged capabilities with evidence
 *  - reflection: the generated reflection text
 *
 * Unlike the extraction nodes, the human message here is the reflection
 * (not the raw transcript) because PDP actions should flow directly
 * from what was reflected upon, not the raw dictation.
 */
const generatePdpPrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are a UK {specialtyName} training PDP (Personal Development Plan) generator.

Your task: given a trainee's reflection for a {entryType} entry and the capabilities it demonstrates, generate 1-${MAX_PDP_ACTIONS} SMART PDP actions.

## Tagged Capabilities

{capabilityBlock}

## SMART Criteria

Each action must be:
- **Specific**: Clearly state what the trainee will do.
- **Measurable**: Include how completion will be evidenced.
- **Achievable**: Realistic within a training placement.
- **Relevant**: Directly linked to learning gaps identified in the reflection.
- **Time-bound**: Include a concrete timeframe.

## Instructions

1. Read the reflection carefully. Identify the key learning gaps or development needs.
2. Generate 1-${MAX_PDP_ACTIONS} PDP actions that directly address those gaps.
3. Each action should be a single, focused objective — not a list of sub-tasks.
4. Actions should be achievable during normal clinical training (tutorials, clinics, self-directed learning).
5. Timeframes should be realistic — typically 2-8 weeks.
6. Do NOT generate generic actions like "read more about X". Be specific about what to do and how to evidence it.
7. If the reflection already shows strong learning with no clear gaps, generate ONE action that builds on the strength demonstrated.`,
  ],
  ['human', '{reflection}'],
]);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Build a concise capability summary for the PDP prompt.
 * Includes capability name and first evidence quote so the LLM
 * can connect PDP actions to demonstrated (or lacking) capabilities.
 */
function formatCapabilityBlock(
  capabilities: { code: string; name: string; evidence: string[] }[]
): string {
  if (capabilities.length === 0) return 'None identified.';

  return capabilities
    .map((c) => `- ${c.code} ${c.name}: ${c.evidence[0]}`)
    .join('\n');
}

/* ------------------------------------------------------------------ */
/*  Post-validation                                                    */
/* ------------------------------------------------------------------ */

/**
 * Enforce the max action count and filter out empty actions.
 * Structured output guarantees the shape, but the LLM may return
 * more actions than requested or actions with empty strings.
 */
function validateActions(actions: PdpAction[]): PdpAction[] {
  return actions
    .filter((a) => a.action.trim().length > 0 && a.timeframe.trim().length > 0)
    .slice(0, MAX_PDP_ACTIONS);
}

/* ------------------------------------------------------------------ */
/*  Node factory                                                       */
/* ------------------------------------------------------------------ */

/**
 * Factory that creates the generate-pdp node with injected dependencies.
 *
 * Generates SMART PDP actions from the reflection and tagged capabilities.
 * Uses low temperature (0.2) — PDP actions should be grounded and
 * deterministic, not creative. Higher than extraction (0.1) because
 * the LLM needs some latitude in phrasing actionable objectives.
 *
 * The reflection is used as the human message (not the transcript)
 * because PDP actions should flow from the synthesised learning,
 * not the raw dictation.
 */
export function createGeneratePdpNode(deps: GraphDeps) {
  return async function generatePdpNode(
    state: PortfolioStateType
  ): Promise<Partial<PortfolioStateType>> {
    logger.log(`Generating PDP for conversation ${state.conversationId}`);

    // ── Guard: no reflection ──
    if (!state.reflection || state.reflection.length === 0) {
      logger.warn('No reflection available — skipping PDP generation');
      return { pdpActions: [] };
    }

    const specialty = Number(state.specialty) as Specialty;
    const config = getSpecialtyConfig(specialty);

    // ── Format reflection sections into text for the prompt ──
    const reflectionText = state.reflection
      .map((s) => `## ${s.title}\n${s.text}`)
      .join('\n\n');

    // ── Build and send prompt ──
    const messages = await generatePdpPrompt.formatMessages({
      specialtyName: config.name,
      entryType: state.entryType ?? 'unknown',
      capabilityBlock: formatCapabilityBlock(state.capabilities),
      reflection: reflectionText,
    });

    const { data: response } = await deps.llmService.invokeStructured(
      messages,
      generatePdpResponseSchema,
      { temperature: 0.2, maxTokens: 600 }
    );

    const pdpActions = validateActions(response.actions);

    logger.log(
      `Generated ${pdpActions.length} PDP actions: ` +
        pdpActions.map((a) => `"${a.action.slice(0, 60)}..." (${a.timeframe})`).join(', ')
    );

    return { pdpActions };
  };
}
