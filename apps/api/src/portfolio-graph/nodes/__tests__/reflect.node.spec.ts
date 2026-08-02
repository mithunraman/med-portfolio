import type { GraphDeps } from '../../graph-deps';
import type { PortfolioStateType } from '../../portfolio-graph.state';
import { createReflectNode } from '../reflect.node';

/**
 * Exercises the assemble routing the reflect node owns: a section with compose
 * guidance uses the verified narrative, falls back to concat when the narrative
 * fabricates, and a section without guidance is a passthrough concat. Specialty
 * '100' is GP; CLINICAL_CASE_REVIEW uses the CCR template (brief_description has
 * a composePrompt; reflection/learning do not).
 */

const TRANSCRIPT =
  'I saw a 72-year-old woman with a six-week dry cough. She takes ramipril. ' +
  'I stopped the ramipril and arranged a chest X-ray. It showed a right upper lobe shadow. ' +
  'Looking back I anchored too quickly. I need to read up on cough red flags.';

function makeDeps(structuredResponse: unknown): GraphDeps {
  return {
    artefactsRepository: {} as any,
    conversationsRepository: {} as any,
    pdpGoalsRepository: {} as any,
    transactionService: {} as any,
    llmService: {
      invokeStructured: jest.fn().mockResolvedValue({ data: structuredResponse }),
    } as any,
    modelConfig: { resolve: jest.fn(() => ({ provider: 'openai', pool: 'openai', model: 'test-model' })) } as any,
    eventEmitter: { emit: jest.fn() } as any,
  };
}

function makeState(): PortfolioStateType {
  return {
    conversationId: 'conv-1',
    artefactId: 'art-1',
    userId: 'user-1',
    specialty: '100',
    trainingStage: 'ST2',
    fullTranscript: TRANSCRIPT,
    entryType: 'CLINICAL_CASE_REVIEW',
    capabilities: [],
  } as unknown as PortfolioStateType;
}

/** A full nested reflect response; override brief_description's narrative per test. */
function makeResponse(briefNarrative: string) {
  return {
    sections: [
      {
        sectionId: 'brief_description',
        probes: [
          {
            probeId: 'presentation',
            title: 'Clinical Presentation',
            text: 'I saw a 72-year-old woman with a six-week dry cough. She takes ramipril.',
            covered: true,
          },
          { probeId: 'clinical_findings', title: 'Clinical Findings', text: '', covered: false },
          {
            probeId: 'clinical_reasoning',
            title: 'Clinical Reasoning',
            text: 'I stopped the ramipril.',
            covered: true,
          },
          {
            probeId: 'management',
            title: 'Management & Actions',
            text: 'I arranged a chest X-ray.',
            covered: true,
          },
          {
            probeId: 'outcome',
            title: 'Patient Outcome',
            text: 'It showed a right upper lobe shadow.',
            covered: true,
          },
        ],
        narrative: briefNarrative,
      },
      {
        sectionId: 'reflection',
        probes: [
          { probeId: 'reflection', title: 'Reflection', text: 'I anchored too quickly.', covered: true },
        ],
        narrative: '',
      },
      {
        sectionId: 'learning',
        probes: [
          {
            probeId: 'learning_needs',
            title: 'Learning Needs',
            text: 'I need to read up on cough red flags.',
            covered: true,
          },
        ],
        narrative: '',
      },
    ],
    title: '72F - dry cough',
  };
}

function brief(result: Partial<PortfolioStateType>) {
  return result.composedDocument!.find((s) => s.sectionId === 'brief_description')!;
}

