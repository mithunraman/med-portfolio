/**
 * G-1 de-identification measurement — corpus types.
 *
 * These mirror `docs/compliance/measurements/corpus/*.yaml`, which is the ground
 * truth for the C-6 launch gate (DPIA §6.3, measure M-A). The corpus states what
 * was planted in each message, which is what makes a false-negative rate
 * computable at all.
 *
 * Nothing in this directory is production code — it is a measurement harness
 * that lives under `src/` because both jest configs set `rootDir: 'src'`.
 */

/** How the message reached the pipeline. Recall differs materially between the two. */
export type Mode = 'text' | 'voice';

/**
 * An identifier deliberately planted in a corpus message.
 *
 * `value` is normally the MINIMAL identifying core — `Patel`, not `Mrs Patel`.
 * Scoring the smallest identifying token closes a hole: if the key were
 * `Mrs Patel` and the redactor emitted `[PERSON] Patel`, a check for the full
 * string would find nothing and score a real leak as a pass.
 *
 * The exception is an **eponym collision** — `Mr Parkinson` in a message that
 * also says `Parkinson's`. There the minimal core is present in the text for a
 * legitimate reason, so it can never score as caught. Those keys carry the
 * honorific to make them distinguishable, and the corpus README records why.
 */
export interface PlantedIdentifier {
  /** Identifier class, e.g. `PERSON`, `NHS_NUMBER`. Drives the match mode. */
  type: string;
  /** The exact string planted in `text`. Verified present by the loader. */
  value: string;
  /**
   * Other surface forms of the **same** identifier, any of which counts as a leak.
   *
   * Needed because the pipeline can *transform* an identifier before persisting
   * it. The 2026-08-05 run found the cleaning stage rewriting a spoken NHS
   * number — `nine nine nine one three one…` — into digits, downstream of both
   * redaction layers. The spoken key no longer matched, so the scorer reported a
   * pass over an identifier that had merely changed shape.
   *
   * Unlike `value`, aliases are **not** required to occur in the source text —
   * a transformation target does not exist until the pipeline creates it.
   *
   * Strictly for alternate renderings of one identifier. Adding near-misses or
   * related strings here turns the leak count into whatever the author wanted.
   */
  aliases?: string[];
}

/**
 * Every surface form that counts as this identifier surviving.
 *
 * The single definition of "all the ways this could appear", so the loader's
 * validation and the scorer's leak check can never disagree about it.
 */
export function identifierForms(planted: PlantedIdentifier): string[] {
  return [planted.value, ...(planted.aliases ?? [])];
}

/** One standalone corpus message — the unit at which redaction actually runs. */
export interface CorpusMessage {
  id: string;
  mode: Mode;
  /** What this case probes. Documentation only; never scored. */
  intent: string;
  /** Gates C-6 — any survivor in the pipeline output is a false negative. */
  mustRedact: PlantedIdentifier[];
  /** Over-redaction watch — reported, never gated. See `scoreMessage`. */
  mustSurvive: string[];
  text: string;
}

/** A turn within a thread. Threads carry no per-message answer key. */
export interface ThreadMessage {
  mode: Mode;
  text: string;
}

/**
 * A multi-message conversation, used to probe quasi-identifier accumulation.
 *
 * Redaction runs per message; exposure is per conversation, because the graph
 * stitches every message into `state.fullTranscript` before the LLM sees it. A
 * thread can therefore be fully redacted message by message and still identify
 * someone — which no automated detector can surface, so threads are scored by a
 * human answering `identifiabilityQuestion`.
 */
export interface CorpusThread {
  id: string;
  title: string;
  /** Why this thread identifies someone. Printed alongside the output. */
  accumulationMechanism: string;
  /** The question a human answers after reading the redacted thread. */
  identifiabilityQuestion: string;
  /** Any conventional identifiers present, scored as for a message. */
  mustRedact: PlantedIdentifier[];
  messages: ThreadMessage[];
}
