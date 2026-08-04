import type { BaseMessage } from '@langchain/core/messages';
import type { z } from 'zod';
import type { LLMService, StructuredResponse } from '../../../llm/llm.service';

/**
 * A recorded LLM call for post-test assertions.
 */
export interface RecordedLLMCall {
  messages: BaseMessage[];
  schema: z.ZodType<unknown>;
  options: Record<string, unknown>;
}

/**
 * Sequential mock for LLMService.invokeStructured().
 *
 * Returns canned responses in order. Throws if more calls are made
 * than responses were queued. Also captures call inputs so tests
 * can assert what prompts / transcripts were sent to the LLM.
 */
export class SequentialLLMMock {
  private responses: unknown[] = [];
  private callIndex = 0;
  readonly calls: RecordedLLMCall[] = [];

  /** Queue a response to be returned on the next invokeStructured() call. */
  enqueue<T>(data: T): this {
    this.responses.push(data);
    return this;
  }

  /** Queue multiple responses at once. */
  enqueueAll(responses: unknown[]): this {
    this.responses.push(...responses);
    return this;
  }

  /** Reset the mock state (responses + calls). */
  reset(): void {
    this.responses = [];
    this.callIndex = 0;
    this.calls.length = 0;
  }

  /** The number of invokeStructured() calls made so far. */
  get callCount(): number {
    return this.calls.length;
  }

  /** Assert that all enqueued responses have been consumed. */
  assertAllConsumed(): void {
    if (this.callIndex < this.responses.length) {
      throw new Error(
        `LLM mock: ${this.responses.length - this.callIndex} response(s) were never consumed. ` +
          `Expected ${this.responses.length} calls but only ${this.callIndex} were made.`
      );
    }
  }

  /**
   * Build a mock LLMService object.
   * Only invokeStructured() is implemented — transcribeAudio() throws.
   */
  build(): LLMService {
    return {
      invokeStructured: async <T>(
        messages: BaseMessage[],
        schema: z.ZodType<T>,
        options: Record<string, unknown> = {}
      ): Promise<StructuredResponse<T>> => {
        this.calls.push({ messages, schema, options });

        if (this.callIndex >= this.responses.length) {
          throw new Error(
            `LLM mock: unexpected call #${this.callIndex + 1}. ` +
              `Only ${this.responses.length} response(s) were enqueued.`
          );
        }

        const data = this.responses[this.callIndex++] as T;
        const model = (options.model ?? options.deployment ?? 'mock-model') as string;
        return { data, model, tokensUsed: null } as StructuredResponse<T>;
      },
      transcribeAudio: async () => {
        throw new Error('LLM mock: transcribeAudio() is not implemented');
      },
    } as unknown as LLMService;
  }
}

// ── Response builders ──

/**
 * Build a canned completeness response (partition + rubric-grade).
 * Provide section IDs with their coverage status. Covered sections get one
 * assignment plus a grade whose tier maps to the requested depth; uncovered
 * sections get neither (the node's structural floor then marks them missing).
 */
export function completenessResponse(
  sections: Array<{
    sectionId: string;
    covered: boolean;
    depth?: 'rich' | 'adequate' | 'shallow';
    idea?: string;
  }>,
  /** Set false to exercise the reject_entry branch (see completenessRouter). */
  isRelevant = true
) {
  const TIER_BY_DEPTH = { rich: 'strong', adequate: 'adequate', shallow: 'shallow' } as const;
  const assignments: Array<{ idea: string; sectionId: string }> = [];
  const sectionGrades: Array<{
    sectionId: string;
    tierReason: string;
    tier: 'strong' | 'adequate' | 'shallow';
  }> = [];

  for (const s of sections) {
    if (!s.covered) continue;

    const depth = s.depth ?? 'adequate';
    assignments.push({ idea: s.idea ?? 'Idea from transcript', sectionId: s.sectionId });
    sectionGrades.push({
      sectionId: s.sectionId,
      tierReason: `graded ${depth}`,
      tier: TIER_BY_DEPTH[depth],
    });
  }

  return {
    relevanceReason: isRelevant ? 'clinical experience described' : 'no clinical content',
    isRelevant,
    assignments,
    sectionGrades,
  };
}

