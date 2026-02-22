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
    const self = this;
    return {
      invokeStructured: async <T>(
        messages: BaseMessage[],
        schema: z.ZodType<T>,
        options: Record<string, unknown> = {}
      ): Promise<StructuredResponse<T>> => {
        self.calls.push({ messages, schema, options });

        if (self.callIndex >= self.responses.length) {
          throw new Error(
            `LLM mock: unexpected call #${self.callIndex + 1}. ` +
              `Only ${self.responses.length} response(s) were enqueued.`
          );
        }

        const data = self.responses[self.callIndex++] as T;
        return { data, model: 'gpt-4.1' as any, tokensUsed: null };
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
export function classifyResponse(overrides: Partial<{
  entryType: string;
  confidence: number;
  reasoning: string;
  signalsFound: string[];
  alternatives: Array<{ entryType: string; confidence: number; reasoning: string }>;
}> = {}) {
  return {
    entryType: overrides.entryType ?? 'CLINICAL_CASE_REVIEW',
    confidence: overrides.confidence ?? 0.92,
    reasoning: overrides.reasoning ?? 'Patient presentation with clinical details',
    signalsFound: overrides.signalsFound ?? ['specific patient', 'clinical details', 'management plan'],
    alternatives: overrides.alternatives ?? [
      { entryType: 'OUT_OF_HOURS', confidence: 0.3, reasoning: 'Could be OOH' },
    ],
  };
}

/**
 * Build a canned completeness response.
 * Provide section IDs with their coverage status.
 */
export function completenessResponse(
  sections: Array<{ sectionId: string; covered: boolean; evidence?: string }>
) {
  return {
    sections: sections.map((s) => ({
      sectionId: s.sectionId,
      covered: s.covered,
      evidence: s.evidence ?? (s.covered ? 'Evidence from transcript' : ''),
    })),
  };
}

/**
 * Build a canned follow-up questions response.
 */
export function followupQuestionsResponse(
  questions: Array<{ sectionId: string; question: string }>
) {
  return { questions };
}

/** CCR sections that check_completeness will assess (required + has extractionQuestion). */
export const CCR_ASSESSABLE_SECTIONS = [
  'presentation',
  'clinical_reasoning',
  'management',
  'outcome',
  'reflection',
] as const;

/** Completeness response where all CCR sections are covered. */
export function allCoveredResponse() {
  return completenessResponse(
    CCR_ASSESSABLE_SECTIONS.map((id) => ({ sectionId: id, covered: true }))
  );
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
