/**
 * G-1 — recall floors. **Committed before the first measurement exists.**
 *
 * That ordering is the point of this file. A threshold chosen after seeing the
 * result is not a threshold, it is a description of the result — and it is the
 * first thing a regulator looks for. These numbers were set on 2026-08-05, with
 * the corpus written and no run performed.
 *
 * ## Why floors are keyed by type AND mode
 *
 * A flat `POSTCODE: 100%` would be wrong in both directions. In typed prose a
 * postcode is caught by the deterministic backstop in `uk-pii-patterns.ts`, so
 * anything below 100% is a bug. Spoken as `"B A eleven seven X Q"` there is no
 * pattern to match and it depends entirely on Azure's NER — so a single floor
 * would either be dishonestly low for typed input or permanently red for voice.
 *
 * ## Which layer actually backs each type (verified in code, not assumed)
 *
 * The post-Azure backstop is the checksum-gated set only: NHS, CHI, NINO,
 * postcode, and sort code + account. `CONTACT_PATTERNS` — phone, email, free
 * text dates — runs on the **message edit path**, NOT on the send path. So
 * PHONE and EMAIL have no regex safety net here and are scored like PERSON,
 * however structured they look.
 *
 * ## Changing a floor
 *
 * Lowering one is a controller decision that belongs in the DPIA, not a tidy-up.
 * The correct response to a failing floor is to tighten redaction — the levers
 * are already in `RedactionPolicy` (`datePolicy: 'redact-all'`,
 * `keepPersonType: false`) — or to record an accepted risk with reasons.
 */
import { Mode } from './corpus.types';

export interface Floor {
  /** Minimum recall for typed input, 0–1. */
  text: number;
  /** Minimum recall for voice-originated input, 0–1. */
  voice: number;
}

/**
 * Any type not listed here. Deliberately strict: an unlisted type is one nobody
 * thought about, and the safe default for an unconsidered identifier is the
 * general-purpose bar, not a free pass.
 */
export const DEFAULT_FLOOR: Floor = { text: 0.95, voice: 0.85 };

export const RECALL_FLOORS: Record<string, Floor> = {
  // ── Checksum-gated, deterministic backstop on the send path ───────────────
  // Typed: a miss is a pattern bug, not model variance. Nothing below 100%.
  // Voice: spoken digit-by-digit, no pattern can match — Azure NER only.
  NHS_NUMBER: { text: 1.0, voice: 0.8 },
  CHI_NUMBER: { text: 1.0, voice: 0.8 },
  NI_NUMBER: { text: 1.0, voice: 0.8 },
  POSTCODE: { text: 1.0, voice: 0.8 },
  BANK_ACCOUNT: { text: 1.0, voice: 0.8 },

  // ── Look structured, but are Azure-only on the send path ──────────────────
  // See the CONTACT_PATTERNS note above. Do not raise these expecting regex.
  PHONE: { text: 0.95, voice: 0.85 },
  EMAIL: { text: 0.95, voice: 0.85 },
  HOSPITAL_NUMBER: { text: 0.95, voice: 0.85 },
  VEHICLE: { text: 0.95, voice: 0.85 },
  URL: { text: 0.95, voice: 0.85 },

  // ── Semantic, Azure NER only ──────────────────────────────────────────────
  // The dominant identifier class in the corpus and the one that carries R-1.
  PERSON: { text: 0.95, voice: 0.85 },
  ORGANISATION: { text: 0.95, voice: 0.85 },
  LOCATION: { text: 0.95, voice: 0.85 },
  ADDRESS: { text: 0.95, voice: 0.85 },

  // ── Carve-out classes: partly policy, not only detection ──────────────────
  // DATE keeps non-anchored dates by design, so a miss here is as likely to be
  // the policy working as the model failing. Read the detail, not the number.
  DATE: { text: 0.9, voice: 0.8 },

  // AGE is scored ONLY at 90 and above.
  //
  // Ages under 90 are **deliberately retained** — a controller decision taken
  // 2026-08-05, reaffirming the behaviour `shouldRedactEntity` has always had.
  // An age is not an identifier on its own, and stripping it costs real clinical
  // meaning: "a 4-year-old with a limp" and "an 82-year-old with falls" are
  // different consultations, and a reflection that cannot say which is worth
  // much less. The corpus therefore lists sub-90 ages under `mustSurvive`, where
  // over-redacting one is reported as a product defect rather than a pass.
  //
  // 90+ still redacts, aggregating to "90 or older" per HIPAA Safe Harbor —
  // above that threshold the population is small enough that the age itself
  // starts to identify. That is the only age case this floor governs.
  //
  // Note what this does NOT dispose of: a retained age still contributes to
  // *quasi*-identification when combined with a locality and a presentation.
  // That risk is measured by the threads in Part B, not by this row.
  AGE: { text: 0.95, voice: 0.85 },
};

