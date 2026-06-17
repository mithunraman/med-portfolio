import type { GraphDeps } from '../../graph-deps';
import type { PortfolioStateType } from '../../portfolio-graph.state';
import { createDedupeNode } from '../dedupe.node';

/**
 * Exercises the dedupe node's assembly: the model's merged text is trusted and
 * shipped directly (no faithfulness gate — the trainee edits before saving). The
 * only guards are data integrity (a model that omits/blanks a section keeps the
 * original) and graceful degradation (an LLM error keeps the reflect document).
 */

const REFLECT_DOCUMENT = [
  {
    sectionId: 'learning',
    label: 'Learning Needs',
    text:
      'My learning need is around targets. I am going to read the NICE NG28 guidance on HbA1c ' +
      'goals and when to intensify to a second agent. I am going to spend some evenings reading ' +
      'the NICE NG28 guidance on HbA1c goals.',
  },
  {
    sectionId: 'reflection',
    label: 'Reflection',
    text: 'I was pleased I tackled all the risk factors together.',
  },
];

function makeDeps(response: unknown, opts: { throws?: boolean } = {}): GraphDeps {
  return {
    artefactsRepository: {} as any,
    conversationsRepository: {} as any,
    pdpGoalsRepository: {} as any,
    transactionService: {} as any,
    llmService: {
      invokeStructured: opts.throws
        ? jest.fn().mockRejectedValue(new Error('LLM down'))
        : jest.fn().mockResolvedValue({ data: response }),
    } as any,
    eventEmitter: { emit: jest.fn() } as any,
  };
}

function makeState(document = REFLECT_DOCUMENT): PortfolioStateType {
  return { conversationId: 'conv-1', composedDocument: document } as unknown as PortfolioStateType;
}

function section(result: Partial<PortfolioStateType>, id: string) {
  return result.composedDocument!.find((s) => s.sectionId === id)!;
}

describe('dedupeNode', () => {
  it('ships the model merge verbatim (model output is trusted)', async () => {
    const merged =
      'My learning need is around targets. I am going to spend some evenings reading the NICE ' +
      'NG28 guidance on HbA1c goals and when to intensify to a second agent.';
    const result = await createDedupeNode(
      makeDeps({
        sections: [
          { sectionId: 'learning', text: merged },
          { sectionId: 'reflection', text: REFLECT_DOCUMENT[1].text },
        ],
      })
    )(makeState());

    expect(section(result, 'learning').text).toBe(merged);
    expect(result.dedupeTrace!.find((t) => t.sectionId === 'learning')!.source).toBe('merged');
  });

  it('marks a section unchanged when the model returns identical text', async () => {
    const result = await createDedupeNode(
      makeDeps({
        sections: [
          { sectionId: 'learning', text: REFLECT_DOCUMENT[0].text },
          { sectionId: 'reflection', text: REFLECT_DOCUMENT[1].text },
        ],
      })
    )(makeState());

    expect(section(result, 'reflection').text).toBe(REFLECT_DOCUMENT[1].text);
    expect(result.dedupeTrace!.find((t) => t.sectionId === 'reflection')!.source).toBe('unchanged');
  });

  it('keeps the original when the model omits or blanks a section (never deletes content)', async () => {
    const result = await createDedupeNode(
      makeDeps({
        sections: [
          { sectionId: 'learning', text: '' }, // blanked
          // reflection omitted entirely
        ],
      })
    )(makeState());

    expect(section(result, 'learning').text).toBe(REFLECT_DOCUMENT[0].text);
    expect(section(result, 'reflection').text).toBe(REFLECT_DOCUMENT[1].text);
    expect(result.dedupeTrace!.every((t) => t.source === 'fallback')).toBe(true);
  });

  it('keeps the reflect document unchanged when the LLM call throws', async () => {
    const result = await createDedupeNode(makeDeps(null, { throws: true }))(makeState());

    expect(result.composedDocument).toEqual(REFLECT_DOCUMENT);
    expect(result.dedupeTrace!.every((t) => t.source === 'fallback')).toBe(true);
  });

  it('no-ops on an empty document', async () => {
    const deps = makeDeps({ sections: [] });
    const result = await createDedupeNode(deps)(makeState([]));

    expect(result).toEqual({});
    expect(deps.llmService.invokeStructured).not.toHaveBeenCalled();
  });
});
