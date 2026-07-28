import { leafProbes } from '@acme/shared';
import { getSpecialtyConfig, getTemplateForEntryType } from '../../../specialties/specialty.registry';
import * as Sentry from '@sentry/nestjs';
import {
  createCheckCompletenessNode,
  deriveReadiness,
  deriveTiers,
  ratchetTiers,
} from '../check-completeness.node';
import type { GraphDeps } from '../../graph-deps';
import type { PortfolioStateType } from '../../portfolio-graph.state';
import { ATTEMPT_LIMIT } from '../../elicitation.util';

jest.mock('@sentry/nestjs', () => ({ captureException: jest.fn() }));

function makeDeps(): GraphDeps {
  return {
    artefactsRepository: {} as any,
    conversationsRepository: {} as any,
    pdpGoalsRepository: {} as any,
    transactionService: {} as any,
    llmService: {
      invokeStructured: jest.fn().mockResolvedValue({ data: { assignments: [], sectionGrades: [] } }),
    } as any,
    modelConfig: { resolve: jest.fn(() => ({ provider: 'openai', model: 'test-model' })) } as any,
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
    entryType: 'CLINICAL_CASE_REVIEW',

    isRelevant: true,
    classificationConfidence: 0.9,
    classificationReasoning: '',
    alternatives: [],
    classificationConfirmed: true,
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

const ccrTemplate = getTemplateForEntryType(getSpecialtyConfig(100), 'CLINICAL_CASE_REVIEW');
const ccrAssessable = leafProbes(ccrTemplate).filter(
  (p) => p.required && p.extractionQuestion !== null
);
const ccrIds = new Set(ccrAssessable.map((p) => p.id));

describe('deriveTiers — LLM grade + structural floors', () => {
  it('passes the rubric grade straight through as the readiness tier', () => {
    const tiers = deriveTiers(
      [{ idea: 'reflected and changed practice', sectionId: 'reflection' }],
      [{ sectionId: 'reflection', statedIntentQuote: '', intentType: 'none', tierReason: 'learning + change', tier: 'strong' }],
      ccrIds
    );
    expect(tiers['reflection']).toBe('strong');
  });

  it('floors a section with NO assigned content to missing, even if graded', () => {
    const tiers = deriveTiers(
      [],
      [{ sectionId: 'presentation', statedIntentQuote: '', intentType: 'none', tierReason: 'x', tier: 'strong' }],
      new Set(['presentation'])
    );
    expect(tiers['presentation']).toBe('missing');
  });

  it('treats content with no grade conservatively as shallow', () => {
    const tiers = deriveTiers(
      [{ idea: 'a presentation detail', sectionId: 'presentation' }],
      [],
      new Set(['presentation'])
    );
    expect(tiers['presentation']).toBe('shallow');
  });
});

describe('deriveTiers — learning-activity gate (learning needs)', () => {
  const assignments = [{ idea: 'the real gap was the prescribing decision', sectionId: 'learning_needs' }];
  const only = new Set(['learning_needs']);
  const gate = (grade: {
    statedIntentQuote: string;
    intentType: 'learning_activity' | 'behavioural_change' | 'none';
    tier: 'strong' | 'adequate' | 'shallow';
  }) =>
    deriveTiers(assignments, [{ sectionId: 'learning_needs', tierReason: 'r', ...grade }], only, only)[
      'learning_needs'
    ];

  it('holds at shallow when the intent is IMPLIED (no quote, intentType none)', () => {
    // B0T failure: an evaluation rounded up to adequate on an implied intent.
    expect(gate({ statedIntentQuote: '', intentType: 'none', tier: 'adequate' })).toBe('shallow');
  });

  it('holds at shallow when the intent is a BEHAVIOURAL change, not a learning activity', () => {
    // Case 7 (GUB1UPGbOH7ARColQZLij): a strong reflection's forward action
    // ("I'll always ask about access to means") bled into learning_needs. It carries
    // a real quote but is a reflection action, not a DEN — must stay a live gap.
    expect(
      gate({
        statedIntentQuote: "I'll always ask about access to means from now on",
        intentType: 'behavioural_change',
        tier: 'adequate',
      })
    ).toBe('shallow');
  });

  it('lets the grade stand for a genuine LEARNING activity (DEN)', () => {
    expect(
      gate({
        statedIntentQuote: 'I will read the NICE self-harm guidance and do the RCGP risk e-learning module',
        intentType: 'learning_activity',
        tier: 'adequate',
      })
    ).toBe('adequate');
  });

  it('does NOT over-reject a hybrid classified as learning_activity (both present)', () => {
    // "I'll ask about access to means AND read the NICE guidance" → the model quotes
    // the learning part and classifies learning_activity; must not be downgraded.
    expect(
      gate({
        statedIntentQuote: 'I will read the NICE guidance',
        intentType: 'learning_activity',
        tier: 'strong',
      })
    ).toBe('strong');
  });

  it('does NOT gate sections that do not require a learning intent', () => {
    const tiers = deriveTiers(
      [{ idea: 'a reflective point', sectionId: 'reflection' }],
      [
        {
          sectionId: 'reflection',
          statedIntentQuote: '',
          intentType: 'behavioural_change',
          tierReason: 'genuine reflection',
          tier: 'adequate',
        },
      ],
      new Set(['reflection']),
      only
    );
    expect(tiers['reflection']).toBe('adequate');
  });

  it('does not touch a grade already at shallow', () => {
    expect(gate({ statedIntentQuote: '', intentType: 'none', tier: 'shallow' })).toBe('shallow');
  });
});

describe('ratchetTiers — monotonic best-tier floor', () => {
  it('keeps the higher of the prior best and this round (no regression)', () => {
    expect(ratchetTiers({ reflection: 'strong' }, { reflection: 'adequate' })).toEqual({
      reflection: 'strong',
    });
  });

  it('accepts a genuine improvement', () => {
    expect(ratchetTiers({ outcome: 'shallow' }, { outcome: 'adequate' })).toEqual({
      outcome: 'adequate',
    });
  });

  it('uses this round when there is no prior best', () => {
    expect(ratchetTiers({}, { outcome: 'adequate' })).toEqual({ outcome: 'adequate' });
  });

  it('re-opens a section when this round assigns it no content (partition corrected)', () => {
    // Round 1 over-graded `management` on content that later re-partitions to reflection;
    // round 2 leaves management empty (structural `missing` floor). The ratchet must NOT
    // freeze the orphaned `adequate` — an empty required section can't ship as complete.
    expect(ratchetTiers({ management: 'adequate' }, { management: 'missing' })).toEqual({
      management: 'missing',
    });
  });

  it('still smooths downward grade noise while content is present', () => {
    // shallow/adequate/strong all mean content IS assigned — a flicker down is noise.
    expect(ratchetTiers({ reflection: 'strong' }, { reflection: 'shallow' })).toEqual({
      reflection: 'strong',
    });
  });
});

describe('readiness regression — one deep reflection meets the strong threshold', () => {
  it('a single strong-graded reflection is NOT a gap (the count-based false-negative is fixed)', () => {
    // Under the old count-based rule this needed TWO substantive ideas to reach
    // 'rich'/'strong'; one excellent reflection scored 'adequate' and was flagged.
    const tiers = deriveTiers(
      [{ idea: 'I learned X and will now always do Y', sectionId: 'reflection' }],
      [{ sectionId: 'reflection', statedIntentQuote: '', intentType: 'none', tierReason: 'learning point AND change to practice', tier: 'strong' }],
      ccrIds
    );
    const r = deriveReadiness(tiers, ccrAssessable, ccrTemplate);

    expect(r.probeReadiness['reflection'].tier).toBe('strong');
    expect(r.probeReadiness['reflection'].meetsThreshold).toBe(true);
    expect(r.missingProbeIds).not.toContain('reflection');
  });
});

describe('checkCompletenessNode — schema & resilience', () => {
  beforeEach(() => jest.clearAllMocks());

  async function captureSchema() {
    const deps = makeDeps();
    await createCheckCompletenessNode(deps)(makeState());
    const mock = deps.llmService.invokeStructured as jest.Mock;
    expect(mock).toHaveBeenCalled();
    return mock.mock.calls[0][1];
  }

  it('constrains sectionId to assessable sections and tier to the grade enum', async () => {
    const schema = await captureSchema();
    const validId = [...ccrIds][0];

    expect(
      schema.safeParse({
        assignments: [{ idea: 'x', sectionId: validId }],
        sectionGrades: [{ sectionId: validId, statedIntentQuote: '', intentType: 'none', tierReason: 'r', tier: 'adequate' }],
      }).success
    ).toBe(true);

    // bogus section id
    expect(
      schema.safeParse({
        assignments: [{ idea: 'x', sectionId: 'BOGUS' }],
        sectionGrades: [],
      }).success
    ).toBe(false);

    // bogus tier
    expect(
      schema.safeParse({
        assignments: [{ idea: 'x', sectionId: validId }],
        sectionGrades: [{ sectionId: validId, statedIntentQuote: '', intentType: 'none', tierReason: 'r', tier: 'amazing' }],
      }).success
    ).toBe(false);
  });

  it('degrades safely when the LLM fails: proceeds without follow-ups, reports to Sentry', async () => {
    const deps = makeDeps();
    (deps.llmService.invokeStructured as jest.Mock).mockRejectedValue(new Error('boom'));

    const result = await createCheckCompletenessNode(deps)(makeState({ conversationId: 'conv-xyz' }));

    expect(result.hasEnoughInfo).toBe(true);
    expect(result.missingSections).toEqual([]);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({ step: 'check_completeness' }),
        extra: expect.objectContaining({ conversationId: 'conv-xyz' }),
      })
    );
  });

  it('short-circuits with hasEnoughInfo when there is no entry type', async () => {
    const deps = makeDeps();
    const result = await createCheckCompletenessNode(deps)(makeState({ entryType: null }));
    expect(result.hasEnoughInfo).toBe(true);
    expect(deps.llmService.invokeStructured).not.toHaveBeenCalled();
  });

  it('derives the follow-up round cap from the template (askable probes × ATTEMPT_LIMIT)', async () => {
    const result = await createCheckCompletenessNode(makeDeps())(makeState());
    // CCR has 6 assessable probes → cap scales with the template, not a fixed 8.
    expect(result.maxFollowupRounds).toBe(ccrAssessable.length * ATTEMPT_LIMIT);
  });
});
