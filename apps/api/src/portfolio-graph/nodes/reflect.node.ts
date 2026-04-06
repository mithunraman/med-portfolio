import { Specialty } from '@acme/shared';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { Logger } from '@nestjs/common';
import { z } from 'zod';
import { OpenAIModels } from '../../llm/llm.service';
import { getStageContext } from '../../specialties/stage-context';
import { getSpecialtyConfig, getTemplateForEntryType } from '../../specialties/specialty.registry';
import { ANALYSIS_STEP_STARTED, GraphDeps } from '../graph-deps';
import { PortfolioStateType } from '../portfolio-graph.state';

const logger = new Logger('ReflectNode');

/* ------------------------------------------------------------------ */
/*  Zod schema — single source of truth for the LLM response shape    */
/* ------------------------------------------------------------------ */

/**
 * The reflection is returned as a structured array of sections, each with
 * a sectionId, title, text, and covered flag. Sections with no matching
 * transcript content have covered: false and text: "".
 *
 * Capability annotations are returned as a separate metadata array —
 * they are NOT embedded in section text.
 */
const reflectResponseSchema = z.object({
  title: z
    .string()
    .max(100)
    .describe('A concise title summarising the artefact for list views (max 100 chars)'),
  sections: z
    .array(
      z.object({
        sectionId: z.string().describe('Template section ID, e.g., "clinical_reasoning"'),
        title: z.string().describe('Section heading, e.g., "Clinical Reasoning"'),
        text: z
          .string()
          .describe(
            "The trainee's own words organised for this section. " +
              'Empty string if no content maps to this section.'
          ),
        covered: z.boolean().describe('Whether the transcript contained content for this section'),
      })
    )
    .describe('All template sections in order, including empty ones'),
  capabilityAnnotations: z
    .array(
      z.object({
        sectionId: z.string().describe('Which section demonstrates this capability'),
        capabilityCode: z.string().describe('Capability code, e.g., "C-06"'),
        evidence: z.string().describe('Direct quote from the transcript as evidence'),
      })
    )
    .describe('Capabilities mapped to sections as metadata — NOT embedded in section text'),
});

/* ------------------------------------------------------------------ */
/*  Prompt template                                                    */
/* ------------------------------------------------------------------ */

const reflectPrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are a medical portfolio formatting assistant for {specialtyName} trainees.

Your task: organise the trainee's transcript into the template sections below. You are NOT writing a reflection — you are sorting and lightly formatting what the trainee has already said.

## Trainee Context

{trainingStageContext}

Use this context to calibrate formatting only:
- For earlier-stage trainees, more cleanup of speech fragments is expected.
- For later-stage trainees, preserve more precise clinical language.
- Do NOT use training stage to add content or change what the trainee said.

## Sections

Organise the transcript into these sections, in order. Return ALL sections — set covered: false and text: "" for sections with no matching content.

{sectionBlock}

## Formatting Rules

1. Use ONLY the trainee's own words and phrasing.
2. You may fix grammar, punctuation, and sentence fragments from speech-to-text.
3. You may reorder sentences so related content sits together within a section.
4. Do NOT add reflective language, clinical reasoning, or insights the trainee did not express.
5. Do NOT paraphrase or synthesise — preserve the trainee's voice.
6. Do NOT expand brief statements into detailed paragraphs.
7. Write in first person ("I"), matching the trainee's own voice.

## What "lightly formatting" means — examples

OK: Joining fragments ("the ECG was. normal sinus" → "The ECG was normal sinus rhythm.")
OK: Fixing speech-to-text errors ("met four men" → "Metformin")
OK: Adding paragraph breaks between distinct points within a section
NOT OK: "I was a bit relieved" → "I experienced initial reassurance"
NOT OK: Adding transition phrases the trainee didn't say
NOT OK: "I learned a lot" → "This case deepened my understanding of..."

## Capability Annotations

The following capabilities were confirmed by the trainee. For each, identify which section demonstrates it and provide a brief evidence quote from the transcript.

Do NOT mention capabilities in the section text. Return them as capabilityAnnotations only.

