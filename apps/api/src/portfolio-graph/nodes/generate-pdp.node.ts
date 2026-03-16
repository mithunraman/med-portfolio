import { Specialty } from '@acme/shared';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { Logger } from '@nestjs/common';
import { z } from 'zod';
import { getSpecialtyConfig } from '../../specialties/specialty.registry';
import { ANALYSIS_STEP_STARTED, GraphDeps } from '../graph-deps';
import { PdpGoal, PortfolioStateType } from '../portfolio-graph.state';

const logger = new Logger('GeneratePdpNode');

const MAX_GOALS = 2;
const MAX_ACTIONS_PER_GOAL = 3;

/* ------------------------------------------------------------------ */
/*  Zod schema — single source of truth for the LLM response shape    */
/* ------------------------------------------------------------------ */

const pdpGoalActionSchema = z.object({
  action: z
    .string()
    .describe(
      'A specific, actionable learning objective. Should be concrete enough to verify completion.'
    ),
  intendedEvidence: z
    .string()
    .describe(
      'What evidence the trainee will produce to demonstrate completion (e.g. "CBD submitted to portfolio", "reflective log entry")'
    ),
});

const pdpGoalSchema = z.object({
  goal: z
    .string()
    .describe(
      'The learning need or development objective this goal addresses (e.g. "Improve confidence managing acute upper GI bleeding")'
    ),
  actions: z
    .array(pdpGoalActionSchema)
    .describe('SMART actions to achieve this goal'),
});

/**
 * Schema passed to OpenAI's structured output (function calling).
 * The API constrains token generation to only produce valid JSON
 * matching this shape — no markdown fences, no parsing needed.
 */
const generatePdpResponseSchema = z.object({
  goals: z
    .array(pdpGoalSchema)
    .describe('PDP goals with SMART actions derived from the reflection and capabilities'),
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
 * (not the raw transcript) because PDP goals should flow directly
 * from what was reflected upon, not the raw dictation.
 */
const generatePdpPrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are a UK {specialtyName} training PDP (Personal Development Plan) generator.

Your task: given a trainee's reflection for a {entryType} entry and the capabilities it demonstrates, generate 1-${MAX_GOALS} PDP goals, each with 1-${MAX_ACTIONS_PER_GOAL} SMART actions.

## Tagged Capabilities

{capabilityBlock}

## Structure

Each PDP goal has:
- **Goal**: A clear learning need or development objective.
- **Actions**: 1-${MAX_ACTIONS_PER_GOAL} specific steps to achieve the goal.

## SMART Criteria (for each action)

Each action must be:
- **Specific**: Clearly state what the trainee will do.
- **Measurable**: Include intended evidence — what the trainee will produce to demonstrate completion.
- **Achievable**: Realistic within a training placement.
- **Relevant**: Directly linked to learning gaps identified in the reflection.
- **Time-bound**: The trainee will set their own deadlines — do NOT include timeframes.

## Instructions

1. Read the reflection carefully. Identify the key learning gaps or development needs.
2. Group related gaps into 1-${MAX_GOALS} goals.
3. For each goal, generate 1-${MAX_ACTIONS_PER_GOAL} SMART actions that directly address the learning need.
4. Each action should be a single, focused objective — not a list of sub-tasks.
5. For each action, specify the intended evidence (e.g. "CBD submitted to portfolio", "reflective log entry", "completed audit report").
6. Actions should be achievable during normal clinical training (tutorials, clinics, self-directed learning).
7. Do NOT generate generic actions like "read more about X". Be specific about what to do and how to evidence it.
8. If the reflection already shows strong learning with no clear gaps, generate ONE goal with ONE action that builds on the strength demonstrated.`,
  ],
  ['human', '{reflection}'],
]);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Build a concise capability summary for the PDP prompt.
 * Includes capability name and reasoning so the LLM
 * can connect PDP goals to demonstrated (or lacking) capabilities.
 */
function formatCapabilityBlock(
  capabilities: { code: string; name: string; reasoning: string }[]
): string {
  if (capabilities.length === 0) return 'None identified.';

  return capabilities
    .map((c) => `- ${c.code} ${c.name}: ${c.reasoning}`)
    .join('\n');
}

/* ------------------------------------------------------------------ */
/*  Post-validation                                                    */
/* ------------------------------------------------------------------ */

/**
 * Enforce the max goal/action counts and filter out empty entries.
 * Structured output guarantees the shape, but the LLM may return
 * more items than requested or items with empty strings.
 */
function validateGoals(goals: PdpGoal[]): PdpGoal[] {
  return goals
    .map((g) => ({
      ...g,
      actions: g.actions
        .filter((a) => a.action.trim().length > 0)
        .slice(0, MAX_ACTIONS_PER_GOAL),
    }))
    .filter((g) => g.goal.trim().length > 0 && g.actions.length > 0)
    .slice(0, MAX_GOALS);
}

/* ------------------------------------------------------------------ */
/*  Node factory                                                       */
/* ------------------------------------------------------------------ */

/**
 * Factory that creates the generate-pdp node with injected dependencies.
 *
 * Generates SMART PDP goals from the reflection and tagged capabilities.
 * Uses low temperature (0.2) — PDP actions should be grounded and
 * deterministic, not creative. Higher than extraction (0.1) because
 * the LLM needs some latitude in phrasing actionable objectives.
 *
 * The reflection is used as the human message (not the transcript)
 * because PDP goals should flow from the synthesised learning,
 * not the raw dictation.
 */
export function createGeneratePdpNode(deps: GraphDeps) {
  return async function generatePdpNode(
    state: PortfolioStateType
  ): Promise<Partial<PortfolioStateType>> {
    deps.eventEmitter.emit(ANALYSIS_STEP_STARTED, { conversationId: state.conversationId, step: 'generate_pdp' });
    logger.log(`Generating PDP for conversation ${state.conversationId}`);

    // ── Guard: no reflection ──
    if (!state.reflection || state.reflection.length === 0) {
      logger.warn('No reflection available — skipping PDP generation');
      return { pdpGoals: [] };
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
      { temperature: 0.2, maxTokens: 1000 }
    );

    const pdpGoals = validateGoals(response.goals);

    logger.log(
      `Generated ${pdpGoals.length} PDP goals: ` +
        pdpGoals
          .map(
            (g) =>
              `"${g.goal.slice(0, 50)}..." (${g.actions.length} actions)`
          )
          .join(', ')
    );

    return { pdpGoals };
  };
}
