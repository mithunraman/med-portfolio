import { createAskFollowupNode } from '../ask-followup.node';
import { MAX_FOLLOWUP_ROUNDS } from '../../portfolio-graph.builder';
import type { GraphDeps } from '../../graph-deps';
import type { PortfolioStateType } from '../../portfolio-graph.state';

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
    specialty: '0',
    fullTranscript: 'Some clinical transcript',
    messageCount: 1,
    entryType: 'CLINICAL_ENCOUNTER',
    classificationConfidence: 0.9,
    classificationReasoning: '',
    classificationSignals: [],
    alternatives: [],
    classificationSource: 'USER_CONFIRMED',
    sectionCoverage: {},
    missingSections: ['clinical_situation'],
    hasEnoughInfo: false,
    followUpRound: 0,
    capabilities: [],
    title: null,
    reflection: null,
    pdpGoals: [],
    error: null,
    ...overrides,
  } as PortfolioStateType;
}

// ── Tests ──

describe('AskFollowupNode', () => {
  describe('follow-up round circuit breaker', () => {
    it('should throw when followUpRound equals MAX_FOLLOWUP_ROUNDS', async () => {
      const node = createAskFollowupNode(makeDeps());
      const state = makeState({ followUpRound: MAX_FOLLOWUP_ROUNDS });

      await expect(node(state)).rejects.toThrow(
        `Follow-up round ${MAX_FOLLOWUP_ROUNDS} exceeds maximum ${MAX_FOLLOWUP_ROUNDS}`
      );
    });

    it('should throw when followUpRound exceeds MAX_FOLLOWUP_ROUNDS', async () => {
      const node = createAskFollowupNode(makeDeps());
      const state = makeState({ followUpRound: MAX_FOLLOWUP_ROUNDS + 1 });

      await expect(node(state)).rejects.toThrow('exceeds maximum');
    });

    it('should NOT throw when followUpRound is below MAX_FOLLOWUP_ROUNDS', async () => {
      const deps = makeDeps();
      // The node will proceed past the assertion but may fail on missing
      // specialty config — that's fine, we only care that it doesn't throw
      // the circuit breaker error.
      const node = createAskFollowupNode(deps);
      const state = makeState({ followUpRound: MAX_FOLLOWUP_ROUNDS - 1 });

      try {
        await node(state);
      } catch (error) {
        // Should NOT be the circuit breaker error
        expect((error as Error).message).not.toContain('exceeds maximum');
      }
    });
  });
});
