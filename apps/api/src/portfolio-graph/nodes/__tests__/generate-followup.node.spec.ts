import { createGenerateFollowupNode } from '../generate-followup.node';
import { MAX_FOLLOWUP_ROUNDS } from '../../portfolio-graph.builder';
import type { GraphDeps } from '../../graph-deps';
import type { PortfolioStateType } from '../../portfolio-graph.state';

// ── Helpers ──

function makeDeps(overrides: Partial<GraphDeps> = {}): GraphDeps {
  return {
    artefactsRepository: {} as any,
    conversationsRepository: {} as any,
    pdpGoalsRepository: {} as any,
    transactionService: {} as any,
    llmService: {
      invokeStructured: jest.fn(),
    } as any,
    eventEmitter: { emit: jest.fn() } as any,
    ...overrides,
  };
}

function makeState(overrides: Partial<PortfolioStateType> = {}): PortfolioStateType {
  return {
    conversationId: 'conv-123',
    artefactId: 'art-123',
    userId: 'user-123',
    specialty: '100', // GP
    trainingStage: 'ST1',
    fullTranscript: 'I saw a 72 year old lady with a dry cough for 6 weeks.',

    isRelevant: true,
    entryType: 'CLINICAL_CASE_REVIEW',
    classificationConfidence: 0.9,
    classificationReasoning: '',

    alternatives: [],
    classificationConfirmed: true,
    clarificationRound: 0,
    sectionCoverage: {
      presentation: { covered: true, depth: 'adequate' },
      clinical_reasoning: { covered: false, depth: 'shallow' },
      management: { covered: false, depth: 'shallow' },
      outcome: { covered: false, depth: 'shallow' },
      reflection: { covered: false, depth: 'shallow' },
    },
    missingSections: ['clinical_reasoning', 'management', 'outcome', 'reflection'],
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

// ── Tests ──

describe('GenerateFollowupNode', () => {
  describe('circuit breaker', () => {
    it('should throw when followUpRound equals MAX_FOLLOWUP_ROUNDS', async () => {
      const node = createGenerateFollowupNode(makeDeps());
      const state = makeState({ followUpRound: MAX_FOLLOWUP_ROUNDS });

      await expect(node(state)).rejects.toThrow(
        `Follow-up round ${MAX_FOLLOWUP_ROUNDS} exceeds maximum ${MAX_FOLLOWUP_ROUNDS}`
      );
    });

    it('should throw when followUpRound exceeds MAX_FOLLOWUP_ROUNDS', async () => {
      const node = createGenerateFollowupNode(makeDeps());
      const state = makeState({ followUpRound: MAX_FOLLOWUP_ROUNDS + 1 });

      await expect(node(state)).rejects.toThrow('exceeds maximum');
    });

    it('should NOT throw when followUpRound is below MAX_FOLLOWUP_ROUNDS', async () => {
      const deps = makeDeps();
      (deps.llmService.invokeStructured as jest.Mock).mockResolvedValue({
        data: {
          questions: [
            {
              sectionId: 'reflection',
              question: 'What did you learn?',
              hints: { examples: ['Example'] },
            },
          ],
        },
      });

      const node = createGenerateFollowupNode(deps);
      const state = makeState({ followUpRound: 0 });

      await expect(node(state)).resolves.not.toThrow();
    });
  });

  describe('no entry type', () => {
    it('should return empty questions and increment round when entryType is null', async () => {
      const node = createGenerateFollowupNode(makeDeps());
      const state = makeState({ entryType: null });

      const result = await node(state);

      expect(result.pendingFollowupQuestions).toEqual([]);
      expect(result.followUpRound).toBe(1);
    });
  });

  describe('no askable sections', () => {
    it('should return empty questions when missingSections has no match in template', async () => {
      const node = createGenerateFollowupNode(makeDeps());
      const state = makeState({ missingSections: ['nonexistent_section'] });

      const result = await node(state);

      expect(result.pendingFollowupQuestions).toEqual([]);
      expect(result.followUpRound).toBe(1);
    });
  });

  describe('LLM contextualisation', () => {
    it('should call LLM and return contextualised questions', async () => {
      const deps = makeDeps();
      (deps.llmService.invokeStructured as jest.Mock).mockResolvedValue({
        data: {
          questions: [
            {
              sectionId: 'reflection',
              question: 'Was there anything you would do differently?',
              hints: { examples: ['In a paeds case I...'] },
            },
            {
              sectionId: 'clinical_reasoning',
              question: 'What other diagnoses did you consider?',
              hints: { examples: ['For a rash I considered...'] },
            },
            {
              sectionId: 'management',
              question: 'What management plan did you put in place?',
              hints: { examples: ['I prescribed...'] },
            },
          ],
        },
      });

      const node = createGenerateFollowupNode(deps);
      const state = makeState();
      const result = await node(state);

      expect(result.pendingFollowupQuestions).toHaveLength(3);
      expect(result.pendingFollowupQuestions!.map((q) => q.sectionId)).toEqual(
        expect.arrayContaining(['reflection', 'clinical_reasoning', 'management'])
      );
      expect(result.followUpRound).toBe(1);
    });

    it('should select top 3 missing sections by weight', async () => {
      const deps = makeDeps();
      (deps.llmService.invokeStructured as jest.Mock).mockResolvedValue({
        data: { questions: [] },
      });

      const node = createGenerateFollowupNode(deps);
      // 4 missing sections — only top 3 by weight should be asked
      const state = makeState({
        missingSections: ['clinical_reasoning', 'management', 'outcome', 'reflection'],
      });
      const result = await node(state);

      // LLM returned empty, so backfill kicks in for the top 3 by weight:
      // reflection (0.25), clinical_reasoning (0.20), management (0.15)
      // outcome (0.10) is excluded
      expect(result.pendingFollowupQuestions).toHaveLength(3);
      const sectionIds = result.pendingFollowupQuestions!.map((q) => q.sectionId);
      expect(sectionIds).toContain('reflection');
      expect(sectionIds).toContain('clinical_reasoning');
      expect(sectionIds).toContain('management');
      expect(sectionIds).not.toContain('outcome');
    });

    it('should backfill sections the LLM missed with default questions', async () => {
      const deps = makeDeps();
      // LLM only returns 1 question, but 2 sections are missing
      (deps.llmService.invokeStructured as jest.Mock).mockResolvedValue({
        data: {
          questions: [
            {
              sectionId: 'reflection',
              question: 'Contextualised reflection question',
              hints: { examples: ['Example'] },
            },
          ],
        },
      });

      const node = createGenerateFollowupNode(deps);
      const state = makeState({ missingSections: ['reflection', 'outcome'] });
      const result = await node(state);

      expect(result.pendingFollowupQuestions).toHaveLength(2);

      const reflectionQ = result.pendingFollowupQuestions!.find((q) => q.sectionId === 'reflection');
      expect(reflectionQ!.question).toBe('Contextualised reflection question');

      // outcome should be backfilled with default extraction question from template
      const outcomeQ = result.pendingFollowupQuestions!.find((q) => q.sectionId === 'outcome');
      expect(outcomeQ!.question).toBe('What was the outcome for this patient?');
    });

    it('should filter out LLM questions with unknown sectionIds', async () => {
      const deps = makeDeps();
      (deps.llmService.invokeStructured as jest.Mock).mockResolvedValue({
        data: {
          questions: [
            {
              sectionId: 'reflection',
              question: 'Valid question',
              hints: { examples: ['Ex'] },
            },
            {
              sectionId: 'bogus_section',
              question: 'Invalid question',
              hints: { examples: ['Ex'] },
            },
          ],
        },
      });

      const node = createGenerateFollowupNode(deps);
      const state = makeState({ missingSections: ['reflection'] });
      const result = await node(state);

      expect(result.pendingFollowupQuestions).toHaveLength(1);
      expect(result.pendingFollowupQuestions![0].sectionId).toBe('reflection');
    });
  });

  describe('LLM failure fallback', () => {
    it('should use default questions when LLM call throws', async () => {
      const deps = makeDeps();
      (deps.llmService.invokeStructured as jest.Mock).mockRejectedValue(new Error('API timeout'));

      const node = createGenerateFollowupNode(deps);
      const state = makeState({ missingSections: ['reflection', 'outcome'] });
      const result = await node(state);

      expect(result.pendingFollowupQuestions).toHaveLength(2);

      // Should use default extraction questions from template
      const reflectionQ = result.pendingFollowupQuestions!.find((q) => q.sectionId === 'reflection');
      expect(reflectionQ!.question).toBe(
        'What did you learn from this case, and would you do anything differently?'
      );
      expect(reflectionQ!.hints.examples).toEqual(['A couple of sentences with specific details is ideal.']);
    });
  });

  describe('event emission', () => {
    it('should emit ANALYSIS_STEP_STARTED with generate_followup step', async () => {
      const deps = makeDeps();
      (deps.llmService.invokeStructured as jest.Mock).mockResolvedValue({
        data: { questions: [] },
      });

      const node = createGenerateFollowupNode(deps);
      await node(makeState({ missingSections: ['reflection'] }));

      expect(deps.eventEmitter.emit).toHaveBeenCalledWith(
        'analysis.step.started',
        { conversationId: 'conv-123', step: 'generate_followup' }
      );
    });
  });
});
