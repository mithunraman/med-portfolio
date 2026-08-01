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
      invokeStructured: jest.fn().mockResolvedValue({
        data: {
          relevanceReason: 'clinical encounter',
          isRelevant: true,
          assignments: [],
          sectionGrades: [],
        },
      }),
    } as any,
    modelConfig: { resolve: jest.fn(() => ({ provider: 'openai', pool: 'openai', model: 'test-model' })) } as any,
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
      [{ sectionId: 'reflection', tierReason: 'learning + change', tier: 'strong' }],
      ccrIds
    );
    expect(tiers['reflection']).toBe('strong');
  });

  it('floors a section with NO assigned content to missing, even if graded', () => {
    const tiers = deriveTiers(
      [],
      [{ sectionId: 'presentation', tierReason: 'x', tier: 'strong' }],
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
      [{ sectionId: 'reflection', tierReason: 'learning point AND change to practice', tier: 'strong' }],
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
    const relevance = { relevanceReason: 'clinical encounter', isRelevant: true };

    expect(
      schema.safeParse({
        ...relevance,
        assignments: [{ idea: 'x', sectionId: validId }],
        sectionGrades: [{ sectionId: validId, tierReason: 'r', tier: 'adequate' }],
      }).success
    ).toBe(true);

    // bogus section id
    expect(
      schema.safeParse({
        ...relevance,
        assignments: [{ idea: 'x', sectionId: 'BOGUS' }],
        sectionGrades: [],
      }).success
    ).toBe(false);

    // bogus tier
    expect(
      schema.safeParse({
        ...relevance,
        assignments: [{ idea: 'x', sectionId: validId }],
        sectionGrades: [{ sectionId: validId, tierReason: 'r', tier: 'amazing' }],
      }).success
    ).toBe(false);
  });

  /** Response shape for a grader that assigns nothing. */
  function emptyPartition(isRelevant: boolean) {
    return {
      data: {
        relevanceReason: isRelevant ? 'clinical content present' : 'a shopping list',
        isRelevant,
        assignments: [],
        sectionGrades: [],
      },
    };
  }

  /** A mid-journey state: five probes cleared, one gap, readiness accumulated. */
  function midJourneyState(followUpRound: number) {
    return makeState({
      followUpRound,
      missingSections: ['learning_needs'],
      hasEnoughInfo: false,
      readinessScore: 8.2,
      bestTierByProbe: { reflection: 'strong', clinical_reasoning: 'strong' },
      probeReadiness: { reflection: { score: 1, tier: 'strong', meetsThreshold: true } },
    });
  }

  it('rejects at round 0 when the transcript is not relevant', async () => {
    const deps = makeDeps();
    (deps.llmService.invokeStructured as jest.Mock).mockResolvedValue(emptyPartition(false));

    const result = await createCheckCompletenessNode(deps)(makeState({ followUpRound: 0 }));

    // Only the verdict — completenessRouter turns this into reject_entry.
    expect(result).toEqual({ isRelevant: false });
  });

  it('keeps prior readiness when the partition is empty after round 0', async () => {
    const deps = makeDeps();
    (deps.llmService.invokeStructured as jest.Mock).mockResolvedValue(emptyPartition(false));

    const result = await createCheckCompletenessNode(deps)(midJourneyState(3));

    // No update at all: grading an empty partition would floor every probe to
    // `missing`, and the ratchet honours `missing`, so `bestTierByProbe` — the
    // record of what the trainee already cleared — would be wiped with it.
    expect(result).toEqual({});
    expect(result.bestTierByProbe).toBeUndefined();
    expect(result.readinessScore).toBeUndefined();
    expect(result.missingSections).toBeUndefined();
  });

  it('guards an empty partition after round 0 even when graded relevant', async () => {
    const deps = makeDeps();
    (deps.llmService.invokeStructured as jest.Mock).mockResolvedValue(emptyPartition(true));

    const result = await createCheckCompletenessNode(deps)(midJourneyState(2));

    // The hazard is the empty partition, not the verdict — so the guard must not
    // depend on `isRelevant`.
    expect(result).toEqual({});
  });

  it('still floors every probe to missing on an empty partition at round 0', async () => {
    const deps = makeDeps();
    (deps.llmService.invokeStructured as jest.Mock).mockResolvedValue(emptyPartition(true));

    const result = await createCheckCompletenessNode(deps)(makeState({ followUpRound: 0 }));

    // Round 0 has no prior readiness to protect, and the `missing` floor is what
    // puts every section into the elicitation loop — the guard must NOT apply here.
    expect(result.missingSections).toEqual(ccrAssessable.map((p) => p.id));
    expect(result.readinessScore).toBe(0);
    expect(result.hasEnoughInfo).toBe(false);
  });

  it('uses the grades when a late irrelevant verdict still carries a partition', async () => {
    const deps = makeDeps();
    (deps.llmService.invokeStructured as jest.Mock).mockResolvedValue({
      data: {
        relevanceReason: 'model says irrelevant but partitioned anyway',
        isRelevant: false,
        assignments: [{ idea: 'I read NICE NG28', sectionId: 'learning_needs' }],
        sectionGrades: [
          { sectionId: 'learning_needs', tierReason: 'specific gap + intent', tier: 'adequate' },
        ],
      },
    });

    const result = await createCheckCompletenessNode(deps)(midJourneyState(3));

    // A usable partition is worth more than the verdict that came with it — don't
    // discard a call we already paid for.
    expect(result.probeReadiness?.['learning_needs'].tier).toBe('adequate');
    expect(result.missingSections).not.toContain('learning_needs');
  });

  it('fails OPEN on relevance when the LLM call fails', async () => {
    const deps = makeDeps();
    (deps.llmService.invokeStructured as jest.Mock).mockRejectedValue(new Error('boom'));

    const result = await createCheckCompletenessNode(deps)(makeState());

    // Asserted as "never writes false" rather than "writes true": the channel
    // defaults to true, so not writing IS the fail-open behaviour, and this is
    // what would catch a `false` creeping into the failure path.
    expect(result.isRelevant).not.toBe(false);
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

  it('derives the follow-up round cap from the template (askable probes × ATTEMPT_LIMIT)', async () => {
    const result = await createCheckCompletenessNode(makeDeps())(makeState());
    // CCR has 6 assessable probes → cap scales with the template, not a fixed 8.
    expect(result.maxFollowupRounds).toBe(ccrAssessable.length * ATTEMPT_LIMIT);
  });
});
