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
    modelConfig: {
      resolve: jest.fn(() => ({ provider: 'openai', pool: 'openai', model: 'test-model' })),
    } as any,
    eventEmitter: { emit: jest.fn() } as any,
  };
}

function makeState(overrides: Partial<PortfolioStateType> = {}): PortfolioStateType {
  return {
    conversationId: 'conv-1',
    artefactId: 'art-1',
    userId: 'user-1',
    specialty: '0',
    trainingStage: '',
    fullTranscript: 'test transcript',

    isRelevant: true,
    entryType: 'CLINICAL_ENCOUNTER',

    missingSections: [],
    hasEnoughInfo: true,
    followUpRound: 0,
    pendingFollowupQuestions: [],
    capabilities: [
      { code: 'CAP1', name: 'Cap 1', tier: 'strong', reasoning: 'test', quote: 'a verbatim span' },
    ],
    title: 'Test Entry',
    composedDocument: [{ sectionId: 'reflection', label: 'Reflection', text: 'Some reflection' }],

    pdpGoals: [],

    ...overrides,
  } as PortfolioStateType;
}

// ── Tests ──

describe('SaveNode', () => {
  it("returns draftStatus 'ready' when the rubric has cleared", async () => {
    const node = createSaveNode(makeDeps());
    const result = await node(makeState({ hasEnoughInfo: true }));

    expect(result).toMatchObject({ draftStatus: 'ready' });
  });

  it("returns draftStatus 'needs_attention' when gaps remain", async () => {
    const node = createSaveNode(makeDeps());

    expect(await node(makeState({ hasEnoughInfo: false }))).toMatchObject({
      draftStatus: 'needs_attention',
    });
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

  it('should throw when title is missing', async () => {
    const node = createSaveNode(makeDeps());

    await expect(node(makeState({ title: null }))).rejects.toThrow('Cannot save: title is not set');
  });

  it('should throw when the entry body is missing', async () => {
    const node = createSaveNode(makeDeps());

    await expect(node(makeState({ composedDocument: [] }))).rejects.toThrow(
      'Cannot save: entry body (composedDocument) is not set'
    );
  });

  it('should throw when capabilities is empty', async () => {
    const node = createSaveNode(makeDeps());

    await expect(node(makeState({ capabilities: [] }))).rejects.toThrow(
      'Cannot save: no capabilities'
    );
  });

  it('should emit ANALYSIS_STEP_STARTED event', async () => {
    const deps = makeDeps();
    const node = createSaveNode(deps);
    await node(makeState());

    expect(deps.eventEmitter.emit).toHaveBeenCalledWith('analysis.step.started', {
      conversationId: 'conv-1',
      userId: 'user-1',
      step: 'save',
    });
  });

  describe('output typography normalisation', () => {
    const capability = {
      code: 'CAP1',
      name: 'Cap 1',
      tier: 'strong' as const,
      reasoning: 'I \u2014 reasoned',
      quote: 'I paused \u2014 then called',
      justification: 'I \u201Cescalated\u201D \u2014 promptly',
    };

    it('normalises every model-written field the artefact persists', async () => {
      const node = createSaveNode(makeDeps());
      const result = await node(
        makeState({
          title: 'Gout \u2014 a\u202Freview',
          composedDocument: [
            {
              sectionId: 'reflection',
              label: 'What \u2014 happened',
              text: 'I paused\u2014then called\u2026',
            },
          ],
          capabilities: [capability],
          pdpGoals: [
            {
              goal: 'Learn NG28 \u2014 targets',
              actions: [
                { action: 'Read \u201CNG28\u201D', intendedEvidence: 'CBD \u2014 next month' },
              ],
            },
          ],
        })
      );

      expect(result.title).toBe('Gout - a review');
      expect(result.composedDocument![0].text).toBe('I paused - then called...');
      expect(result.capabilities![0].justification).toBe('I "escalated" - promptly');
      expect(result.pdpGoals).toEqual([
        {
          goal: 'Learn NG28 - targets',
          actions: [{ action: 'Read "NG28"', intendedEvidence: 'CBD - next month' }],
        },
      ]);
    });

    it('leaves verbatim evidence, reasoning and template labels byte-identical', async () => {
      const node = createSaveNode(makeDeps());
      const result = await node(
        makeState({
          composedDocument: [
            { sectionId: 'reflection', label: 'What \u2014 happened', text: 'text' },
          ],
          capabilities: [capability],
        })
      );

      expect(result.composedDocument![0].label).toBe('What \u2014 happened');
      expect(result.capabilities![0].quote).toBe(capability.quote);
      expect(result.capabilities![0].reasoning).toBe(capability.reasoning);
    });

    it('returns already-clean fields unchanged', async () => {
      const node = createSaveNode(makeDeps());
      const state = makeState({
        capabilities: [{ ...capability, justification: undefined }],
        pdpGoals: [
          { goal: 'Learn NG28', actions: [{ action: 'Read it', intendedEvidence: 'CBD' }] },
        ],
      });
      const result = await node(state);

      expect(result.title).toBe(state.title);
      expect(result.composedDocument).toEqual(state.composedDocument);
      expect(result.capabilities).toEqual(state.capabilities);
      expect(result.pdpGoals).toEqual(state.pdpGoals);
    });
  });
});