/**
 * Build a canned follow-up questions response.
 */
export function followupQuestionsResponse(
  questions: Array<{ sectionId: string; question: string; hints?: { examples: string[] } }>
) {
  return {
    questions: questions.map((q) => ({
      sectionId: q.sectionId,
      question: q.question,
      hints: q.hints ?? {
        examples: ['Example response from a different clinical scenario.'],
      },
    })),
  };
}

/** CCR sections that check_completeness will assess (required + has extractionQuestion). */
export const CCR_ASSESSABLE_SECTIONS = [
  'presentation',
  'clinical_reasoning',
  'management',
  'outcome',
  'reflection',
  'learning_needs',
] as const;

/**
 * "Everything covered strongly" — the grade that clears the elicitation rubric AND
 * the coverage floor, so the run proceeds straight to tag_capabilities.
 *
 * Must grade every section `rich` (→ strong tier). A section left at `adequate`
 * meets its bar, but — unasked — is a borderline pass the coverage floor still
 * forces one confirmatory question on (see `unconfirmedSections`), which would
 * park the run at ask_followup instead of proceeding. To model that on-purpose,
 * use `adequateUnaskedResponse()` below.
 */
export function allCoveredResponse() {
  return completenessResponse(
    CCR_ASSESSABLE_SECTIONS.map((id) => ({ sectionId: id, covered: true, depth: 'rich' }))
  );
}

/**
 * "Covered, but one section sits at the adequate floor, unasked." Every section
 * meets its threshold (rubric met), but the given section(s) pass only at
 * `adequate` and — never having been asked — are borderline passes the coverage
 * floor forces a confirmatory question on before the run may proceed (see
 * `unconfirmedSections`). Defaults to a single unconfirmed section so it forces
 * exactly ONE follow-up round. The other sections are graded `rich` so they are
 * unambiguous and clear immediately (including the strong-threshold ones).
 */
export function adequateUnaskedResponse(adequateSections: readonly string[] = ['learning_needs']) {
  const adequate = new Set(adequateSections);
  return completenessResponse(
    CCR_ASSESSABLE_SECTIONS.map((id) => ({
      sectionId: id,
      covered: true,
      depth: adequate.has(id) ? 'adequate' : 'rich',
    }))
  );
}

/**
 * Build a canned elicit-justification response.
 * One entry per confirmed capability: a verbatim `sourceQuote` anchor, the
 * tidied `justification`, and the graded `justificationTier`. `sourceQuote`
 * defaults to the justification text — pass a real transcript substring when a
 * test needs the verbatim gate to pass (and thus `justified` to stay true).
 */
export function elicitJustificationResponse(
  justifications: Array<{
    code: string;
    justification: string;
    justificationTier: 'missing' | 'shallow' | 'adequate' | 'strong';
    sourceQuote?: string;
    descriptorClause?: string;
  }>
) {
  return {
    justifications: justifications.map((j) => ({
      code: j.code,
      sourceQuote: j.sourceQuote ?? j.justification,
      descriptorClause: j.descriptorClause ?? '',
      justification: j.justification,
      justificationTier: j.justificationTier,
    })),
  };
}

/**
 * Build a canned tag-capabilities response (recognition-based).
 * Default: grades for all 13 GP capabilities, with 2 at 'strong'/'adequate'.
 */
