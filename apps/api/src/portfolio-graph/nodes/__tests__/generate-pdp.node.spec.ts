import type { GraphDeps } from '../../graph-deps';
import type { PortfolioStateType } from '../../portfolio-graph.state';
import { createGeneratePdpNode } from '../generate-pdp.node';

// These exercise the PDP prompt contract by stubbing the LLM and capturing the
// rendered system message. Specialty '100' is GP (config.name = "General Practice").

function makeDeps(structuredResponse: unknown): GraphDeps {
  return {
    artefactsRepository: {} as any,
    conversationsRepository: {} as any,
    pdpGoalsRepository: {} as any,
    transactionService: {} as any,
    llmService: {
      invokeStructured: jest.fn().mockResolvedValue({ data: structuredResponse }),
    } as any,
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
    specialty: '100',
    trainingStage: 'ST2',
    entryType: 'CLINICAL_CASE_REVIEW',
    // Non-empty so the node builds the prompt rather than short-circuiting.
    composedDocument: [
      {
        sectionId: 'reflection',
        label: 'Reflection',
        text: 'I want to be more systematic about prescribing in older patients.',
      },
    ],
    capabilities: [],
    isRelevant: true,
    missingSections: [],
    hasEnoughInfo: true,
    followUpRound: 0,
    pendingFollowupQuestions: [],
    title: null,
    reflection: null,
    pdpGoals: [],
    ...overrides,
  } as PortfolioStateType;
}

describe('generatePdpNode prompt', () => {
  async function renderedSystemPrompt(): Promise<string> {
    const deps = makeDeps({ goals: [] });
    await createGeneratePdpNode(deps)(makeState());
    const messages = (deps.llmService.invokeStructured as jest.Mock).mock.calls[0][0] as Array<{
      content: unknown;
    }>;
    return String(messages[0].content);
  }

  it('renders the Output Format JSON with single braces and no stray escapes', async () => {
    const prompt = await renderedSystemPrompt();
    // The template escapes braces as {{ }} so LangChain leaves them literal; the model
    // must receive single-brace, valid JSON.
    expect(prompt).toContain('{\n  "goals": [');
    expect(prompt).not.toContain('{{');
    expect(prompt).not.toContain('}}');
  });

  it('uses the formatting stage context, not the question-voiced leak', async () => {
    const prompt = await renderedSystemPrompt();
    // PDP generates goals, not questions — it must not carry the follow-up phrasing.
    expect(prompt).not.toContain('Ask questions that probe');
    expect(prompt).toContain('This trainee is in ST2'); // terse formatting descriptor
  });

  it('forbids laundering capability tags into learning needs and bans grade language', async () => {
    const prompt = await renderedSystemPrompt();
    expect(prompt).toContain('NEVER quote or paraphrase a capability tag as a learningNeed');
    // Evidence Source Rule — the load-bearing guard against fabricated goals.
    expect(prompt).toContain('Every learningNeed must be quotable from the trainee');
    expect(prompt).toContain('NO GRADE LANGUAGE');
  });
});
