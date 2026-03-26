import { interrupt } from '@langchain/langgraph';
import { createAskFollowupNode } from '../ask-followup.node';
import type { GraphDeps } from '../../graph-deps';
import type { PortfolioStateType } from '../../portfolio-graph.state';

// Mock LangGraph's interrupt
jest.mock('@langchain/langgraph', () => ({
  interrupt: jest.fn(),
}));

// ── Helpers ──

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
    messageCount: 1,
    entryType: 'CLINICAL_CASE_REVIEW',
    classificationConfidence: 0.9,
    classificationReasoning: '',
    classificationSignals: [],
    alternatives: [],
    classificationSource: 'USER_CONFIRMED',
    sectionCoverage: {},
    missingSections: ['reflection', 'outcome'],
    hasEnoughInfo: false,
    followUpRound: 1,
    pendingFollowupQuestions: [
      {
        sectionId: 'reflection',
        question: 'What did you learn?',
        hints: { examples: ['Example'] },
      },
      {
        sectionId: 'outcome',
        question: 'What happened to the patient?',
        hints: { examples: ['The patient recovered...'] },
      },
    ],
    capabilities: [],
    title: null,
    reflection: null,
    capabilityAnnotations: [],
    pdpGoals: [],
    error: null,
    ...overrides,
  } as PortfolioStateType;
}

// ── Tests ──

describe('AskFollowupNode (interrupt-only)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call interrupt with questions from state', async () => {
    const node = createAskFollowupNode(makeDeps());
    const state = makeState();

    await node(state);

    expect(interrupt).toHaveBeenCalledWith({
      type: 'followup',
      questions: state.pendingFollowupQuestions,
      missingSections: ['reflection', 'outcome'],
      entryType: 'CLINICAL_CASE_REVIEW',
      followUpRound: 1,
    });
  });

  it('should not make any LLM calls', async () => {
    const deps = makeDeps();
    deps.llmService = { invokeStructured: jest.fn() } as any;

    const node = createAskFollowupNode(deps);
    await node(makeState());

    expect(deps.llmService.invokeStructured).not.toHaveBeenCalled();
  });

  it('should return empty state (no state mutations)', async () => {
    const node = createAskFollowupNode(makeDeps());
    const result = await node(makeState());

    expect(result).toEqual({});
  });

  it('should emit ANALYSIS_STEP_STARTED event', async () => {
    const deps = makeDeps();
    const node = createAskFollowupNode(deps);
    await node(makeState());

    expect(deps.eventEmitter.emit).toHaveBeenCalledWith(
      'analysis.step.started',
      { conversationId: 'conv-123', step: 'ask_followup' }
    );
  });
});
