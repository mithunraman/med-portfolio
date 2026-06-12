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
    probeReadiness: {
      presentation: { score: 0.7, tier: 'adequate', meetsThreshold: true },
      clinical_reasoning: { score: 0, tier: 'missing', meetsThreshold: false },
      management: { score: 0, tier: 'missing', meetsThreshold: false },
      outcome: { score: 0, tier: 'missing', meetsThreshold: false },
      reflection: { score: 0, tier: 'missing', meetsThreshold: false },
    },
    missingSections: ['clinical_reasoning', 'management', 'outcome', 'reflection'],
    hasEnoughInfo: false,
    followUpRound: 0,
    pendingFollowupQuestions: [],
    askedFollowupQuestions: [],
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

  describe('rubric-aware prompt (Option A)', () => {
    it("injects each missing section's descriptorCriteria so questions target the grading bar", async () => {
      const deps = makeDeps();
      const mock = deps.llmService.invokeStructured as jest.Mock;
      mock.mockResolvedValue({
        data: { questions: [{ sectionId: 'reflection', question: 'q', hints: { examples: ['e'] } }] },
      });

      await createGenerateFollowupNode(deps)(makeState({ followUpRound: 0 }));

      const prompt = (mock.mock.calls[0][0] as Array<{ content: unknown }>)
        .map((m) => String(m.content))
        .join('\n');
      expect(prompt).toContain('What strong looks like:');
      // The CCR reflection rubric phrase must reach the prompt, so the question
      // is steered to elicit maintain/improve/stop evaluation (not uncertainty).
      expect(prompt).toContain('maintain, improve, or stop in future practice');
    });
  });

  describe('cache-friendly layout', () => {
    // Capture the BaseMessage[] the node sends to the LLM for a given state.
    async function promptFor(state: PortfolioStateType) {
      const deps = makeDeps();
      const mock = deps.llmService.invokeStructured as jest.Mock;
      mock.mockResolvedValue({
        data: { questions: [{ sectionId: 'x', question: 'q', hints: { examples: ['e'] } }] },
      });
      await createGenerateFollowupNode(deps)(state);
      return mock.mock.calls[0][0] as Array<{ content: unknown }>;
    }

    it('keeps the static instruction prefix byte-identical across entry type, stage, and round', async () => {
      const a = await promptFor(makeState({ followUpRound: 0 }));
      const b = await promptFor(
        makeState({
          followUpRound: 1,
          entryType: 'SIGNIFICANT_EVENT', // different template
          trainingStage: 'ST3', // different stage context
          missingSections: ['root_cause', 'changes_made'],
          askedFollowupQuestions: ['What happened?'],
        })
      );

      // message[0] = static instructions → the cacheable prefix, must NOT vary.
      expect(String(a[0].content)).toBe(String(b[0].content));
      // message[1] = per-call context → must vary with state (dynamic content moved out).
      expect(String(a[1].content)).not.toBe(String(b[1].content));
    });

    it('keeps all per-call fields out of the static prefix', async () => {
      const [systemInstructions] = await promptFor(makeState());
      const prefix = String(systemInstructions.content);
      // None of the dynamic values may appear in the cached prefix.
      expect(prefix).not.toContain('Clinical Case Review'); // templateName
      expect(prefix).not.toContain('ST1'); // stage
      expect(prefix).not.toContain('## Context for this entry'); // context block
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

      // One leverage-ranked question per round.
      expect(result.pendingFollowupQuestions).toHaveLength(1);
      expect(result.followUpRound).toBe(1);
    });

    it('should select the single highest-leverage missing section', async () => {
      const deps = makeDeps();
      (deps.llmService.invokeStructured as jest.Mock).mockResolvedValue({
        data: { questions: [] },
      });

      const node = createGenerateFollowupNode(deps);
      // 4 missing sections — only the highest-leverage one is asked. With no
      // readiness recorded, leverage reduces to weight, so reflection (0.25) wins.
      const state = makeState({
        missingSections: ['clinical_reasoning', 'management', 'outcome', 'reflection'],
      });
      const result = await node(state);

      expect(result.pendingFollowupQuestions).toHaveLength(1);
      expect(result.pendingFollowupQuestions![0].sectionId).toBe('reflection');
    });

    it('should backfill the selected section when the LLM returns nothing', async () => {
      const deps = makeDeps();
      // LLM returns no questions — the node backfills the selected section.
      (deps.llmService.invokeStructured as jest.Mock).mockResolvedValue({
        data: { questions: [] },
      });

      const node = createGenerateFollowupNode(deps);
      const state = makeState({ missingSections: ['outcome'] });
      const result = await node(state);

      expect(result.pendingFollowupQuestions).toHaveLength(1);
      // outcome should be backfilled with the default extraction question from template
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

      // One question per round — reflection (weight 0.25) outranks outcome (0.10).
      expect(result.pendingFollowupQuestions).toHaveLength(1);

      // Should use the default extraction question from template
      const reflectionQ = result.pendingFollowupQuestions!.find((q) => q.sectionId === 'reflection');
      expect(reflectionQ!.question).toBe(
        'Looking back, what would you maintain, improve, or stop, and why?'
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
