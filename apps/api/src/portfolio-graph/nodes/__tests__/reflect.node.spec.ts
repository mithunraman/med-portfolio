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
    capabilityAnnotations: [],
    title: '72-year-old woman with a 6-week dry cough',
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

  it('falls back to a concat of the probes when the narrative fabricates a number', async () => {
    // "78" appears in no probe → verification fails → concat used instead.
    const result = await createReflectNode(
      makeDeps(makeResponse('I saw a 78-year-old woman; I stopped the ramipril.'))
    )(makeState());

    const text = brief(result).text;
    expect(text).not.toContain('78');
    expect(text).toContain('I arranged a chest X-ray.');
    expect(text).toContain('\n\n'); // concatenated probe paragraphs
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
});
