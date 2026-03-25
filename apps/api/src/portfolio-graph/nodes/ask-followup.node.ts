import { type FollowupQuestion, Specialty, TemplateSection } from '@acme/shared';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { interrupt } from '@langchain/langgraph';
import { Logger } from '@nestjs/common';
import { z } from 'zod';
import { OpenAIModels } from '../../llm/llm.service';
import { getSpecialtyConfig, getTemplateForEntryType } from '../../specialties/specialty.registry';
import { getStageContext } from '../../specialties/stage-context';
import { ANALYSIS_STEP_STARTED, GraphDeps } from '../graph-deps';
import { MAX_FOLLOWUP_ROUNDS } from '../portfolio-graph.builder';
import { PortfolioStateType, SectionCoverage } from '../portfolio-graph.state';

const logger = new Logger('AskFollowupNode');

const MAX_QUESTIONS_PER_ROUND = 3;

/* ------------------------------------------------------------------ */
/*  Zod schema — contextualised question response                      */
/* ------------------------------------------------------------------ */

const contextualisedQuestionSchema = z.object({
  sectionId: z.string().describe('The section ID this question is for'),
  question: z.string().describe('A focused micro-question targeting ONE specific aspect'),
  hints: z.object({
    examples: z
      .array(z.string())
      .max(3)
      .describe(
        'Short (1-sentence) example responses showing the expected depth. ' +
          "MUST use different clinical scenarios than the trainee's case. " +
          'Show what a good answer LOOKS LIKE, not what it should SAY.'
      ),
    reassurance: z
      .string()
      .describe('Brief normalising statement, e.g., "Even a short answer helps here"'),
  }),
});

const followupQuestionsResponseSchema = z.object({
  questions: z.array(contextualisedQuestionSchema).describe('Contextualised follow-up questions'),
});

/* ------------------------------------------------------------------ */
/*  Prompt template                                                    */
/* ------------------------------------------------------------------ */

const followupPrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are a supportive UK medical portfolio assistant helping a trainee complete a {templateName} entry.

The trainee has already told you about their experience, but some sections need more detail. Your job is to ask focused micro-questions — each targeting ONE specific aspect — with optional hints.

## Trainee Context

{trainingStageContext}

## Missing or Shallow Sections

{missingSectionBlock}

## Question Design Rules

1. Ask ONE specific micro-question per section.
   BAD: "What did you learn and would you do anything differently?"
   GOOD: "Was there a moment where you felt uncertain about your decision?"

2. For reflective sections (reflection, learning, what went well, what could improve), use focused angles:
   - Uncertainty: "Was there a point where you weren't sure what to do?"
   - What worked: "What felt right about how you handled this?"
   - What you'd change: "Is there anything you'd approach differently next time?"
   - Impact on practice: "Has this changed how you'll handle similar cases?"
   Choose the angle most relevant to what's missing. Ask ONE per section.

3. For factual sections (presentation, findings, management, outcome), ask directly for the missing information.

4. Reference what the trainee has already said — acknowledge their input before asking for more.

5. Keep questions warm and professional. Use "you" language. 1-2 sentences maximum.

## Hint Rules

For EACH question, generate 2-3 example response hints:
1. Hints are SHORT (1 sentence each) example responses.
2. Hints MUST use DIFFERENT clinical scenarios than the trainee's actual case. If the trainee described a chest pain case, use examples from dermatology, paediatrics, mental health, etc.
3. Hints demonstrate the LEVEL OF DETAIL expected, not the content.
4. Include a brief reassurance (e.g., "Even a short answer is useful here").
5. For reflective questions, normalise uncertainty and imperfection in hints.`,
  ],
  ['human', '{transcript}'],
]);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Build the missing/shallow section block for the prompt.
 * Includes the section description, depth status, and the default
 * extraction question as a starting point for the LLM to rephrase.
 */
function formatMissingSectionBlock(
  sections: TemplateSection[],
  sectionCoverage: SectionCoverage
): string {
  return sections
    .map((s) => {
      const assessment = sectionCoverage[s.id];
      const status = !assessment?.covered
        ? 'Not mentioned at all'
        : assessment.depth === 'shallow'
          ? 'Mentioned but vague — needs specific detail'
          : 'Needs more detail';

      return (
        `### ${s.id} — ${s.label}\n` +
        `Status: ${status}\n` +
        `What we need: ${s.description}\n` +
        `Default question: ${s.extractionQuestion}`
      );
    })
    .join('\n\n');
}

/** Default hints used when LLM contextualisation fails. */
const DEFAULT_HINTS = {
  examples: ['A couple of sentences with specific details is ideal.'],
  reassurance: 'Even a short answer is useful here.',
};

