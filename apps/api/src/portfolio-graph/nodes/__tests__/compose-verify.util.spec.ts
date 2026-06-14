import { verifyComposed } from '../compose-verify.util';

/**
 * The verifier is the fabrication tripwire for synthesised section text: it
 * passes faithful compressions/paraphrases and rejects ungrounded content
 * (novel numbers, or wholesale new wording).
 */
describe('verifyComposed', () => {
  const probes =
    'I saw a 72-year-old woman with a six-week dry cough. She takes ramipril. ' +
    'I stopped the ramipril and arranged a chest X-ray. The X-ray showed a right upper lobe shadow.';

  it('passes a faithful compression that only reorders and adds connectives', () => {
    const narrative =
      'I saw a 72-year-old woman taking ramipril with a six-week dry cough, so I stopped ' +
      'the ramipril and arranged a chest X-ray, which showed a right upper lobe shadow.';
    expect(verifyComposed(narrative, probes).ok).toBe(true);
  });

  it('passes when spelled-out and digit numbers are equivalent ("six" ≡ "6")', () => {
    expect(verifyComposed('A 6-week cough in a 72-year-old woman.', probes).ok).toBe(true);
  });

  it('hard-fails on a novel number (fabricated value)', () => {
    const verdict = verifyComposed('I saw a 78-year-old woman with a cough.', probes);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/novel number/);
  });

  it('fails when the narrative is mostly ungrounded content words', () => {
    const verdict = verifyComposed(
      'I prescribed amoxicillin for a chest infection and referred urgently to cardiology.',
      probes
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/novel-word ratio/);
  });

  it('passes an empty narrative (nothing to fabricate)', () => {
    expect(verifyComposed('', probes).ok).toBe(true);
  });
});
