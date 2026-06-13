import { ReadinessTier } from '../portfolio-graph.state';

/* ------------------------------------------------------------------ */
/*  Shared grading vocabulary + verification for the capability nodes  */
/*                                                                     */
/*  tag_capabilities and elicit_justification both grade against the   */
/*  same ReadinessTier ladder and both verify evidence with the same   */
/*  verbatim gate. Keeping that logic here means the two nodes can      */
/*  never drift apart (different thresholds, different match rules).    */
/* ------------------------------------------------------------------ */

/** Tiers the capability nodes grade against, ordered weakest → strongest. */
export const CAPABILITY_TIERS = ['missing', 'shallow', 'adequate', 'strong'] as const;

/** Ordinal rank for ReadinessTier comparisons (`missing` = 0 … `strong` = 3). */
const TIER_RANK: Record<ReadinessTier, number> = {
  missing: 0,
  shallow: 1,
  adequate: 2,
  strong: 3,
};

/** True when `tier` is at least as strong as `min` (the gate threshold). */
export function tierAtLeast(tier: ReadinessTier | undefined, min: ReadinessTier): boolean {
  if (!tier) return false;
  return TIER_RANK[tier] >= TIER_RANK[min];
}

/** Sort comparator placing the strongest tier first (stable on equal tiers). */
export function byTierDescending(a: { tier: ReadinessTier }, b: { tier: ReadinessTier }): number {
  return TIER_RANK[b.tier] - TIER_RANK[a.tier];
}

/**
 * Project a tier onto the 0–1 `confidence` the generic select-option UI renders
 * as a percentage. The capability nodes grade in tiers; this keeps the existing
 * confirmation UI (shared with classification options) working without a
 * separate client change.
 */
const TIER_CONFIDENCE: Record<ReadinessTier, number> = {
  missing: 0,
  shallow: 0.4,
  adequate: 0.7,
  strong: 0.9,
};

export function tierToConfidence(tier: ReadinessTier): number {
  return TIER_CONFIDENCE[tier];
}

/**
 * Normalise text for substring matching: lowercase, collapse all whitespace
 * runs to a single space, and trim. Lets a verbatim quote survive trivial
 * reformatting (line breaks, double spaces, casing) without allowing the model
 * to pass off a paraphrase as a quote.
 */
export function normaliseForMatch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Verbatim-evidence gate: true only when `quote` is non-empty AND appears in
 * `transcript` after normalisation. No real quote → no defensible evidence.
 */
export function quoteAppearsIn(transcript: string, quote: string | undefined): boolean {
  const trimmed = quote?.trim() ?? '';
  if (!trimmed) return false;
  return normaliseForMatch(transcript).includes(normaliseForMatch(trimmed));
}

/* ------------------------------------------------------------------ */
/*  Shared prompt-block formatter                                      */
/* ------------------------------------------------------------------ */

/**
 * One capability rendered into the prompt. Every field beyond `code`/`name` is
 * optional so both nodes can reuse this: tag passes domain + description +
 * criteria (+ any config exemplars); elicit passes criteria + the evidence the
 * tag node already found, so it refines rather than re-derives.
 */
export interface CapabilityBlockEntry {
  code: string;
  name: string;
  domainName?: string | null;
  description?: string;
  criteria?: string;
  /** Optional per-capability calibration examples, injected only where authored. */
  exemplars?: string[];
  /** Evidence the upstream tag node already located, threaded into elicit. */
  foundQuote?: string;
  foundReasoning?: string;
}

/** Render capabilities into the `{capabilityBlock}` the prompts inject. */
export function formatCapabilityBlock(entries: CapabilityBlockEntry[]): string {
  return entries
    .map((e) => {
      const lines = [`### ${e.code} — ${e.name}`];
      if (e.domainName) lines.push(`Domain: ${e.domainName}`);
      if (e.description) lines.push(e.description);
      if (e.criteria) lines.push(`Descriptor criteria: ${e.criteria}`);
      if (e.exemplars?.length) {
        lines.push('Examples:');
        for (const ex of e.exemplars) lines.push(`- ${ex}`);
      }
      if (e.foundQuote) {
        lines.push(`Evidence already found: "${e.foundQuote}"`);
        if (e.foundReasoning) lines.push(`Why it was tagged: ${e.foundReasoning}`);
      }
      return lines.join('\n');
    })
    .join('\n\n');
}
