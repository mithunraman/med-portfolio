import { createGenerateFollowupNode } from '../generate-followup.node';
import { DEFAULT_MAX_FOLLOWUP_ROUNDS } from '../../portfolio-graph.state';
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
    modelConfig: { resolve: jest.fn(() => ({ provider: 'openai', pool: 'openai', model: 'test-model' })) } as any,
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
    maxFollowupRounds: DEFAULT_MAX_FOLLOWUP_ROUNDS,
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
    it('should throw when followUpRound equals the run cap (state.maxFollowupRounds)', async () => {
      const node = createGenerateFollowupNode(makeDeps());
      const state = makeState({ followUpRound: 12, maxFollowupRounds: 12 });

      await expect(node(state)).rejects.toThrow(
        'Follow-up round 12 exceeds maximum 12'
      );
    });

    it('should throw when followUpRound exceeds the run cap', async () => {
      const node = createGenerateFollowupNode(makeDeps());
      const state = makeState({ followUpRound: 13, maxFollowupRounds: 12 });

      await expect(node(state)).rejects.toThrow('exceeds maximum');
    });

    it('should NOT throw when followUpRound is below the run cap', async () => {
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

  describe('rubric-calibrated prompt', () => {
    it("injects each missing section's full Depth rubric and the current→target depth delta", async () => {
      const deps = makeDeps();
      const mock = deps.llmService.invokeStructured as jest.Mock;
      mock.mockResolvedValue({
        data: { questions: [{ sectionId: 'reflection', question: 'q', hints: { examples: ['e'] } }] },
      });

      // reflection is missing and its threshold is 'strong' (CCR template).
      await createGenerateFollowupNode(deps)(
        makeState({
          followUpRound: 0,
          missingSections: ['reflection'],
          probeReadiness: {
            reflection: { score: 0.4, tier: 'shallow', meetsThreshold: false },
          },
        })
      );

      const prompt = (mock.mock.calls[0][0] as Array<{ content: unknown }>)
        .map((m) => String(m.content))
        .join('\n');
      // Rubric reaches the prompt under its calibrated label.
      expect(prompt).toContain('Depth rubric (the grading bar):');
      // The CCR reflection rubric phrase must reach the prompt, so the question
      // is steered to elicit maintain/improve/stop evaluation (not uncertainty).
      expect(prompt).toContain('maintain, improve, or stop in future practice');
      // All three tiers reach the model, not just the top one — this is the delta.
      expect(prompt).toContain('Adequate =');
      expect(prompt).toContain('Shallow =');
      // The current→target depth gap is made explicit for hint calibration.
      expect(prompt).toContain('Current depth: shallow → Target depth: strong');
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

  describe('covered-list excludes below-threshold sections (Phase 1)', () => {
    // Regression: reflection graded 'adequate' but threshold 'strong' (meetsThreshold
    // false) was previously listed BOTH as a missing section AND under "Already Covered
    // Well" (which used a raw adequate/strong tier check). Rule 6 then suppressed the
    // question and the LLM returned an empty array → generic backfill. It must now
    // appear only as a live gap, never as covered.
    it('does not list a below-threshold adequate section as covered, and still asks it', async () => {
      const deps = makeDeps();
      const mock = deps.llmService.invokeStructured as jest.Mock;
      mock.mockResolvedValue({
        data: { questions: [{ sectionId: 'reflection', question: 'q', hints: { examples: ['e'] } }] },
      });

      await createGenerateFollowupNode(deps)(
        makeState({
          missingSections: ['reflection'],
          probeReadiness: {
            // meets its own (adequate) threshold → genuinely covered
            presentation: { score: 0.7, tier: 'adequate', meetsThreshold: true },
            // adequate but Target is 'strong' → still a live gap, NOT covered
            reflection: { score: 0.7, tier: 'adequate', meetsThreshold: false },
          },
        })
      );

      const context = String((mock.mock.calls[0][0] as Array<{ content: unknown }>)[1].content);
      const coveredBlock = context.slice(
        context.indexOf('## Already Covered Well'),
        context.indexOf('## Questions Already Asked')
      );

      // Reflection must NOT be in the covered block…
      expect(coveredBlock).not.toContain('Reflection');
      // …a genuinely-met section still is…
      expect(coveredBlock).toContain('Clinical Presentation');
      // …and reflection is still presented as a live gap to ask about.
      expect(context).toContain('### reflection —');
    });

    // Isolates the `meetsThreshold` clause specifically. With MAX_QUESTIONS_PER_ROUND=1
    // and two below-threshold gaps, only the earlier narrative section (clinical_reasoning,
    // rank 2) is selected into the ask set; reflection (rank 5) stays below-threshold but
    // OUT of askSetIds. So the `!askSetIds.has` clause cannot exclude reflection here — only
    // the `meetsThreshold === true` check can. If the filter reverted to a raw
    // adequate/strong tier check (keeping askSetIds), reflection would wrongly appear as
    // "covered" and a FUTURE round's Rule 6 would suppress it. This case fails on that revert.
    it('excludes a below-threshold section that is NOT in this round’s ask set', async () => {
      const deps = makeDeps();
      const mock = deps.llmService.invokeStructured as jest.Mock;
      mock.mockResolvedValue({
        data: {
          questions: [
            { sectionId: 'clinical_reasoning', question: 'q', hints: { examples: ['e'] } },
          ],
        },
      });

      await createGenerateFollowupNode(deps)(
        makeState({
          missingSections: ['clinical_reasoning', 'reflection'],
          probeReadiness: {
            presentation: { score: 0.7, tier: 'adequate', meetsThreshold: true }, // genuinely covered
            clinical_reasoning: { score: 0.7, tier: 'adequate', meetsThreshold: false }, // asked this round
            reflection: { score: 0.7, tier: 'adequate', meetsThreshold: false }, // below-threshold, NOT asked
          },
        })
      );

      const context = String((mock.mock.calls[0][0] as Array<{ content: unknown }>)[1].content);
      const coveredBlock = context.slice(
        context.indexOf('## Already Covered Well'),
        context.indexOf('## Questions Already Asked')
      );

      // The below-threshold, not-asked section must NOT be listed as covered (guards
      // the meetsThreshold clause) …
      expect(coveredBlock).not.toContain('Reflection');
      // …nor the section being asked this round …
      expect(coveredBlock).not.toContain('Clinical Reasoning');
      // …while a genuinely threshold-meeting section still is.
      expect(coveredBlock).toContain('Clinical Presentation');
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

    it('asks the earliest gap in template narrative order (management before outcome)', async () => {
      const deps = makeDeps();
      (deps.llmService.invokeStructured as jest.Mock).mockResolvedValue({
        data: { questions: [] },
      });

      const node = createGenerateFollowupNode(deps);
      // 4 unasked gaps — narrative order is clinical_reasoning → management → outcome →
      // reflection, so clinical_reasoning is asked first (NOT reflection by weight),
      // and management would precede outcome.
      const state = makeState({
        missingSections: ['reflection', 'outcome', 'management', 'clinical_reasoning'],
      });
      const result = await node(state);

      expect(result.pendingFollowupQuestions).toHaveLength(1);
      expect(result.pendingFollowupQuestions![0].sectionId).toBe('clinical_reasoning');
    });

    it('picks management before outcome when both are the only gaps', async () => {
      const deps = makeDeps();
      (deps.llmService.invokeStructured as jest.Mock).mockResolvedValue({ data: { questions: [] } });

      const node = createGenerateFollowupNode(deps);
      const state = makeState({ missingSections: ['outcome', 'management'] });
      const result = await node(state);

      expect(result.pendingFollowupQuestions![0].sectionId).toBe('management');
    });

    it('asks an unasked later section before re-asking an earlier one (coverage-first)', async () => {
      const deps = makeDeps();
      (deps.llmService.invokeStructured as jest.Mock).mockResolvedValue({ data: { questions: [] } });

      const node = createGenerateFollowupNode(deps);
      // management is earlier in narrative order but already asked once; reflection is
      // later but unasked — coverage-first gives reflection its first question first.
      const state = makeState({
        missingSections: ['management', 'reflection'],
        sectionAttempts: { management: { count: 1, tierAtLastAsk: 'missing' } },
      });
      const result = await node(state);

      expect(result.pendingFollowupQuestions![0].sectionId).toBe('reflection');
    });

    it('skips an exhausted section and asks the next live one', async () => {
      const deps = makeDeps();
      (deps.llmService.invokeStructured as jest.Mock).mockResolvedValue({ data: { questions: [] } });

      const node = createGenerateFollowupNode(deps);
      // reflection was asked to its cap without improving, so it is retired; outcome
      // is the only live gap and is asked instead.
      const state = makeState({
        missingSections: ['reflection', 'outcome'],
        sectionAttempts: { reflection: { count: 2, tierAtLastAsk: 'missing' } },
      });
      const result = await node(state);

      expect(result.pendingFollowupQuestions).toHaveLength(1);
      expect(result.pendingFollowupQuestions![0].sectionId).toBe('outcome');
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

    it('dedupes multiple questions for the same section (one ask, one attempt bump)', async () => {
      const deps = makeDeps();
      // The model emits TWO micro-questions for the single selected section.
      // Both pass the valid-id filter, so without deduping they would push two
      // questions and double-increment sectionAttempts (retiring after one round).
      (deps.llmService.invokeStructured as jest.Mock).mockResolvedValue({
        data: {
          questions: [
            { sectionId: 'reflection', question: 'What did you learn?', hints: { examples: ['Ex'] } },
            {
              sectionId: 'reflection',
              question: 'What would you do differently?',
              hints: { examples: ['Ex'] },
            },
          ],
        },
      });

      const node = createGenerateFollowupNode(deps);
      const state = makeState({
        missingSections: ['reflection'],
        probeReadiness: { reflection: { score: 0, tier: 'missing', meetsThreshold: false } },
      });
      const result = await node(state);

      // Exactly one question surfaces despite two objects for the section.
      expect(result.pendingFollowupQuestions).toHaveLength(1);
      expect(result.pendingFollowupQuestions![0].sectionId).toBe('reflection');
      expect(result.askedFollowupQuestions).toHaveLength(1);
      // The attempt counter bumps once — not twice — so the genuine second ask survives.
      expect(result.sectionAttempts!['reflection'].count).toBe(1);
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

  describe('always asks the selected section (never omits)', () => {
    // A section reaches the LLM only if the grader selected it (below threshold, not
    // exhausted). If the model omits it anyway (returns []), the backfill must still
    // produce a question — the "stop asking" decision is deterministic (selection), not
    // the model's. Guards against re-introducing the ERMJ omit→generic-default failure.
    it('backfills a question when the LLM omits the selected section (returns [])', async () => {
      const deps = makeDeps();
      (deps.llmService.invokeStructured as jest.Mock).mockResolvedValue({
        data: { questions: [] }, // model omitted the sole selected gap
      });

      const node = createGenerateFollowupNode(deps);
      const state = makeState({ missingSections: ['reflection'] });
      const result = await node(state);

      expect(result.pendingFollowupQuestions).toHaveLength(1);
      expect(result.pendingFollowupQuestions![0].sectionId).toBe('reflection');
      expect(result.pendingFollowupQuestions![0].question).toBe(
        'Looking back, what would you maintain, improve, or stop, and why?'
      );
    });
  });

  describe('LLM failure fallback', () => {
    it('should use default questions when LLM call throws', async () => {
      const deps = makeDeps();
      (deps.llmService.invokeStructured as jest.Mock).mockRejectedValue(new Error('API timeout'));

      const node = createGenerateFollowupNode(deps);
      const state = makeState({ missingSections: ['reflection'] });
      const result = await node(state);

      // One question per round, backfilled from the template default on LLM failure.
      expect(result.pendingFollowupQuestions).toHaveLength(1);

      // Should use the default extraction question + generic depth hints. The fallback
      // must NOT surface promptHint (a renderer directive) as an example response.
      const reflectionQ = result.pendingFollowupQuestions!.find((q) => q.sectionId === 'reflection');
      expect(reflectionQ!.question).toBe(
        'Looking back, what would you maintain, improve, or stop, and why?'
      );
      expect(reflectionQ!.hints.examples).toEqual([
        'A couple of sentences with specific details is ideal.',
      ]);
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
