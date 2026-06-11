import type { BaseMessage } from '@langchain/core/messages';
import type { z } from 'zod';
import { OpenAIModels, type LLMService, type StructuredResponse } from '../../../llm/llm.service';

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
        const model = (options as Record<string, unknown>).model ?? OpenAIModels.GPT_4_1_MINI;
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
 * Build a canned classify response.
 * Default: CLINICAL_CASE_REVIEW with high confidence.
 */
export function classifyResponse(
  overrides: Partial<{
    isRelevant: boolean;
    entryType: string;
    confidence: number;
    reasoning: string;
    signalsFound: string[];
    alternatives: Array<{ entryType: string; confidence: number; reasoning: string }>;
  }> = {}
) {
  return {
    isRelevant: overrides.isRelevant ?? true,
    entryType: overrides.entryType ?? 'CLINICAL_CASE_REVIEW',
    confidence: overrides.confidence ?? 0.92,
    reasoning: overrides.reasoning ?? 'Patient presentation with clinical details',
    signalsFound: overrides.signalsFound ?? [
      'specific patient',
      'clinical details',
      'management plan',
    ],
    alternatives: overrides.alternatives ?? [
      { entryType: 'OUT_OF_HOURS', confidence: 0.3, reasoning: 'Could be OOH' },
    ],
  };
}

/**
 * Build a canned completeness response (partition + rubric-grade).
 * Provide section IDs with their coverage status. Covered sections get one
 * assignment plus a grade whose tier maps to the requested depth; uncovered
 * sections get neither (the node's structural floor then marks them missing).
 */
export function completenessResponse(
  sections: Array<{ sectionId: string; covered: boolean; depth?: 'rich' | 'adequate' | 'shallow'; idea?: string }>
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

  return { assignments, sectionGrades };
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
] as const;

/**
 * Completeness response where all CCR sections clear their readiness threshold.
 *
 * `clinical_reasoning` and `reflection` carry a `strong` threshold (Phase 1), so
 * they need `rich` depth (2+ substantive ideas) to count as met; the factual
 * sections clear at `adequate`.
 */
export function allCoveredResponse() {
  const strongThreshold = new Set(['clinical_reasoning', 'reflection']);
  return completenessResponse(
    CCR_ASSESSABLE_SECTIONS.map((id) => ({
      sectionId: id,
      covered: true,
      depth: strongThreshold.has(id) ? 'rich' : 'adequate',
    }))
  );
}

/**
 * Build a canned elicit-justification response (Phase 2).
 * One entry per confirmed capability: the trainee's descriptor-linked actions
 * plus whether that justification is strong.
 */
export function elicitJustificationResponse(
  justifications: Array<{ code: string; justification: string; isStrong: boolean }>
) {
  return { justifications };
}

/**
 * Build a canned tag-capabilities response (recognition-based).
 * Default: assessments for all 13 GP capabilities, with 2 demonstrated.
 */
export function tagCapabilitiesResponse(
  overrides?: Partial<{
    assessments: Array<{
      code: string;
      demonstrated: boolean;
      confidence: number;
      reasoning: string;
      quote: string;
    }>;
  }>
) {
  return {
    assessments: overrides?.assessments ?? [
      {
        code: 'C-06',
        demonstrated: true,
        confidence: 0.88,
        reasoning: 'Managed the patient with type 2 diabetes, demonstrating ability to handle complex medical cases.',
        // Verbatim substring of the seeded transcript — must survive the tag node's quote gate.
        quote: 'I saw a 55-year-old patient with poorly controlled type 2 diabetes',
      },
      {
        code: 'C-08',
        demonstrated: true,
        confidence: 0.75,
        reasoning: 'Independently decided to start metformin, showing autonomous clinical decision-making.',
        quote: 'I started metformin and discussed lifestyle changes',
      },
      { code: 'C-01', demonstrated: false, confidence: 0, reasoning: '', quote: '' },
      { code: 'C-02', demonstrated: false, confidence: 0, reasoning: '', quote: '' },
      { code: 'C-03', demonstrated: false, confidence: 0, reasoning: '', quote: '' },
      { code: 'C-04', demonstrated: false, confidence: 0, reasoning: '', quote: '' },
      { code: 'C-05', demonstrated: false, confidence: 0, reasoning: '', quote: '' },
      { code: 'C-07', demonstrated: false, confidence: 0, reasoning: '', quote: '' },
      { code: 'C-09', demonstrated: false, confidence: 0, reasoning: '', quote: '' },
      { code: 'C-10', demonstrated: false, confidence: 0, reasoning: '', quote: '' },
      { code: 'C-11', demonstrated: false, confidence: 0, reasoning: '', quote: '' },
      { code: 'C-12', demonstrated: false, confidence: 0, reasoning: '', quote: '' },
      { code: 'C-13', demonstrated: false, confidence: 0, reasoning: '', quote: '' },
    ],
  };
}

/**
 * Build a canned reflect response.
 * Default: a short structured reflection with section headings.
 */
export function reflectResponse(
  overrides?: Partial<{
    title: string;
    sections: Array<{ sectionId: string; title: string; text: string; covered: boolean }>;
    capabilityAnnotations: Array<{ sectionId: string; capabilityCode: string; evidence: string }>;
  }>
) {
  return {
    title: overrides?.title ?? 'T2DM Management in Elderly Patient',
    sections: overrides?.sections ?? [
      {
        sectionId: 'presentation',
        title: 'Presentation',
        text: 'I saw a 55-year-old patient with poorly controlled type 2 diabetes.',
        covered: true,
      },
      {
        sectionId: 'clinical_reasoning',
        title: 'Clinical Reasoning',
        text: 'I considered the HbA1c of 72 and decided to initiate metformin.',
        covered: true,
      },
      {
        sectionId: 'reflection',
        title: 'Reflection',
        text: 'This case reinforced the importance of shared decision making in chronic disease management.',
        covered: true,
      },
    ],
    capabilityAnnotations: overrides?.capabilityAnnotations ?? [],
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

/** Completeness response with specified sections missing. */
export function someMissingResponse(missingSectionIds: string[]) {
  return completenessResponse(
    CCR_ASSESSABLE_SECTIONS.map((id) => ({
      sectionId: id,
      covered: !missingSectionIds.includes(id),
    }))
  );
}
