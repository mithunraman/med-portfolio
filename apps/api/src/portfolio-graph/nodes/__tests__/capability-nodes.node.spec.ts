import { MessageRole } from '@acme/shared';
import type { GraphDeps } from '../../graph-deps';
import type { CapabilityTag, PortfolioStateType } from '../../portfolio-graph.state';
import { createElicitJustificationNode } from '../elicit-justification.node';
import { createTagCapabilitiesNode } from '../tag-capabilities.node';
import { buildTranscript } from '../transcript-format.util';

/**
 * These exercise the post-validation each node owns — the tier gate, the
 * verbatim-evidence gate, and the tag→elicit contradiction guard — by stubbing
 * the LLM response. Specialty '100' is GP, whose capabilities include C-06/C-08.
 *
 * Built via buildTranscript so the fixture carries the real TRAINEE: role prefix
 * that tag-capabilities' trainee-only quote gate keys off.
 */

const TRANSCRIPT = buildTranscript([
  {
    role: MessageRole.USER,
    content:
      'I saw a 55-year-old patient with poorly controlled type 2 diabetes. ' +
      'I started metformin and discussed lifestyle changes.',
  },
]);

function makeDeps(structuredResponse: unknown): GraphDeps {
  return {
    artefactsRepository: {} as any,
    conversationsRepository: {} as any,
    pdpGoalsRepository: {} as any,
    transactionService: {} as any,
    llmService: {
      invokeStructured: jest.fn().mockResolvedValue({ data: structuredResponse }),
    } as any,
    modelConfig: { resolve: jest.fn(() => ({ provider: 'openai', model: 'test-model' })) } as any,
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

  it('downgrades to shallow when the sourceQuote appears only in an AI-asked turn (trainee-only gate)', async () => {
    // The phrase "started ramipril" is present in the assistant's question but the
    // trainee never said it. The full transcript would verify it; the trainee-only
    // gate must not — mirroring tag_capabilities so the nodes don't drift.
    const transcriptWithAiTurn = buildTranscript([
      {
        role: MessageRole.USER,
        content: 'I reviewed his blood pressure and adjusted his medications.',
      },
      {
        role: MessageRole.ASSISTANT,
        question: {
          questionType: 'free_text',
          prompts: [{ text: 'You mentioned you started ramipril — why?' }],
        } as any,
      },
      { role: MessageRole.USER, content: 'It was the right call for his hypertension.' },
    ]);

    const deps = makeDeps({
      justifications: [
        {
          code: 'C-06',
          sourceQuote: 'started ramipril', // lifted from the AI-asked turn only
          justification: 'I started ramipril to manage his blood pressure.',
          justificationTier: 'strong',
        },
      ],
    });

    const result = await createElicitJustificationNode(deps)(
      makeState({ capabilities: [taggedC06], fullTranscript: transcriptWithAiTurn })
    );

    const c06 = result.capabilities!.find((c) => c.code === 'C-06')!;
    expect(c06.justificationTier).toBe('shallow');
    expect(c06.justification).toContain('ramipril'); // advisory prose retained
  });

  it('strips trailing grade meta-commentary from the justification (paste-ready)', async () => {
    // Flash appends "…so this is adequate rather than strong" to adequate/partial
    // justifications; that grade meta-commentary must never reach the portfolio.
    const deps = makeDeps({
      justifications: [
        {
          code: 'C-06',
          sourceQuote: 'I started metformin and discussed lifestyle changes',
          justification:
            'I started metformin and discussed lifestyle changes, but I did not explain the ' +
            'rationale or arrange follow-up, so this is adequate rather than strong.',
          justificationTier: 'adequate',
        },
      ],
    });

    const result = await createElicitJustificationNode(deps)(
      makeState({ capabilities: [taggedC06] })
    );

    const c06 = result.capabilities!.find((c) => c.code === 'C-06')!;
    expect(c06.justification).toBe('I started metformin and discussed lifestyle changes.');
    expect(c06.justification).not.toMatch(/so this is|but I did not/i);
  });

  it('does not over-strip a clean justification that merely contains "but"', async () => {
    const deps = makeDeps({
      justifications: [
        {
          code: 'C-06',
          sourceQuote: 'I started metformin and discussed lifestyle changes',
          justification:
            'I started metformin, but more importantly I interpreted her rising HbA1c to reach ' +
            'the diagnosis, which is interpreting clinical data to inform care.',
          justificationTier: 'strong',
        },
      ],
    });

    const result = await createElicitJustificationNode(deps)(
      makeState({ capabilities: [taggedC06] })
    );

    const c06 = result.capabilities!.find((c) => c.code === 'C-06')!;
    // No "so this is <tier>" anchor → left untouched.
    expect(c06.justification).toContain('but more importantly');
  });

  it('instructs the model to take the sourceQuote only from TRAINEE: turns', async () => {
    const deps = makeDeps({ justifications: [] });
    await createElicitJustificationNode(deps)(makeState({ capabilities: [taggedC06] }));

    const prompt = (deps.llmService.invokeStructured as jest.Mock).mock.calls[0][0]
      .map((m: { content: unknown }) => String(m.content))
      .join('\n');
    // Defence-in-depth behind the trainee-only gate: steer the model to quote a
    // TRAINEE: turn so it doesn't pick an AI-turn span that would be downgraded.
    expect(prompt).toContain('TRAINEE:');
    expect(prompt).toContain('AI asked:');
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

  it('rewrites a third-person justification to first person (portfolio paste-ready voice)', async () => {
    const deps = makeDeps({
      justifications: [
        {
          code: 'C-06',
          sourceQuote: 'I started metformin and discussed lifestyle changes',
          justification: 'The trainee started metformin and discussed lifestyle changes.',
          justificationTier: 'strong',
        },
      ],
    });

    const result = await createElicitJustificationNode(deps)(
      makeState({ capabilities: [taggedC06] })
    );

    const c06 = result.capabilities!.find((c) => c.code === 'C-06')!;
    expect(c06.justification).toBe('I started metformin and discussed lifestyle changes.');
    expect(c06.justification).not.toMatch(/the trainee/i);
  });
});
