import { interrupt } from '@langchain/langgraph';
import { createPresentCapabilitiesNode } from '../present-capabilities.node';
import type { GraphDeps } from '../../graph-deps';
import type { PortfolioStateType } from '../../portfolio-graph.state';

jest.mock('@langchain/langgraph', () => ({
  interrupt: jest.fn(),
}));

function makeDeps(): GraphDeps {
  return {
    artefactsRepository: {} as any,
    conversationsRepository: {} as any,
    pdpGoalsRepository: {} as any,
    transactionService: {} as any,
    llmService: {} as any,
    eventEmitter: { emit: jest.fn() } as any,
  };
}

function makeState(overrides: Partial<PortfolioStateType> = {}): PortfolioStateType {
  return {
    conversationId: 'conv-123',
    artefactId: 'art-123',
    userId: 'user-123',
    specialty: '100',
    trainingStage: 'ST1',
    fullTranscript: 'Some transcript',

    isRelevant: true,
    entryType: 'CLINICAL_CASE_REVIEW',
    classificationConfidence: 0.9,
    classificationReasoning: 'Strong signals',

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

describe('PresentCapabilitiesNode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should skip entirely when there is no entry type', async () => {
    const node = createPresentCapabilitiesNode(makeDeps());
    const result = await node(makeState({ entryType: null }));

    expect(result).toEqual({});
    expect(interrupt).not.toHaveBeenCalled();
  });

  it('should interrupt with empty options when capabilities are empty', async () => {
    const node = createPresentCapabilitiesNode(makeDeps());
    const result = await node(makeState({ capabilities: [] }));

    expect(interrupt).toHaveBeenCalledWith({
      type: 'capabilities',
      options: [],
      entryType: 'CLINICAL_CASE_REVIEW',
    });
    expect(result).toEqual({ entryType: null });
  });

  it('should interrupt with populated options when capabilities exist', async () => {
    const capabilities = [
      { code: 'CAP1', name: 'Data Gathering', tier: 'strong' as const, reasoning: 'Took a history', quote: 'I took a history' },
      { code: 'CAP2', name: 'Clinical Reasoning', tier: 'adequate' as const, reasoning: 'Discussed DDx', quote: 'I weighed the differentials' },
    ];

    const node = createPresentCapabilitiesNode(makeDeps());
    await node(makeState({ capabilities }));

    expect(interrupt).toHaveBeenCalledWith({
      type: 'capabilities',
      options: [
        // tier is projected onto `confidence` for the percentage UI (strong → 0.9, adequate → 0.7)
        { code: 'CAP1', name: 'Data Gathering', confidence: 0.9, reasoning: 'Took a history' },
        { code: 'CAP2', name: 'Clinical Reasoning', confidence: 0.7, reasoning: 'Discussed DDx' },
      ],
      entryType: 'CLINICAL_CASE_REVIEW',
    });
  });

  it('should filter capabilities to user-selected codes on resume', async () => {
    const capabilities = [
      { code: 'CAP1', name: 'Data Gathering', tier: 'strong' as const, reasoning: 'Took a history', quote: 'I took a history' },
      { code: 'CAP2', name: 'Clinical Reasoning', tier: 'adequate' as const, reasoning: 'Discussed DDx', quote: 'I weighed the differentials' },
    ];

    (interrupt as jest.Mock).mockReturnValue({ selectedCodes: ['CAP1'] });

    const node = createPresentCapabilitiesNode(makeDeps());
    const result = await node(makeState({ capabilities }));

    expect(result.capabilities).toEqual([capabilities[0]]);
  });

  it('should retain all five selected capabilities (no truncation to 3)', async () => {
    const capabilities = [
      { code: 'CAP1', name: 'Fitness to Practise', tier: 'strong' as const, reasoning: 'r1', quote: 'q1' },
      { code: 'CAP2', name: 'Ethical Approach', tier: 'strong' as const, reasoning: 'r2', quote: 'q2' },
      { code: 'CAP3', name: 'Communication', tier: 'adequate' as const, reasoning: 'r3', quote: 'q3' },
      { code: 'CAP4', name: 'Data Gathering', tier: 'adequate' as const, reasoning: 'r4', quote: 'q4' },
      { code: 'CAP5', name: 'Clinical Examination', tier: 'adequate' as const, reasoning: 'r5', quote: 'q5' },
    ];

    (interrupt as jest.Mock).mockReturnValue({
      selectedCodes: ['CAP1', 'CAP2', 'CAP3', 'CAP4', 'CAP5'],
    });

    const node = createPresentCapabilitiesNode(makeDeps());
    const result = await node(makeState({ capabilities }));

    expect(result.capabilities).toEqual(capabilities);
  });

  it('should keep all capabilities when no valid selections on resume', async () => {
    const capabilities = [
      { code: 'CAP1', name: 'Data Gathering', tier: 'strong' as const, reasoning: 'Took a history', quote: 'I took a history' },
    ];

    (interrupt as jest.Mock).mockReturnValue({ selectedCodes: ['INVALID'] });

    const node = createPresentCapabilitiesNode(makeDeps());
    const result = await node(makeState({ capabilities }));

    expect(result).toEqual({});
  });

  it('should emit ANALYSIS_STEP_STARTED event', async () => {
    const deps = makeDeps();
    const node = createPresentCapabilitiesNode(deps);
    await node(makeState({ entryType: null }));

    expect(deps.eventEmitter.emit).toHaveBeenCalledWith(
      'analysis.step.started',
      { conversationId: 'conv-123', step: 'present_capabilities' },
    );
  });
});
