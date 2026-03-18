import { ArtefactStatus } from '@acme/shared';
import { Types } from 'mongoose';
import { createSaveNode } from '../save.node';
import type { GraphDeps } from '../../graph-deps';
import type { PortfolioStateType } from '../../portfolio-graph.state';

// ── Helpers ──

const oid = () => new Types.ObjectId();

function makeDeps(overrides: Partial<GraphDeps> = {}): GraphDeps {
  return {
    artefactsRepository: { updateArtefactById: jest.fn() } as any,
    conversationsRepository: {} as any,
    pdpGoalsRepository: { create: jest.fn() } as any,
    transactionService: {
      withTransaction: jest.fn((fn) => fn({})), // pass a fake session
    } as any,
    llmService: {} as any,
    eventEmitter: { emit: jest.fn() } as any,
    ...overrides,
  };
}

function makeState(overrides: Partial<PortfolioStateType> = {}): PortfolioStateType {
  return {
    conversationId: oid().toString(),
    artefactId: oid().toString(),
    userId: oid().toString(),
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
    pdpGoals: [
      {
        goal: 'Improve skills',
        actions: [{ action: 'Do X', intendedEvidence: 'Evidence Y' }],
      },
    ],
    error: null,
    ...overrides,
  } as PortfolioStateType;
}

// ── Tests ──

describe('SaveNode', () => {
  it('should propagate transaction errors (not swallow them)', async () => {
    const deps = makeDeps({
      transactionService: {
        withTransaction: jest.fn().mockRejectedValue(new Error('Mongo write conflict')),
      } as any,
    });
    const node = createSaveNode(deps);

    await expect(node(makeState())).rejects.toThrow('Mongo write conflict');
  });

  it('should propagate artefact update errors', async () => {
    const deps = makeDeps();
    (deps.artefactsRepository.updateArtefactById as jest.Mock).mockResolvedValue({
      ok: false,
      error: { code: 'DB_ERROR', message: 'Update failed' },
    });

    const node = createSaveNode(deps);

    await expect(node(makeState())).rejects.toThrow('Update failed');
  });

  it('should propagate PDP goal creation errors', async () => {
    const deps = makeDeps();
    (deps.artefactsRepository.updateArtefactById as jest.Mock).mockResolvedValue({
      ok: true,
      value: {},
    });
    (deps.pdpGoalsRepository.create as jest.Mock).mockResolvedValue({
      ok: false,
      error: { code: 'DB_ERROR', message: 'PDP creation failed' },
    });

    const node = createSaveNode(deps);

    await expect(node(makeState())).rejects.toThrow('PDP creation failed');
  });

  it('should NOT return an error field in state on failure', async () => {
    const deps = makeDeps({
      transactionService: {
        withTransaction: jest.fn().mockRejectedValue(new Error('Some error')),
      } as any,
    });
    const node = createSaveNode(deps);

    // The node should throw, not return { error: '...' }
    let result: Partial<PortfolioStateType> | undefined;
    try {
      result = await node(makeState());
    } catch {
      // Expected — error propagates
    }
    expect(result).toBeUndefined();
  });

  it('should return empty state on success', async () => {
    const deps = makeDeps();
    (deps.artefactsRepository.updateArtefactById as jest.Mock).mockResolvedValue({
      ok: true,
      value: {},
    });
    (deps.pdpGoalsRepository.create as jest.Mock).mockResolvedValue({
      ok: true,
      value: [],
    });

    const node = createSaveNode(deps);
    const result = await node(makeState());

    expect(result).toEqual({});
  });

  it('should update artefact with IN_REVIEW status', async () => {
    const deps = makeDeps();
    const updateMock = deps.artefactsRepository.updateArtefactById as jest.Mock;
    updateMock.mockResolvedValue({ ok: true, value: {} });
    (deps.pdpGoalsRepository.create as jest.Mock).mockResolvedValue({
      ok: true,
      value: [],
    });

    const state = makeState();
    const node = createSaveNode(deps);
    await node(state);

    expect(updateMock).toHaveBeenCalledWith(
      expect.any(Types.ObjectId),
      expect.objectContaining({ status: ArtefactStatus.IN_REVIEW }),
      expect.anything()
    );
  });
});