{capabilityBlock}`,
  ],
  ['human', '{transcript}'],
]);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Build the section block for the extraction/organisation prompt.
 * Each section includes its ID, label, description, and sorting guidance.
 */
function formatSectionBlock(
  sections: { id: string; label: string; required: boolean; description: string; promptHint: string }[]
): string {
  return sections
    .map(
      (s) =>
        `### ${s.id} — ${s.label}${s.required ? '' : ' (optional)'}\n` +
        `Content to look for: ${s.description}\n` +
        `Sorting guidance: ${s.promptHint}`
    )
    .join('\n\n');
}

/**
 * Build a concise capability summary for the LLM to map to sections.
 */
function formatCapabilityBlock(
  capabilities: { code: string; name: string; reasoning: string }[]
): string {
  if (capabilities.length === 0) return 'None identified.';

  return capabilities.map((c) => `- ${c.code} ${c.name}: ${c.reasoning}`).join('\n');
}

/* ------------------------------------------------------------------ */
/*  Node factory                                                       */
/* ------------------------------------------------------------------ */

/**
 * Factory that creates the reflect node with injected dependencies.
 *
 * Loads the template for the classified entry type, builds a prompt
 * from the template's section definitions, and organises the trainee's
 * transcript into structured sections. The AI formats and sorts —
 * it does not generate reflective content.
 *
 * Uses low temperature (0.1) because this is an extraction/formatting
 * task, not creative writing. The output should faithfully preserve
 * the trainee's own words.
 *
 * Token budget is proportional to transcript length (not a fixed
 * word count target), since output length should reflect input length.
 */
export function createReflectNode(deps: GraphDeps) {
  return async function reflectNode(
    state: PortfolioStateType
  ): Promise<Partial<PortfolioStateType>> {
    deps.eventEmitter.emit(ANALYSIS_STEP_STARTED, {
      conversationId: state.conversationId,
      step: 'reflect',
    });
    const cid = state.conversationId;
    logger.log(`[${cid}] Organising reflection (type: ${state.entryType})`);

    // ── Guard: no entry type ──
    if (!state.entryType) {
      logger.warn(`[${cid}] No entry type set — skipping reflection`);
      return { reflection: null };
    }

    // ── Load template ──
    const specialty = Number(state.specialty) as Specialty;
    const config = getSpecialtyConfig(specialty);
    const template = getTemplateForEntryType(config, state.entryType);

    // ── Token budget proportional to transcript length ──
    // 2× headroom for JSON overhead + section headings. Floor at 2000.
    const transcriptWordCount = state.fullTranscript.split(/\s+/).filter(Boolean).length;
    const maxTokens = Math.max(Math.ceil(transcriptWordCount * 2), 2000);

    // ── Build and send prompt ──
    const messages = await reflectPrompt.formatMessages({
      specialtyName: config.name,
      trainingStageContext: getStageContext(specialty, state.trainingStage),
      sectionBlock: formatSectionBlock(template.sections),
      capabilityBlock: formatCapabilityBlock(state.capabilities),
      transcript: state.fullTranscript,
    });

    const { data: response } = await deps.llmService.invokeStructured(
      messages,
      reflectResponseSchema,
      { model: OpenAIModels.GPT_4_1_MINI, temperature: 0.1, maxTokens }
    );

    const coveredCount = response.sections.filter((s) => s.covered).length;
    const wordCount = response.sections.reduce(
      (sum, s) => sum + s.text.split(/\s+/).filter(Boolean).length,
      0
    );

    // Log per-section detail for traceability
    for (const s of response.sections) {
      const sectionWords = s.text.split(/\s+/).filter(Boolean).length;
      logger.log(
        `[${cid}]   section=${s.sectionId} covered=${s.covered} words=${sectionWords}`
      );
    }
    logger.log(
      `[${cid}] Reflection organised: ${coveredCount}/${response.sections.length} sections covered, ` +
        `${wordCount} words, ${response.capabilityAnnotations.length} capability annotations, ` +
        `maxTokens=${maxTokens}, transcriptWords=${transcriptWordCount}`
    );

    return {
      title: response.title,
      reflection: response.sections,
    };
  };
}