/* ------------------------------------------------------------------ */
/*  Node factory                                                       */
/* ------------------------------------------------------------------ */

/**
 * Factory that creates the ask-followup node with injected dependencies.
 *
 * Selects the most important missing sections (by weight), contextualises
 * the template's extraction questions via LLM so they reference what the
 * trainee already said, then pauses the graph via interrupt().
 *
 * On resume, the graph loops back to gather_context → check_completeness.
 */
export function createAskFollowupNode(deps: GraphDeps) {
  return async function askFollowupNode(
    state: PortfolioStateType
  ): Promise<Partial<PortfolioStateType>> {
    // Defence-in-depth: circuit breaker against router bugs that could cause
    // an infinite follow-up loop with unbounded LLM spend.
    if (state.followUpRound >= MAX_FOLLOWUP_ROUNDS) {
      throw new Error(
        `Follow-up round ${state.followUpRound} exceeds maximum ${MAX_FOLLOWUP_ROUNDS}. ` +
          'This indicates a router bug in completenessRouter.'
      );
    }

    const cid = state.conversationId;
    deps.eventEmitter.emit(ANALYSIS_STEP_STARTED, {
      conversationId: cid,
      step: 'ask_followup',
    });
    logger.log(
      `[${cid}] Asking follow-up (round ${state.followUpRound + 1}, ` +
        `missing: [${state.missingSections.join(', ')}])`
    );

    // ── Load template ──
    const specialty = Number(state.specialty) as Specialty;
    const config = getSpecialtyConfig(specialty);
    if (!state.entryType) {
      logger.warn(`[${cid}] No entry type set — cannot ask follow-up`);
      return { followUpRound: state.followUpRound + 1 };
    }
    const template = getTemplateForEntryType(config, state.entryType);

    // ── Select top missing sections by weight ──
    const missingSectionDefs = template.sections
      .filter(
        (s): s is TemplateSection & { extractionQuestion: string } =>
          state.missingSections.includes(s.id) && s.extractionQuestion !== null
      )
      .sort((a, b) => b.weight - a.weight)
      .slice(0, MAX_QUESTIONS_PER_ROUND);

    // Guard: nothing to ask about (should not happen due to completenessRouter)
    if (missingSectionDefs.length === 0) {
      logger.warn(`[${cid}] No askable missing sections — skipping follow-up`);
      return { followUpRound: state.followUpRound + 1 };
    }

    // ── Contextualise questions via LLM (with fallback) ──
    let questions: FollowupQuestion[];

    try {
      const messages = await followupPrompt.formatMessages({
        templateName: template.name,
        trainingStageContext: getStageContext(specialty, state.trainingStage),
        missingSectionBlock: formatMissingSectionBlock(missingSectionDefs, state.sectionCoverage),
        transcript: state.fullTranscript,
      });

      const { data: response } = await deps.llmService.invokeStructured(
        messages,
        followupQuestionsResponseSchema,
        { model: OpenAIModels.GPT_4_1, temperature: 0.3, maxTokens: 1000 }
      );

      // Validate that returned sectionIds match what we asked for
      const validIds = new Set(missingSectionDefs.map((s) => s.id));
      questions = response.questions.filter((q) => validIds.has(q.sectionId));

      // Backfill any sections the LLM missed with default questions + hints
      for (const section of missingSectionDefs) {
        if (!questions.find((q) => q.sectionId === section.id)) {
          questions.push({
            sectionId: section.id,
            question: section.extractionQuestion,
            hints: DEFAULT_HINTS,
          });
        }
      }
    } catch (error) {
      logger.warn(`[${cid}] LLM contextualisation failed, using default questions: ${error}`);
      questions = missingSectionDefs.map((s) => ({
        sectionId: s.id,
        question: s.extractionQuestion,
        hints: DEFAULT_HINTS,
      }));
    }

    // Log which sections are being asked about and the selected questions
    for (const q of questions) {
      const sectionDef = missingSectionDefs.find((s) => s.id === q.sectionId);
      logger.log(
        `[${cid}]   follow-up section=${q.sectionId} (weight=${sectionDef?.weight ?? '?'}) ` +
          `question="${q.question.slice(0, 80)}..."`
      );
    }
    logger.log(
      `[${cid}] Generated ${questions.length} follow-up questions ` +
        `(${state.missingSections.length - questions.length} missing sections not asked due to max=${MAX_QUESTIONS_PER_ROUND})`
    );

    // ── Pause the graph — service layer will create the ASSISTANT message ──
    interrupt({
      type: 'followup',
      questions,
      missingSections: state.missingSections,
      entryType: state.entryType,
      followUpRound: state.followUpRound + 1,
    });

    return {
      followUpRound: state.followUpRound + 1,
    };
  };
}