describe('reflectNode assemble routing', () => {
  it('uses the verified narrative for a section with compose guidance', async () => {
    const narrative =
      'I saw a 72-year-old woman taking ramipril with a six-week dry cough, so I stopped the ' +
      'ramipril and arranged a chest X-ray, which showed a right upper lobe shadow.';
    const result = await createReflectNode(makeDeps(makeResponse(narrative)))(makeState());

    expect(brief(result).text).toBe(narrative);
  });

  it('ships the narrative even when verification fails, recording the failed verdict (telemetry only)', async () => {
    // "78" appears in no probe → verification fails, but the narrative is still
    // used (the trainee edits before save); the verdict is kept on the trace.
    const narrative = 'I saw a 78-year-old woman; I stopped the ramipril.';
    const result = await createReflectNode(makeDeps(makeResponse(narrative)))(makeState());

    expect(brief(result).text).toBe(narrative); // shipped despite the fabricated number

    const trace = result.reflectTrace!.find((t) => t.sectionId === 'brief_description')!;
    expect(trace.source).toBe('composed');
    expect(trace.verification!.ok).toBe(false);
    expect(trace.verification!.reason).toMatch(/novel number/);
  });

  it('passes a section without compose guidance straight through (concat)', async () => {
    const result = await createReflectNode(makeDeps(makeResponse('')))(makeState());

    const reflection = result.composedDocument!.find((s) => s.sectionId === 'reflection')!;
    expect(reflection.text).toBe('I anchored too quickly.');
    expect(reflection.label).toBe('Reflection');
  });

  it('emits a reflect trace recording the synthesis source per section', async () => {
    const narrative =
      'I saw a 72-year-old woman taking ramipril with a six-week dry cough, so I stopped the ' +
      'ramipril and arranged a chest X-ray, which showed a right upper lobe shadow.';
    const result = await createReflectNode(makeDeps(makeResponse(narrative)))(makeState());

    const trace = result.reflectTrace!;
    expect(trace.find((t) => t.sectionId === 'brief_description')!.source).toBe('composed');
    expect(trace.find((t) => t.sectionId === 'reflection')!.source).toBe('concat');
  });

  it('explains the TRAINEE: / AI asked: transcript convention in the prompt', async () => {
    const deps = makeDeps(makeResponse(''));
    await createReflectNode(deps)(makeState());

    const prompt = (deps.llmService.invokeStructured as jest.Mock).mock.calls[0][0]
      .map((m: { content: unknown }) => String(m.content))
      .join('\n');
    // The role-marker convention must reach the model so it doesn't treat AI
    // prompts as trainee content or echo the labels into the composed text.
    expect(prompt).toContain('Transcript format');
    expect(prompt).toContain('TRAINEE:');
    expect(prompt).toContain('AI asked:');
  });

  async function renderedSystemPrompt(): Promise<string> {
    const deps = makeDeps(makeResponse(''));
    await createReflectNode(deps)(makeState());
    const messages = (deps.llmService.invokeStructured as jest.Mock).mock.calls[0][0] as Array<{
      content: unknown;
    }>;
    return String(messages[0].content);
  }

  it('renders the Output Format JSON with single braces and no stray escapes', async () => {
    const prompt = await renderedSystemPrompt();
    // The template escapes braces as {{ }} so LangChain leaves them literal; the model
    // must receive single-brace, valid JSON.
    expect(prompt).toContain('{\n  "sections": [');
    expect(prompt).not.toContain('{{');
    expect(prompt).not.toContain('}}');
  });

  it('uses a formatting-calibration stage context, not the question-voiced leak', async () => {
    const prompt = await renderedSystemPrompt();
    // The reflect prompt formats; it must not carry the follow-up node's question phrasing.
    expect(prompt).not.toContain('Ask questions that probe');
    expect(prompt).toContain('calibrate FORMATTING only');
    expect(prompt).toContain('This trainee is in'); // terse formatting descriptor
  });

  it('binds the faithfulness rules to the composed narrative (Rule 9 + category-label ban)', async () => {
    const prompt = await renderedSystemPrompt();
    expect(prompt).toContain('Rules 1-8 apply EQUALLY to the composed narrative');
    expect(prompt).toContain('falls prevention advice'); // the category-label example
  });
});
