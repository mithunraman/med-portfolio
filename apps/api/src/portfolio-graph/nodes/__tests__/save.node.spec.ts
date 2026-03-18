import { createSaveNode } from '../save.node';
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
    conversationId: 'conv-1',
    artefactId: 'art-1',
    userId: 'user-1',
    specialty: '0',
    fullTranscript: 'test transcript',
    messageCount: 1,
    entryType: 'CLINICAL_ENCOUNTER',
    classificationConfidence: 0.9,
    classificationReasoning: 'test',
    classificationSignals: [],
    alternatives: [],
    classificationSource: 'USER_CONFIRMED',
    sectionCoverage: {},
    missingSections: [],
    hasEnoughInfo: true,
    followUpRound: 0,
    capabilities: [{ code: 'CAP1', name: 'Cap 1', confidence: 0.9, reasoning: 'test' }],
    title: 'Test Entry',
    reflection: [{ title: 'Reflection', text: 'Some reflection' }],
    pdpGoals: [],
    error: null,
    ...overrides,
  } as PortfolioStateType;
}

// ── Tests ──

describe('SaveNode (validation-only)', () => {
  it('should return empty state when all required fields are present', async () => {
    const node = createSaveNode(makeDeps());
    const result = await node(makeState());

    expect(result).toEqual({});
  });

  it('should NOT perform any DB writes', async () => {
    const deps = makeDeps();
    const node = createSaveNode(deps);
    await node(makeState());

    // No repository or transaction methods should exist or be called
    expect(deps.artefactsRepository).toEqual({});
    expect(deps.pdpGoalsRepository).toEqual({});
    expect(deps.transactionService).toEqual({});
  });

  it('should throw when entryType is missing', async () => {
    const node = createSaveNode(makeDeps());

    await expect(node(makeState({ entryType: null }))).rejects.toThrow(
      'Cannot save: entryType is not set',
    );
  });

  it('should throw when title is missing', async () => {
    const node = createSaveNode(makeDeps());

    await expect(node(makeState({ title: null }))).rejects.toThrow(
      'Cannot save: title is not set',
    );
  });

  it('should throw when reflection is missing', async () => {
    const node = createSaveNode(makeDeps());

    await expect(node(makeState({ reflection: null }))).rejects.toThrow(
      'Cannot save: reflection is not set',
    );
  });

  it('should throw when capabilities is empty', async () => {
    const node = createSaveNode(makeDeps());

    await expect(node(makeState({ capabilities: [] }))).rejects.toThrow(
      'Cannot save: no capabilities',
    );
  });

  it('should emit ANALYSIS_STEP_STARTED event', async () => {
    const deps = makeDeps();
    const node = createSaveNode(deps);
    await node(makeState());

    expect(deps.eventEmitter.emit).toHaveBeenCalledWith(
      'analysis.step.started',
      { conversationId: 'conv-1', step: 'save' },
    );
  });
});
