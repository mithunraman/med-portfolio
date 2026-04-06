import { interrupt } from '@langchain/langgraph';
import { createAskClarificationNode } from '../ask-clarification.node';
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
    classificationConfidence: 0.5,
    classificationReasoning: 'Insufficient signals',

    alternatives: [],
    classificationConfirmed: false,
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

describe('AskClarificationNode (interrupt-only)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call interrupt with classification context including isRelevant', async () => {
    const node = createAskClarificationNode(makeDeps());
    const state = makeState();

    await node(state);

    expect(interrupt).toHaveBeenCalledWith({
      type: 'clarification',
      confidence: 0.5,
      reasoning: 'Insufficient signals',
      suggestedEntryType: 'CLINICAL_CASE_REVIEW',
      clarificationRound: 0,
      isRelevant: true,
    });
  });

  it('should pass isRelevant=false in interrupt when content is irrelevant', async () => {
    const node = createAskClarificationNode(makeDeps());
    const state = makeState({ isRelevant: false, entryType: null, classificationConfidence: 0 });

    await node(state);

    expect(interrupt).toHaveBeenCalledWith(
      expect.objectContaining({ isRelevant: false })
    );
  });

  it('should increment clarificationRound on resume', async () => {
    const node = createAskClarificationNode(makeDeps());
    const result = await node(makeState({ clarificationRound: 0 }));

    expect(result.clarificationRound).toBe(1);
  });

  it('should increment clarificationRound from round 1 to 2', async () => {
    const node = createAskClarificationNode(makeDeps());
    const result = await node(makeState({ clarificationRound: 1 }));

    expect(result.clarificationRound).toBe(2);
  });

  it('should not make any LLM calls', async () => {
    const deps = makeDeps();
    deps.llmService = { invokeStructured: jest.fn() } as any;

    const node = createAskClarificationNode(deps);
    await node(makeState());

    expect(deps.llmService.invokeStructured).not.toHaveBeenCalled();
  });

  it('should emit ANALYSIS_STEP_STARTED event', async () => {
    const deps = makeDeps();
    const node = createAskClarificationNode(deps);
    await node(makeState());

    expect(deps.eventEmitter.emit).toHaveBeenCalledWith(
      'analysis.step.started',
      { conversationId: 'conv-123', step: 'ask_clarification' }
    );
  });
});
