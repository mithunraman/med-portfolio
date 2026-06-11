import * as Sentry from '@sentry/nestjs';
import { adjustConfidence, createClassifyNode } from '../classify.node';
import type { GraphDeps } from '../../graph-deps';
import type { PortfolioStateType } from '../../portfolio-graph.state';

jest.mock('@sentry/nestjs', () => ({
  captureException: jest.fn(),
}));

function makeDeps(): GraphDeps {
  return {
    artefactsRepository: {} as any,
    conversationsRepository: {} as any,
    pdpGoalsRepository: {} as any,
    transactionService: {} as any,
    llmService: { invokeStructured: jest.fn() } as any,
    eventEmitter: { emit: jest.fn() } as any,
  };
}

function makeState(overrides: Partial<PortfolioStateType> = {}): PortfolioStateType {
  return {
    conversationId: 'conv-123',
    artefactId: 'art-123',
    userId: 'user-123',
    specialty: '100', // GP
    trainingStage: 'ST1',
    fullTranscript: 'Saw a patient with chest pain, examined, started treatment, referred.',

    isRelevant: true,
    entryType: null,
    classificationConfidence: 0,
    classificationReasoning: '',

    alternatives: [],
    classificationConfirmed: false,
    clarificationRound: 0,
    missingSections: [],
    hasEnoughInfo: false,
    followUpRound: 0,
    pendingFollowupQuestions: [],
    capabilities: [],
    title: null,
    reflection: null,

    pdpGoals: [],

    ...overrides,
  } as PortfolioStateType;
}

describe('adjustConfidence', () => {
  // ── Relevance gate ──

  it('should return 0 when isRelevant is false regardless of other factors', () => {
    expect(adjustConfidence(0.95, 200, 5, [], false)).toBe(0);
  });

  it('should return 0 when isRelevant is false even with high raw confidence', () => {
    expect(adjustConfidence(1.0, 1000, 10, [], false)).toBe(0);
  });

  // ── Normal rules when relevant ──

  it('should pass through high confidence when all signals are strong', () => {
    expect(adjustConfidence(0.95, 200, 5, [], true)).toBe(0.95);
  });

  it('should cap at 0.85 when transcript is shorter than 50 words', () => {
    expect(adjustConfidence(0.95, 30, 5, [], true)).toBe(0.85);
  });

  it('should cap at 0.9 when fewer than 2 signals are found', () => {
    expect(adjustConfidence(0.95, 200, 1, [], true)).toBe(0.9);
  });

  it('should reduce by 0.1 when top alternative is within 0.15', () => {
    const alternatives = [{ entryType: 'ALT', confidence: 0.88, reasoning: 'close' }];
    // raw=0.95, adjusted starts at 0.95, alt is 0.88, gap=0.07 < 0.15 → 0.95-0.1=0.85
    expect(adjustConfidence(0.95, 200, 5, alternatives, true)).toBe(0.85);
  });

  it('should apply multiple caps (short transcript + few signals)', () => {
    // raw=0.95, short (<50 words) → cap 0.85, few signals (<2) → cap 0.9
    // min(0.85, 0.9) = 0.85
    expect(adjustConfidence(0.95, 30, 1, [], true)).toBe(0.85);
  });

  it('should not reduce below 0 when alternative gap triggers reduction', () => {
    const alternatives = [{ entryType: 'ALT', confidence: 0.05, reasoning: 'close' }];
    // raw=0.05, gap=0.0 < 0.15 → 0.05-0.1 → clamped to 0
    expect(adjustConfidence(0.05, 200, 5, alternatives, true)).toBe(0);
  });

  it('should round to 2 decimal places', () => {
    expect(adjustConfidence(0.777, 200, 5, [], true)).toBe(0.78);
  });
});

describe('classifyNode — graceful degradation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('degrades to a clarification-routing patch instead of throwing when the LLM fails', async () => {
    const deps = makeDeps();
    (deps.llmService.invokeStructured as jest.Mock).mockRejectedValue(new Error('boom'));

    const node = createClassifyNode(deps);
    const result = await node(makeState());

    // isRelevant=true + confidence=0 routes classifyRouter → ask_clarification
    expect(result.isRelevant).toBe(true);
    expect(result.entryType).toBeNull();
    expect(result.classificationConfidence).toBe(0);
    expect(result.alternatives).toEqual([]);
    expect(result.classificationReasoning).toMatch(/clarif/i);
  });

  it('reports the terminal failure to Sentry with conversation context', async () => {
    const deps = makeDeps();
    (deps.llmService.invokeStructured as jest.Mock).mockRejectedValue(new Error('boom'));

    await createClassifyNode(deps)(makeState({ conversationId: 'conv-xyz' }));

    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({ step: 'classify' }),
        extra: expect.objectContaining({ conversationId: 'conv-xyz' }),
      })
    );
  });
});

describe('classifyNode — specialty-constrained output schema', () => {
  beforeEach(() => jest.clearAllMocks());

  // Grab the schema the node hands to invokeStructured for a GP state.
  async function captureSchema() {
    const deps = makeDeps();
    (deps.llmService.invokeStructured as jest.Mock).mockResolvedValue({
      data: {
        reasoning: 'r',
        signalsFound: ['specific patient', 'diagnosis'],
        isRelevant: true,
        entryType: 'CLINICAL_CASE_REVIEW',
        confidence: 0.8,
        alternatives: [],
      },
    });
    await createClassifyNode(deps)(makeState());
    return (deps.llmService.invokeStructured as jest.Mock).mock.calls[0][1];
  }

  const base = {
    reasoning: 'r',
    signalsFound: ['a', 'b'],
    isRelevant: true,
    confidence: 0.8,
    alternatives: [],
  };

  it('accepts a valid GP entry type code', async () => {
    const schema = await captureSchema();
    expect(schema.safeParse({ ...base, entryType: 'CLINICAL_CASE_REVIEW' }).success).toBe(true);
  });

  it('accepts the "none" sentinel for the top-level entryType', async () => {
    const schema = await captureSchema();
    expect(schema.safeParse({ ...base, entryType: 'none' }).success).toBe(true);
  });

  it('rejects an entry type code not in the GP specialty', async () => {
    const schema = await captureSchema();
    expect(schema.safeParse({ ...base, entryType: 'BOGUS_CODE' }).success).toBe(false);
  });

  it('rejects an invalid code inside alternatives', async () => {
    const schema = await captureSchema();
    const parsed = schema.safeParse({
      ...base,
      entryType: 'CLINICAL_CASE_REVIEW',
      alternatives: [{ reasoning: 'x', entryType: 'BOGUS_CODE', confidence: 0.3 }],
    });
    expect(parsed.success).toBe(false);
  });
});
