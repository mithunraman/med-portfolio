import { leafProbes } from '@acme/shared';
import { getSpecialtyConfig, getTemplateForEntryType } from '../../../specialties/specialty.registry';
import { createCheckCompletenessNode } from '../check-completeness.node';
import type { GraphDeps } from '../../graph-deps';
import type { PortfolioStateType } from '../../portfolio-graph.state';

function makeDeps(): GraphDeps {
  return {
    artefactsRepository: {} as any,
    conversationsRepository: {} as any,
    pdpGoalsRepository: {} as any,
    transactionService: {} as any,
    llmService: { invokeStructured: jest.fn().mockResolvedValue({ data: { assignments: [] } }) } as any,
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
    sectionCoverage: {},
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

// The GP Clinical Case Review template's assessable section ids (the source the
// node itself uses to build the enum), used to assert valid vs invalid targets.
const assessableIds = leafProbes(getTemplateForEntryType(getSpecialtyConfig(100), 'CLINICAL_CASE_REVIEW'))
  .filter((p) => p.required && p.extractionQuestion !== null)
  .map((p) => p.id);

describe('checkCompletenessNode — template-constrained assignment schema', () => {
  beforeEach(() => jest.clearAllMocks());

  // Grab the schema the node hands to invokeStructured for a GP CCR state.
  async function captureSchema() {
    const deps = makeDeps();
    await createCheckCompletenessNode(deps)(makeState());
    const mock = deps.llmService.invokeStructured as jest.Mock;
    expect(mock).toHaveBeenCalled(); // proves the template has assessable sections
    return mock.mock.calls[0][1];
  }

  const okAssignment = {
    idea: 'patient presented with chest pain',
    sectionId: assessableIds[0],
    substantiveReason: 'dedicated statement about the presentation',
    isSubstantive: true,
  };

  it('emits substantiveReason immediately before isSubstantive (CoT ordering)', async () => {
    const schema = await captureSchema();
    const keys = Object.keys((schema as any).shape.assignments.element.shape);
    expect(keys).toEqual(['idea', 'sectionId', 'substantiveReason', 'isSubstantive']);
  });

  it('accepts an assignment to a valid assessable section', async () => {
    const schema = await captureSchema();
    expect(schema.safeParse({ assignments: [okAssignment] }).success).toBe(true);
  });

  it('rejects an assignment to a section id not in the template', async () => {
    const schema = await captureSchema();
    expect(schema.safeParse({ assignments: [{ ...okAssignment, sectionId: 'BOGUS' }] }).success).toBe(
      false
    );
  });

  it('requires substantiveReason on every assignment', async () => {
    const schema = await captureSchema();
    const { substantiveReason: _omit, ...withoutReason } = okAssignment;
    expect(schema.safeParse({ assignments: [withoutReason] }).success).toBe(false);
  });
});
