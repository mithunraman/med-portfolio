import type { GraphDeps } from '../../graph-deps';
import type { CapabilityTag, PortfolioStateType } from '../../portfolio-graph.state';
import { createElicitJustificationNode } from '../elicit-justification.node';
import { createTagCapabilitiesNode } from '../tag-capabilities.node';

/**
 * These exercise the post-validation each node owns — the tier gate, the
 * verbatim-evidence gate, and the tag→elicit contradiction guard — by stubbing
 * the LLM response. Specialty '100' is GP, whose capabilities include C-06/C-08.
 */

const TRANSCRIPT =
  'I saw a 55-year-old patient with poorly controlled type 2 diabetes. ' +
  'I started metformin and discussed lifestyle changes.';

function makeDeps(structuredResponse: unknown): GraphDeps {
  return {
    artefactsRepository: {} as any,
    conversationsRepository: {} as any,
    pdpGoalsRepository: {} as any,
    transactionService: {} as any,
    llmService: {
      invokeStructured: jest.fn().mockResolvedValue({ data: structuredResponse }),
    } as any,
    eventEmitter: { emit: jest.fn() } as any,
  };
}

function makeState(overrides: Partial<PortfolioStateType> = {}): PortfolioStateType {
  return {
    conversationId: 'conv-1',
    artefactId: 'art-1',
    userId: 'user-1',
    specialty: '100',
    trainingStage: 'ST1',
    fullTranscript: TRANSCRIPT,
    isRelevant: true,
    entryType: 'CLINICAL_CASE_REVIEW',
    classificationConfidence: 0.9,
    classificationReasoning: '',
    alternatives: [],
    classificationConfirmed: true,
    clarificationRound: 0,
    missingSections: [],
    hasEnoughInfo: true,
    followUpRound: 0,
    pendingFollowupQuestions: [],
    capabilities: [],
    title: null,
    reflection: null,
    pdpGoals: [],
    ...overrides,
  } as PortfolioStateType;
}

describe('tagCapabilitiesNode post-validation', () => {
  it('keeps adequate+ capabilities with a verbatim quote and drops the rest', async () => {
    const deps = makeDeps({
      assessments: [
        // kept — strong, quote present in transcript
        {
          code: 'C-06',
          quote: 'I started metformin and discussed lifestyle changes',
          reasoning: 'I started metformin.',
          tier: 'strong',
        },
        // dropped — below the adequate threshold
        { code: 'C-08', quote: 'I started metformin', reasoning: 'mention', tier: 'shallow' },
        // dropped — quote not in transcript (fabricated evidence)
        {
          code: 'C-02',
          quote: 'I escalated to the on-call consultant immediately',
          reasoning: 'fabricated',
          tier: 'strong',
        },
        // dropped — empty reasoning
        { code: 'C-10', quote: 'I started metformin', reasoning: '', tier: 'adequate' },
      ],
    });

    const result = await createTagCapabilitiesNode(deps)(makeState());

    expect(result.capabilities).toHaveLength(1);
    expect(result.capabilities![0]).toMatchObject({ code: 'C-06', tier: 'strong' });
  });

  it('ranks kept capabilities strongest-tier-first', async () => {
    const deps = makeDeps({
      assessments: [
        { code: 'C-08', quote: 'I started metformin', reasoning: 'r', tier: 'adequate' },
        {
          code: 'C-06',
          quote: 'poorly controlled type 2 diabetes',
          reasoning: 'r',
          tier: 'strong',
        },
      ],
    });

    const result = await createTagCapabilitiesNode(deps)(makeState());

    expect(result.capabilities!.map((c) => c.code)).toEqual(['C-06', 'C-08']);
  });
});

describe('elicitJustificationNode gate + contradiction guard', () => {
  const taggedC06: CapabilityTag = {
    code: 'C-06',
    name: 'Managing medical complexity',
    reasoning: 'Started metformin.',
    quote: 'I started metformin and discussed lifestyle changes',
    tier: 'strong',
  };

  it('a strongly-tagged capability with verifiable evidence cannot come back unjustified', async () => {
    const deps = makeDeps({
      justifications: [
        {
          code: 'C-06',
          sourceQuote: 'I started metformin and discussed lifestyle changes',
          justification: 'I started metformin and discussed lifestyle changes with the patient.',
          justificationTier: 'strong',
        },
      ],
    });

    const result = await createElicitJustificationNode(deps)(
      makeState({ capabilities: [taggedC06] })
    );

    const c06 = result.capabilities!.find((c) => c.code === 'C-06')!;
    expect(c06.justificationTier).toBe('strong');
    expect(c06.justification).toContain('metformin');
  });

  it('downgrades an adequate+ grade to shallow when the sourceQuote is unverifiable, keeping the prose', async () => {
    const deps = makeDeps({
      justifications: [
        {
          code: 'C-06',
          // not a substring of the transcript — fabricated anchor
          sourceQuote: 'I referred her to the diabetic specialist nurse',
          justification: 'I referred her onward for specialist input.',
          justificationTier: 'strong',
        },
      ],
    });

    const result = await createElicitJustificationNode(deps)(
      makeState({ capabilities: [taggedC06] })
    );

    const c06 = result.capabilities!.find((c) => c.code === 'C-06')!;
    expect(c06.justificationTier).toBe('shallow');
    // prose is retained (advisory) even though the tier was downgraded
    expect(c06.justification).toContain('specialist');
  });

  it('grades missing when no justification text is returned', async () => {
    const deps = makeDeps({
      justifications: [
        { code: 'C-06', sourceQuote: '', justification: '', justificationTier: 'strong' },
      ],
    });

    const result = await createElicitJustificationNode(deps)(
      makeState({ capabilities: [taggedC06] })
    );

    expect(result.capabilities![0].justificationTier).toBe('missing');
  });
});
