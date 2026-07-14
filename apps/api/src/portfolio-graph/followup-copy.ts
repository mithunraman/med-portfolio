/**
 * Follow-up round intro copy (MOB-047).
 *
 * The line the assistant prepends to each round of follow-up questions is a
 * function of how complete the entry already is (`readinessScore`) plus an honest
 * terminal signal — NOT the round counter. This replaces the old random two-bucket
 * copy that claimed "a few final questions" from round 2 onward.
 *
 * Pure module: no graph/DB coupling, so the tier logic is unit-testable and the
 * banks are editable by UX without touching code paths.
 */

/**
 * Tone tier for the intro line. 1 = just getting started, 4 = genuinely the last
 * round. Tiers 1–3 come from readiness; tier 4 comes ONLY from the terminal signal
 * so the copy can never claim finality before it is true.
 */
export type FollowupTier = 1 | 2 | 3 | 4;

/**
 * Readiness cut-points for tiers 1–3, spanning the [0, GOOD_ENOUGH_SCORE) range in
 * which follow-ups occur (the loop composes rather than asks once readiness clears
 * the good-enough bar, so tier 3 is open-ended at the top — no literal ceiling to
 * drift from GOOD_ENOUGH_SCORE).
 */
const TIER_CUTS = { developing: 3.0, refining: 5.5 } as const;

/**
 * Count-free, qualitative variants — acknowledge → purpose → advance. Finality
 * language ("final", "last", "home stretch") lives ONLY in tier 4. Edit the wording
 * here; the selection logic never hard-codes strings. Pending UX sign-off.
 */
export const FOLLOWUP_LINES: Record<FollowupTier, readonly string[]> = {
  // Tier 1 — Foundations: orient and encourage; we're building the picture.
  1: [
    "Thanks for that — let's build out your entry. A bit more on what happened would really help.",
    'Good start. To shape this into a strong reflection, tell me a little more about the situation.',
    "Appreciate you sharing that. Let's add some detail so your entry has a solid base.",
    'That gives me something to work with — more context will help your entry take shape.',
    "Let's flesh this out. I'd like to understand a bit more about your role and what happened.",
    'Good beginning — tell me more so we can build a full picture.',
    "Thanks. To get your entry off to a strong start, let's cover a bit more ground.",
  ],
  // Tier 2 — Developing: acknowledge momentum; deepen the core.
  2: [
    "This is taking shape nicely — let's deepen a few areas to make it stronger.",
    'Good progress; there is real substance here. A bit more detail will round it out.',
    "That adds a lot. Let's build on it and fill in where the entry is still light.",
    "You're building something solid — more detail will strengthen the key parts.",
    "The core is coming through. Let's develop a couple of areas further.",
    "That's helpful — let's keep going and add depth where it will count most.",
    'Good momentum. A little more on these points will make the reflection land.',
  ],
  // Tier 3 — Refining: signal we're close; polishing, not slog.
  3: [
    "This is coming together well — just rounding out a few areas now.",
    "A strong entry is taking shape. Let's polish the last details.",
    "You're nearly there — a bit more here and it will be well-rounded.",
    "Great depth so far. Let's refine what's left to finish it off well.",
    'This reads well already; a touch more on these points will tighten it up.',
    "The picture is nearly complete — let's fill the last gaps.",
    "Strong work. Let's sharpen what remains so your entry stands out.",
  ],
  // Tier 4 — Final: honest finality; only the genuinely-last round.
  4: [
    "Last few to wrap this up — then your entry's all set.",
    'Home stretch — a final couple of points and we are done.',
    "You've done the hard part. Just these last details to finish.",
    "Nearly finished — let's close this out with the final few.",
    'This is the last round; a little more and your entry is complete.',
    "Final stretch — let's tie everything together.",
    'Almost there — these last points will complete your entry.',
  ],
};

/** Safe fallback if a code path ever reaches the service without a selected line. */
export const DEFAULT_FOLLOWUP_LINE =
  'Thanks — a bit more detail will help strengthen your entry.';

/**
 * Resolve the tone tier for the round about to be asked.
 * - Terminal signal wins: the last permitted round always gets tier 4 ("final").
 * - Otherwise bucket `readinessScore` into tiers 1–3.
 * - Monotonic clamp: never regress below the highest tier already shown, so a
 *   readiness dip between rounds cannot walk the tone backwards.
 */
export function resolveFollowupTier(args: {
  readinessScore: number;
  askedRound: number;
  maxFollowupRounds: number;
  tierFloor: number;
}): FollowupTier {
  // Coerce degenerate inputs to safe defaults — a bad tier must never crash a run.
  const readinessScore = Number.isFinite(args.readinessScore) ? args.readinessScore : 0;
  const tierFloor = Number.isFinite(args.tierFloor) ? args.tierFloor : 1;

  // Honest finality: only the last permitted round is allowed to say "final".
  if (Number.isFinite(args.maxFollowupRounds) && args.askedRound >= args.maxFollowupRounds) {
    return 4;
  }

  const base: FollowupTier =
    readinessScore < TIER_CUTS.developing ? 1 : readinessScore < TIER_CUTS.refining ? 2 : 3;

  // Clamp to the floor but keep within 1–3 (tier 4 is terminal-only, handled above).
  return Math.min(3, Math.max(base, tierFloor)) as FollowupTier;
}

/**
 * Pick a line from the tier's bank, never repeating the immediately-previous line.
 * `rng` is injectable so the no-repeat property is deterministically testable.
 */
export function pickFollowupLine(
  tier: FollowupTier,
  lastIndex: number,
  rng: () => number = Math.random
): { line: string; index: number } {
  const bank = FOLLOWUP_LINES[tier] ?? FOLLOWUP_LINES[1];
  let index = Math.floor(rng() * bank.length);
  if (bank.length > 1 && index === lastIndex) {
    index = (index + 1) % bank.length;
  }
  return { line: bank[index], index };
}
