import { Specialty } from '@acme/shared';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { Logger } from '@nestjs/common';
import { z } from 'zod';
import { getSpecialtyConfig, getTemplateForEntryType } from '../../specialties/specialty.registry';
import { GraphDeps } from '../graph-deps';
import { PortfolioStateType } from '../portfolio-graph.state';

const logger = new Logger('ReflectNode');

/* ------------------------------------------------------------------ */
/*  Zod schema — single source of truth for the LLM response shape    */
/* ------------------------------------------------------------------ */

/**
 * The reflection is returned as a single Markdown string with section
 * headings baked in. This keeps the output portable — downstream nodes,
 * the review UI, and the final export all consume one coherent text
 * rather than assembling fragments.
 */
const reflectResponseSchema = z.object({
  reflection: z
    .string()
    .describe(
      'The complete reflection as Markdown text with section headings. ' +
        'Written in first person, honest and professional.'
    ),
});

/* ------------------------------------------------------------------ */
/*  Prompt template                                                    */
/* ------------------------------------------------------------------ */

/**
 * ChatPromptTemplate separates the template structure from runtime data.
 *
 * Variables:
 *  - specialtyName: e.g. "General Practice"
 *  - templateName: e.g. "Clinical Case Review"
 *  - wordMin / wordMax: target word count range from the template
 *  - sectionBlock: formatted sections with labels and promptHints
 *  - capabilityBlock: tagged capabilities for the LLM to weave in
 *
 * The human message is the raw transcript — passed directly from state.
 */
const reflectPrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are an educational writing assistant for {specialtyName} portfolio reflections.

Your task: generate a structured {templateName} reflection based on the trainee's transcript. The reflection should read as if written by the trainee — authentic, specific, and professionally honest.

## Sections

Write the reflection with the following sections, in order. Use each section heading as a Markdown heading (## Section Label).

{sectionBlock}

## Tagged Capabilities

The following capabilities have been identified in the transcript. Weave them naturally into the relevant sections — do not list them mechanically or force them where they don't fit.

{capabilityBlock}

## Writing Guidelines

1. Write in FIRST PERSON ("I").
2. Be specific — refer to details from the transcript, not generic statements.
3. Do NOT invent clinical facts, patient details, or events not present in the transcript.
4. Do NOT include any patient-identifiable information.
5. Include clinical reasoning under uncertainty where relevant.
6. Address what went well AND what could be improved — balanced, honest reflection.
7. End with concrete learning points and commitments to change.
8. Target word count: {wordMin}-{wordMax} words. Do not significantly exceed the upper limit.
9. Tone: professional, reflective, self-aware. Not defensive, not self-congratulatory.
10. Only include sections where the transcript provides content. Skip optional sections if there is nothing meaningful to say.`,
  ],
  ['human', '{transcript}'],
]);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Build the section block that gets injected into the prompt template.
 * Each section is rendered with its label, description, and the LLM
 * prompt hint that guides tone and content for that section.
 */
function formatSectionBlock(
  sections: { label: string; required: boolean; description: string; promptHint: string }[]
): string {
  return sections
    .map(
      (s) =>
        `### ${s.label}${s.required ? '' : ' (optional)'}\n` +
        `${s.description}\n` +
        `Guidance: ${s.promptHint}`
    )
    .join('\n\n');
}

/**
 * Build a concise capability summary for inclusion in the prompt.
 * Keeps it short so it doesn't dominate the context window.
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
/*  Node factory                                                       */
/* ------------------------------------------------------------------ */

/**
 * Factory that creates the reflect node with injected dependencies.
 *
 * Loads the template for the classified entry type, builds a prompt
 * from the template's section labels and promptHints, and generates
 * a structured reflection in the trainee's voice.
 *
 * Uses moderate temperature (0.4) because this is generative writing,
 * not classification or extraction. Higher than the extraction nodes
 * but still constrained enough to stay grounded in the transcript.
 *
 * The maxTokens budget is derived from the template's word count range
 * (1 token ≈ 0.75 words, plus headroom for Markdown structure).
 */
export function createReflectNode(deps: GraphDeps) {
  return async function reflectNode(
    state: PortfolioStateType
  ): Promise<Partial<PortfolioStateType>> {
    logger.log(
      `Generating reflection for conversation ${state.conversationId} (type: ${state.entryType})`
    );

    // ── Guard: no entry type ──
    if (!state.entryType) {
      logger.warn('No entry type set — skipping reflection');
      return { reflection: null };
    }

    // ── Load template ──
    const specialty = Number(state.specialty) as Specialty;
    const config = getSpecialtyConfig(specialty);
    const template = getTemplateForEntryType(config, state.entryType);

    // ── Estimate maxTokens from word count range ──
    // 1 token ≈ 0.75 words. Use the upper word limit with 40% headroom
    // for Markdown headings and structural tokens.
    const maxTokens = Math.ceil((template.wordCountRange.max / 0.75) * 1.4);

    // ── Build and send prompt ──
    const messages = await reflectPrompt.formatMessages({
      specialtyName: config.name,
      templateName: template.name,
      wordMin: template.wordCountRange.min.toString(),
      wordMax: template.wordCountRange.max.toString(),
      sectionBlock: formatSectionBlock(template.sections),
      capabilityBlock: formatCapabilityBlock(state.capabilities),
      transcript: state.fullTranscript,
    });

    const { data: response } = await deps.llmService.invokeStructured(
      messages,
      reflectResponseSchema,
      { temperature: 0.4, maxTokens }
    );

    const wordCount = response.reflection.split(/\s+/).filter(Boolean).length;

    logger.log(
      `Reflection generated: ${wordCount} words ` +
        `(target: ${template.wordCountRange.min}-${template.wordCountRange.max})`
    );

    return { reflection: response.reflection };
  };
}
