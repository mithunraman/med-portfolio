/**
 * Fabrication tripwire for synthesised section text.
 *
 * When a section carries a `composePrompt`, the reflect node asks the model to
 * combine that section's probes into one narrative. This verifies the narrative
 * is grounded in the probes before it is shown to the trainee; on failure the
 * caller falls back to a deterministic concat of the probe text (today's safe
 * output), so the worst case is choppier prose, never fabricated content.
 *
 * It is a token-level check, deliberately scoped:
 *  - HARD-FAIL on any novel number — a number absent from the probes is almost
 *    always fabricated (a dose, age, value) and clinically high-stakes; numbers
 *    rarely appear via legitimate paraphrase, so the false-positive rate is low.
 *  - FAIL on a high novel-content-word ratio — legitimate compression adds
 *    connectives and synonyms, so a generous threshold flags only wholesale
 *    ungrounded text, not ordinary rephrasing.
 *
 * What it CANNOT catch: a fabricated implication built from words that all
 * appear in the probes (e.g. "…the shadow, which confirmed malignancy"). That
 * is the anti-synthesis prompt rules' job, not this function's.
 */

/** Novel-content-word ratio above which the narrative is treated as ungrounded. */
export const NOVEL_WORD_RATIO_THRESHOLD = 0.4;

/** Spelled-out numbers normalised to digits so "six weeks" ≡ "6 weeks". */
const NUMBER_WORDS: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6',
  seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12',
  thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17',
  eighteen: '18', nineteen: '19', twenty: '20', thirty: '30', forty: '40',
  fifty: '50', sixty: '60', seventy: '70', eighty: '80', ninety: '90',
};

// Short function words that legitimate prose adds freely; excluded from the
// content-word novelty check. Length ≥ 4 already filters most stopwords, so this
// only needs the common long-ish connectives.
const STOPWORDS = new Set([
  'this', 'that', 'then', 'than', 'with', 'which', 'when', 'were', 'they',
  'them', 'their', 'there', 'have', 'from', 'into', 'after', 'before', 'while',
  'because', 'would', 'could', 'should', 'about', 'also', 'been', 'being',
]);

export interface ComposeVerdict {
  ok: boolean;
  /** Empty when ok; otherwise a short, log-friendly reason. */
  reason: string;
}

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9.\s]/g, ' ')
    .split(/\s+/)
    .map((tok) => NUMBER_WORDS[tok] ?? tok)
    .join(' ');
}

/** Numeric tokens (integers/decimals) in normalised text. */
function numbers(normalised: string): string[] {
  return normalised.match(/\b\d+(?:\.\d+)?\b/g) ?? [];
}

/** Content words: alphabetic tokens length ≥ 4, excluding stopwords. */
function contentWords(normalised: string): string[] {
  return (normalised.match(/\b[a-z]{4,}\b/g) ?? []).filter((w) => !STOPWORDS.has(w));
}

/**
 * Verify a synthesised `narrative` against the union of its section's probe text.
 */
export function verifyComposed(narrative: string, probeUnion: string): ComposeVerdict {
  const probeNorm = normalise(probeUnion);
  const probeNumbers = new Set(numbers(probeNorm));
  const probeWords = new Set(contentWords(probeNorm));

  const narrativeNorm = normalise(narrative);

  const novelNumber = numbers(narrativeNorm).find((n) => !probeNumbers.has(n));
  if (novelNumber) {
    return { ok: false, reason: `novel number "${novelNumber}" not in probes` };
  }

  const narrativeWords = contentWords(narrativeNorm);
  if (narrativeWords.length === 0) return { ok: true, reason: '' };

  const novel = narrativeWords.filter((w) => !probeWords.has(w));
  const ratio = novel.length / narrativeWords.length;
  if (ratio > NOVEL_WORD_RATIO_THRESHOLD) {
    return {
      ok: false,
      reason:
        `novel-word ratio ${ratio.toFixed(2)} > ${NOVEL_WORD_RATIO_THRESHOLD} ` +
        `(e.g. ${novel.slice(0, 5).join(', ')})`,
    };
  }

  return { ok: true, reason: '' };
}
