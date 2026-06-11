import { leafProbes } from '@acme/shared';
import { getSpecialtyConfig, getTemplateForEntryType } from '../../../specialties/specialty.registry';
import * as Sentry from '@sentry/nestjs';
import {
  createCheckCompletenessNode,
  deriveReadiness,
  deriveTiers,
} from '../check-completeness.node';
import type { GraphDeps } from '../../graph-deps';
import type { PortfolioStateType } from '../../portfolio-graph.state';

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

    expect(
      schema.safeParse({
        assignments: [{ idea: 'x', sectionId: validId }],
        sectionGrades: [{ sectionId: validId, tierReason: 'r', tier: 'adequate' }],
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
        sectionGrades: [{ sectionId: validId, tierReason: 'r', tier: 'amazing' }],
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
});
