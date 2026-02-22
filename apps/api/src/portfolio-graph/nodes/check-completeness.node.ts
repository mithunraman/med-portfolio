import { Specialty } from '@acme/shared';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { Logger } from '@nestjs/common';
import { z } from 'zod';
import { getSpecialtyConfig, getTemplateForEntryType } from '../../specialties/specialty.registry';
import { GraphDeps } from '../graph-deps';
import { PortfolioStateType, SectionCoverage } from '../portfolio-graph.state';

const logger = new Logger('CheckCompletenessNode');

/* ------------------------------------------------------------------ */
/*  Zod schema — single source of truth for the LLM response shape    */
/* ------------------------------------------------------------------ */

const sectionAssessmentSchema = z.object({
  sectionId: z.string().describe('The section ID from the template'),
  covered: z
    .boolean()
    .describe('Whether the transcript contains sufficient information for this section'),
  evidence: z
    .string()
    .describe(
      'Brief quote or summary from the transcript that covers this section, or empty string if not covered'
    ),
});

const completenessResponseSchema = z.object({
  sections: z.array(sectionAssessmentSchema).describe('Assessment of each required section'),
});

/* ------------------------------------------------------------------ */
/*  Prompt template                                                    */
/* ------------------------------------------------------------------ */

const completenessPrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are a UK medical portfolio assistant assessing whether a GP trainee's transcript contains enough information for each section of a {templateName} entry.

## Sections to Assess

{sectionBlock}

## Instructions

1. Read the full transcript carefully.
2. For EACH section listed above, determine whether the transcript contains sufficient information to write that section.
3. A section is "covered" if the trainee has mentioned relevant content — it does not need to be perfectly phrased or comprehensive, just present.
4. A section is NOT covered if there is no mention at all, or only a vague or tangential reference.
5. For covered sections, provide a brief quote or summary from the transcript as evidence.
6. For uncovered sections, set evidence to an empty string.
7. Be honest — do not mark a section as covered unless there is clear evidence in the transcript.`,
  ],
  ['human', '{transcript}'],
]);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Build the section block that gets injected into the prompt template.
 * Each section is rendered with its id, label, and description.
 */
function formatSectionBlock(
  sections: { id: string; label: string; description: string }[]
): string {
  return sections.map((s) => `### ${s.id} — ${s.label}\n${s.description}`).join('\n\n');
}

/* ------------------------------------------------------------------ */
/*  Node factory                                                       */
/* ------------------------------------------------------------------ */

/**
 * Factory that creates the check-completeness node with injected dependencies.
 *
 * Loads the template for the classified entry type, filters to required
 * sections with extraction questions, and asks the LLM to assess which
 * sections the transcript covers. Returns section coverage map,
 * missing sections list, and whether the transcript has enough info.
 */
export function createCheckCompletenessNode(deps: GraphDeps) {
  return async function checkCompletenessNode(
    state: PortfolioStateType
  ): Promise<Partial<PortfolioStateType>> {
    logger.log(
      `Checking completeness for conversation ${state.conversationId} (type: ${state.entryType})`
    );

    // ── Guard: no entry type ──
    if (!state.entryType) {
      logger.warn('No entry type set — skipping completeness check');
      return {
        sectionCoverage: {},
        missingSections: [],
        hasEnoughInfo: true,
      };
    }

    // ── Load template ──
    const specialty = Number(state.specialty) as Specialty;
    const config = getSpecialtyConfig(specialty);
    const template = getTemplateForEntryType(config, state.entryType);

    // ── Filter to assessable sections ──
    // Only required sections with a non-null extractionQuestion
    const assessableSections = template.sections.filter(
      (s) => s.required && s.extractionQuestion !== null
    );

    if (assessableSections.length === 0) {
      logger.log('No assessable sections — proceeding');
      return {
        sectionCoverage: {},
        missingSections: [],
        hasEnoughInfo: true,
      };
    }

    // ── Build and send prompt ──
    const messages = await completenessPrompt.formatMessages({
      templateName: template.name,
      sectionBlock: formatSectionBlock(assessableSections),
      transcript: state.fullTranscript,
    });

    const { data: response } = await deps.llmService.invokeStructured(
      messages,
      completenessResponseSchema,
      { temperature: 0.1, maxTokens: 1000 }
    );

    // ── Post-validate: only accept section IDs we actually asked about ──
    const assessableIds = new Set(assessableSections.map((s) => s.id));

    const sectionCoverage: SectionCoverage = {};
    for (const assessment of response.sections) {
      if (assessableIds.has(assessment.sectionId)) {
        sectionCoverage[assessment.sectionId] = assessment.covered;
      }
    }

    // Any assessable section not returned by the LLM is treated as uncovered
    for (const section of assessableSections) {
      if (!(section.id in sectionCoverage)) {
        sectionCoverage[section.id] = false;
      }
    }

    const missingSections = Object.entries(sectionCoverage)
      .filter(([, covered]) => !covered)
      .map(([id]) => id);

    const hasEnoughInfo = missingSections.length === 0;

    logger.log(
      `Completeness: ${Object.values(sectionCoverage).filter(Boolean).length}/${assessableSections.length} sections covered. ` +
        `Missing: ${missingSections.length > 0 ? missingSections.join(', ') : 'none'}`
    );

    return { sectionCoverage, missingSections, hasEnoughInfo };
  };
}