export function tagCapabilitiesResponse(
  overrides?: Partial<{
    assessments: Array<{
      code: string;
      tier: 'missing' | 'shallow' | 'adequate' | 'strong';
      reasoning: string;
      quote: string;
    }>;
  }>
) {
  return {
    assessments: overrides?.assessments ?? [
      {
        code: 'C-06',
        tier: 'strong',
        reasoning:
          'Managed the patient with type 2 diabetes, demonstrating ability to handle complex medical cases.',
        // Verbatim substring of the seeded transcript — must survive the tag node's quote gate.
        quote: 'I saw a 55-year-old patient with poorly controlled type 2 diabetes',
      },
      {
        code: 'C-08',
        tier: 'adequate',
        reasoning:
          'Independently decided to start metformin, showing autonomous clinical decision-making.',
        quote: 'I started metformin and discussed lifestyle changes',
      },
      { code: 'C-01', tier: 'missing', reasoning: '', quote: '' },
      { code: 'C-02', tier: 'missing', reasoning: '', quote: '' },
      { code: 'C-03', tier: 'missing', reasoning: '', quote: '' },
      { code: 'C-04', tier: 'missing', reasoning: '', quote: '' },
      { code: 'C-05', tier: 'missing', reasoning: '', quote: '' },
      { code: 'C-07', tier: 'missing', reasoning: '', quote: '' },
      { code: 'C-09', tier: 'missing', reasoning: '', quote: '' },
      { code: 'C-10', tier: 'missing', reasoning: '', quote: '' },
      { code: 'C-11', tier: 'missing', reasoning: '', quote: '' },
      { code: 'C-12', tier: 'missing', reasoning: '', quote: '' },
      { code: 'C-13', tier: 'missing', reasoning: '', quote: '' },
    ],
  };
}

/**
 * Build a canned reflect response (nested: each section carries its probes and,
 * for sections with compose guidance, a narrative). Default models a CCR entry;
 * narratives are left empty so the assemble step falls back to a deterministic
 * concat of the probe text. Field order matches reflectResponseSchema.
 */
export function reflectResponse(
  overrides?: Partial<{
    title: string;
    sections: Array<{
      sectionId: string;
      probes: Array<{ probeId: string; title: string; text: string; covered: boolean }>;
      narrative: string;
    }>;
  }>
) {
  return {
    sections: overrides?.sections ?? [
      {
        sectionId: 'brief_description',
        probes: [
          {
            probeId: 'presentation',
            title: 'Clinical Presentation',
            text: 'I saw a 55-year-old patient with poorly controlled type 2 diabetes.',
            covered: true,
          },
          { probeId: 'clinical_findings', title: 'Clinical Findings', text: '', covered: false },
          {
            probeId: 'clinical_reasoning',
            title: 'Clinical Reasoning',
            text: 'I considered the HbA1c of 72 and decided to initiate metformin.',
            covered: true,
          },
          {
            probeId: 'management',
            title: 'Management & Actions',
            text: 'I started metformin and discussed lifestyle changes.',
            covered: true,
          },
          { probeId: 'outcome', title: 'Patient Outcome', text: '', covered: false },
        ],
        narrative: '',
      },
      {
        sectionId: 'reflection',
        probes: [
          {
            probeId: 'reflection',
            title: 'Reflection',
            text: 'This case reinforced the importance of shared decision making in chronic disease management.',
            covered: true,
          },
        ],
        narrative: '',
      },
      {
        sectionId: 'learning',
        probes: [
          {
            probeId: 'learning_needs',
            title: 'Learning Needs',
            text: 'I need to read up on the latest diabetes guidelines.',
            covered: true,
          },
        ],
        narrative: '',
      },
    ],
    title: overrides?.title ?? 'T2DM Management in Elderly Patient',
  };
}

/**
 * Build a canned generate-pdp response.
 * Default: one PDP goal with one SMART action.
 */
export function generatePdpResponse() {
  return {
    goals: [
      {
        learningNeed: 'I need to read up on the latest diabetes guidelines.',
        goal: 'Improve confidence managing type 2 diabetes in primary care',
        actions: [
          {
            action: 'Attend a diabetes update tutorial and present a case review to peers',
            intendedEvidence: 'Reflective log entry submitted to portfolio',
          },
        ],
      },
    ],
  };
}

/**
 * Build a canned refine response. The refine node merges the reflect document
 * per section; an empty `sections` array means "no changes proposed", so every
 * section falls back to the reflect text unchanged — the safe no-op the full
 * pipeline tests want. Pass sections to exercise an actual merge.
 */
export function refineResponse(sections: Array<{ sectionId: string; text: string }> = []) {
  return { sections };
}

/** Completeness response with specified sections missing. */
export function someMissingResponse(missingSectionIds: string[]) {
  return completenessResponse(
    CCR_ASSESSABLE_SECTIONS.map((id) => ({
      sectionId: id,
      covered: !missingSectionIds.includes(id),
    }))
  );
}