export function floorFor(type: string, mode: Mode): number {
  const floor = RECALL_FLOORS[type.toUpperCase()] ?? DEFAULT_FLOOR;
  return mode === 'voice' ? floor.voice : floor.text;
}

/**
 * A knowingly accepted gap between a floor and what the pipeline achieves.
 *
 * **This is not the same as lowering a floor, and the difference is the point.**
 * A lowered floor hides a decision inside a number nobody re-reads. A waiver
 * keeps the floor where it is, states why the gap is tolerable, records who
 * accepted it and when, and prints in every future report until it is removed.
 *
 * `acceptedRecall` is the value **measured at acceptance**, so a waiver freezes a
 * known position rather than blanket-waiving the bucket. If recall degrades
 * beyond tolerance the run fails again — which is exactly the regression a
 * blanket waiver would swallow.
 */
export interface AcceptedResidual {
  /** Recall measured when this was accepted. Degradation past tolerance re-fails. */
  acceptedRecall: number;
  /** Why this is tolerable. Not why it is convenient. */
  reason: string;
  /** ISO date of the controller decision. */
  acceptedOn: string;
}

/**
 * Keyed exactly as the scorer buckets: `"<TYPE> <mode>"`.
 *
 * Every entry here is a controller decision and should have a matching DEC entry
 * in `todo.md`. An accepted residual with no recorded reasoning reads later as an
 * oversight, which is the failure mode this whole file exists to avoid.
 */
export const ACCEPTED_RESIDUALS: Record<string, AcceptedResidual> = {
  'LOCATION text': {
    acceptedRecall: 1 / 3,
    acceptedOn: '2026-08-05',
    reason:
      'Small UK place names are a documented weakness of the Azure PII model rather than a defect ' +
      'in this implementation — independent benchmarking of Azure Cognitive Services over real-world ' +
      'text including medical notes reports aggregate recall of 57–73%, with named-entity classes ' +
      'among the weakest. No configuration lever exists: `shouldRedactEntity` redacts every Location ' +
      'it is given, so these are detection failures, not policy. The realistic remedies (a UK place-name ' +
      'gazetteer, a second NER pass) are disproportionate for a pre-launch MVP with no users, and a ' +
      'gazetteer would over-redact common words that are also places (Bath, Reading, Wells). Mitigated ' +
      'instead by recording-time guidance (M-1.7) and by the closed Art 28 disclosure environment, ' +
      'which is what the ICO motivated-intruder test is actually assessed against.',
  },
  'LOCATION voice': {
    acceptedRecall: 0,
    acceptedOn: '2026-08-05',
    reason:
      'Same root cause as LOCATION text, on a single planted identifier. n=1 supports no rate at all; ' +
      'it is recorded rather than reasoned from. Re-measure if the LOCATION corpus is ever expanded.',
  },
  'ORGANISATION text': {
    acceptedRecall: 7 / 8,
    acceptedOn: '2026-08-05',
    reason:
      'One miss in eight: a named care home. Matches the same benchmark, which reports Azure at 0.573 ' +
      'precision on Hospital entities specifically. Other organisations in the corpus — practices, ' +
      'trusts, schools, employers — were caught, so the failure is narrow rather than systemic. ' +
      'Accepted at the measured level; a second miss re-fails the run.',
  },
};

export function acceptedResidualFor(type: string, mode: Mode): AcceptedResidual | undefined {
  return ACCEPTED_RESIDUALS[`${type.toUpperCase()} ${mode}`];
}

/**
 * Does a waived bucket still hold the position it was accepted at?
 *
 * Tolerance is **one identifier's worth of recall** (`1 / planted`), which
 * self-scales with the sample: a bucket of 8 tolerates one further miss, a bucket
 * of 32 tolerates one further miss. A fixed percentage would be meaningless
 * across denominators this different, and exact equality would make the gate
 * hostage to ordinary LLM nondeterminism.
 */
export function holdsAcceptedLevel(
  residual: AcceptedResidual,
  recall: number,
  planted: number
): boolean {
  return recall >= residual.acceptedRecall - 1 / planted;
}
