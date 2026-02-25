import { type FollowupQuestion, Specialty, TemplateSection } from '@acme/shared';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { interrupt } from '@langchain/langgraph';
import { Logger } from '@nestjs/common';
import { z } from 'zod';
import { getSpecialtyConfig, getTemplateForEntryType } from '../../specialties/specialty.registry';
import { GraphDeps } from '../graph-deps';
import { PortfolioStateType } from '../portfolio-graph.state';

const logger = new Logger('AskFollowupNode');

const MAX_QUESTIONS_PER_ROUND = 3;

/* ------------------------------------------------------------------ */
/*  Zod schema — contextualised question response                      */
/* ------------------------------------------------------------------ */

const contextualisedQuestionSchema = z.object({
  sectionId: z.string().describe('The section ID this question is for'),
  question: z.string().describe('The contextualised follow-up question'),
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
    `You are a supportive UK GP portfolio assistant helping a trainee complete a {templateName} entry.

The trainee has already told you about their experience, but some information is missing. Your job is to ask follow-up questions that feel natural and conversational — not like a checklist.

## Missing Sections

{missingSectionBlock}

## Instructions

1. For each missing section, generate ONE concise follow-up question.
2. Reference what the trainee has already said — acknowledge their input before asking for more.
3. Keep questions warm and professional. Use "you" language.
4. Do NOT repeat information the trainee has already provided.
5. Each question should be 1-2 sentences maximum.
6. Questions should feel like a natural conversation, not a form to fill in.`,
  ],
  ['human', '{transcript}'],
]);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Build the missing section block for the contextualisation prompt.
 * Includes the section description and the default extraction question
 * as a starting point for the LLM to rephrase.
 */
function formatMissingSectionBlock(sections: TemplateSection[]): string {
  return sections
    .map(
      (s) =>
        `### ${s.id} — ${s.label}\n` +
        `What we need: ${s.description}\n` +
        `Default question: ${s.extractionQuestion}`
    )
    .join('\n\n');
}

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
    logger.log(
      `Asking follow-up for conversation ${state.conversationId} ` +
        `(round ${state.followUpRound + 1}, missing: ${state.missingSections.join(', ')})`
    );

    // ── Load template ──
    const specialty = Number(state.specialty) as Specialty;
    const config = getSpecialtyConfig(specialty);
    if (!state.entryType) {
      logger.warn('No entry type set — cannot ask follow-up');
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
      logger.warn('No askable missing sections — skipping follow-up');
      return { followUpRound: state.followUpRound + 1 };
    }

    // ── Contextualise questions via LLM (with fallback) ──
    let questions: FollowupQuestion[];

    try {
      const messages = await followupPrompt.formatMessages({
        templateName: template.name,
        missingSectionBlock: formatMissingSectionBlock(missingSectionDefs),
        transcript: state.fullTranscript,
      });

      const { data: response } = await deps.llmService.invokeStructured(
        messages,
        followupQuestionsResponseSchema,
        { temperature: 0.3, maxTokens: 600 }
      );

      // Validate that returned sectionIds match what we asked for
      const validIds = new Set(missingSectionDefs.map((s) => s.id));
      questions = response.questions.filter((q) => validIds.has(q.sectionId));

      // Backfill any sections the LLM missed with default questions
      for (const section of missingSectionDefs) {
        if (!questions.find((q) => q.sectionId === section.id)) {
          questions.push({
            sectionId: section.id,
            question: section.extractionQuestion,
          });
        }
      }
    } catch (error) {
      logger.warn(`LLM contextualisation failed, using default questions: ${error}`);
      questions = missingSectionDefs.map((s) => ({
        sectionId: s.id,
        question: s.extractionQuestion,
      }));
    }

    logger.log(
      `Generated ${questions.length} follow-up questions: ${questions.map((q) => q.sectionId).join(', ')}`
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
