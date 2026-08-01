import { interrupt } from '@langchain/langgraph';
import { createRejectEntryNode } from '../reject-entry.node';
import { ANALYSIS_STEP_STARTED, type GraphDeps } from '../../graph-deps';
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
    modelConfig: {} as any,
    eventEmitter: { emit: jest.fn() } as any,
  };
}

function makeState(overrides: Partial<PortfolioStateType> = {}): PortfolioStateType {
  return {
    conversationId: 'conv-123',
    artefactId: 'art-123',
    userId: 'user-123',
    isRelevant: false,
    ...overrides,
  } as PortfolioStateType;
}

describe('RejectEntryNode (interrupt-only)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('interrupts with the terminal `rejected` payload', async () => {
    await createRejectEntryNode(makeDeps())(makeState());

    expect(interrupt).toHaveBeenCalledWith({ type: 'rejected' });
  });

  it('makes no LLM call — the interrupt replay on resume must stay cheap', async () => {
    const deps = makeDeps();
    await createRejectEntryNode(deps)(makeState());

    // llmService is an empty object; any call would throw. Assert the contract
    // explicitly so a future refactor that adds one fails here.
    expect(deps.llmService).toEqual({});
  });

  it('emits the step-started event', async () => {
    const deps = makeDeps();
    await createRejectEntryNode(deps)(makeState({ conversationId: 'conv-xyz' }));

    expect(deps.eventEmitter.emit).toHaveBeenCalledWith(ANALYSIS_STEP_STARTED, {
      conversationId: 'conv-xyz',
      step: 'reject_entry',
    });
  });

  it('returns no state update — the run ends at END', async () => {
    const result = await createRejectEntryNode(makeDeps())(makeState());

    expect(result).toEqual({});
  });
});
