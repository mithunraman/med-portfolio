import { Specialty } from '@acme/shared';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { Logger } from '@nestjs/common';
import { z } from 'zod';
import { getSpecialtyConfig, getTemplateForEntryType } from '../../specialties/specialty.registry';
import { getStageContext } from '../../specialties/stage-context';
import { ANALYSIS_STEP_STARTED, GraphDeps } from '../graph-deps';
import { PortfolioStateType, SectionCoverage } from '../portfolio-graph.state';

const logger = new Logger('CheckCompletenessNode');

/* ------------------------------------------------------------------ */
/*  Zod schema — single source of truth for the LLM response shape    */
/* ------------------------------------------------------------------ */

const sectionAssessmentSchema = z.object({
  sectionId: z.string().describe('The section ID from the template'),
  covered: z
    .boolean()
    .describe('Whether the transcript contains ANY relevant information for this section'),
  depth: z
    .enum(['rich', 'adequate', 'shallow'])
    .describe(
      'How thoroughly the section is covered. ' +
        'rich = multiple specific points with reasoning or detail (2+ meaningful sentences). ' +
        'adequate = relevant content present with at least 1 specific detail. ' +
        'shallow = only vague or generic statements (e.g., "I learned a lot") with no specifics. ' +
        'If covered is false, set depth to "shallow".'
    ),
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
    `You are a UK medical portfolio assistant assessing whether a trainee's transcript contains enough information for each section of a {templateName} entry.

## Trainee Context

{trainingStageContext}

## Sections to Assess

{sectionBlock}

## Instructions

1. Read the full transcript carefully.
2. For EACH section listed above, determine whether the transcript contains sufficient information to write that section.
3. A section is "covered" if the trainee has mentioned relevant content — it does not need to be perfectly phrased or comprehensive, just present.
4. A section is NOT covered if there is no mention at all, or only a vague or tangential reference.
5. For covered sections, provide a brief quote or summary from the transcript as evidence.
6. For uncovered sections, set evidence to an empty string.
7. Be honest — do not mark a section as covered unless there is clear evidence in the transcript.
8. For each covered section, also assess the DEPTH of coverage:
   - "rich": The trainee provided multiple specific points, clinical reasoning, or detailed reflection (2+ meaningful sentences of relevant content).
   - "adequate": The trainee mentioned relevant content with at least one specific detail. Enough to work with.
   - "shallow": The trainee said something relevant but it is vague, generic, or lacks any specific detail. Examples: "I learned a lot", "it went well", "I found it useful".
9. If a section is not covered, set depth to "shallow".
10. Be particularly attentive to depth in reflective sections (reflection, learning, what went well, what could improve). Factual sections (presentation, findings, management) are usually either covered or not — depth matters less for them.`,
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
    deps.eventEmitter.emit(ANALYSIS_STEP_STARTED, {
      conversationId: state.conversationId,
      step: 'check_completeness',
    });
    const cid = state.conversationId;
    logger.log(`[${cid}] Checking completeness (type: ${state.entryType})`);

    // ── Guard: no entry type ──
    if (!state.entryType) {
      logger.warn(`[${cid}] No entry type set — skipping completeness check`);
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
      logger.log(`[${cid}] No assessable sections — proceeding`);
      return {
        sectionCoverage: {},
        missingSections: [],
        hasEnoughInfo: true,
      };
    }

    // ── Build and send prompt ──
    const messages = await completenessPrompt.formatMessages({
      templateName: template.name,
      trainingStageContext: getStageContext(specialty, state.trainingStage),
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
        sectionCoverage[assessment.sectionId] = {
          covered: assessment.covered,
          depth: assessment.covered ? assessment.depth : 'shallow',
        };
      }
    }

    // Any assessable section not returned by the LLM is treated as uncovered
    for (const section of assessableSections) {
      if (!(section.id in sectionCoverage)) {
        sectionCoverage[section.id] = { covered: false, depth: 'shallow' };
      }
    }

    // Missing = uncovered OR shallow (for required sections)
    const missingSections = Object.entries(sectionCoverage)
      .filter(([, assessment]) => !assessment.covered || assessment.depth === 'shallow')
      .map(([id]) => id);

    const hasEnoughInfo = missingSections.length === 0;

    const coveredCount = Object.values(sectionCoverage).filter((a) => a.covered && a.depth !== 'shallow').length;

    // Log per-section detail so we can trace exactly what the LLM assessed
    for (const assessment of response.sections) {
      if (!assessableIds.has(assessment.sectionId)) continue;
      const cov = sectionCoverage[assessment.sectionId];
      const isMissing = !cov?.covered || cov.depth === 'shallow';
      logger.log(
        `[${cid}]   section=${assessment.sectionId} covered=${cov?.covered} depth=${cov?.depth}` +
          `${isMissing ? ' → MISSING' : ''}` +
          `${assessment.evidence ? ` evidence="${assessment.evidence.slice(0, 80)}..."` : ''}`
      );
    }

    logger.log(
      `[${cid}] Completeness: ${coveredCount}/${assessableSections.length} sections adequate. ` +
        `Missing/shallow: [${missingSections.join(', ')}]. hasEnoughInfo=${hasEnoughInfo}`
    );

    return { sectionCoverage, missingSections, hasEnoughInfo };
  };
}
