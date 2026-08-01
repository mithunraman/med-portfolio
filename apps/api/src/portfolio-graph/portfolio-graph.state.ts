import { type DraftStatus, type FollowupQuestion } from '@acme/shared';
import { Annotation } from '@langchain/langgraph';

/**
 * Capability tag extracted from the transcript.
 */
export interface CapabilityTag {
  code: string;
  name: string;
  /** First-person explanation, shown to the user when confirming capabilities. */
  reasoning: string;
  /**
   * Verbatim transcript span evidencing the capability. Guaranteed to be a
   * substring of the transcript — the tag node drops any capability whose quote
   * cannot be found. Persisted as the artefact's capability `evidence`.
   */
  quote: string;
  /**
   * How strongly the capability is demonstrated, graded against its descriptor
   * criteria on the shared ReadinessTier ladder. The tag node only keeps
   * capabilities at `adequate` or above, so a kept tag is never `missing`.
   */
  tier: ReadinessTier;
  /**
   * The trainee's own prose linking their actions to the capability's word
   * descriptor. Distinct from `reasoning` (AI-generated) and `quote`
   * (verbatim evidence). Empty until elicited from the transcript.
   */
  justification?: string;
  /**
   * How well the justification meets the descriptor criteria, on the same
   * ReadinessTier ladder. Drives the readiness card's `justified` flag
   * (`adequate`+ = justified). Undefined until elicited.
   */
  justificationTier?: ReadinessTier;
}

/** Readiness tier for a probe or section against the RCGP descriptors. */
export type ReadinessTier = 'missing' | 'shallow' | 'adequate' | 'strong';

/** The tier ladder's ordering — the single source of truth for tier comparisons. */
export const TIER_RANK: Record<ReadinessTier, number> = {
  missing: 0,
  shallow: 1,
  adequate: 2,
  strong: 3,
};

/**
 * Per-section elicitation attempt log. `count` is how many times the section has
 * been asked; `tierAtLastAsk` is its tier when last asked, so a later round can
 * tell whether re-asking is producing any improvement (see the exhaustion guard).
 */
export interface SectionAttempt {
  count: number;
  tierAtLastAsk: ReadinessTier;
}

/** Graded readiness of a single probe (Phase 1) or section roll-up (Phase 5). */
export interface ReadinessEntry {
  /** 0–1 score normalised from the depth tier and weight. */
  score: number;
  tier: ReadinessTier;
  /** Whether this unit meets its required threshold. */
  meetsThreshold: boolean;
}

/** Draft lifecycle status, surfaced to the client and gated at save (Phase 6). */
export type { DraftStatus };

/**
 * PDP goal action generated from the reflection.
 */
export interface PdpGoalAction {
  action: string;
  intendedEvidence: string;
}

/**
 * PDP goal generated from the reflection.
 */
export interface PdpGoal {
  goal: string;
  actions: PdpGoalAction[];
}

/**
 * Fallback follow-up round cap, used until `check_completeness` derives the
 * template-specific value (askable probes × ATTEMPT_LIMIT) into
 * `state.maxFollowupRounds`. Kept as the annotation default so the cap is never
 * `0`/`undefined` on any path — a zero cap would exit the loop immediately.
 */
export const DEFAULT_MAX_FOLLOWUP_ROUNDS = 8;

/**
 * The state that flows through the portfolio processing graph.
 *
 * Each node reads what it needs and returns a partial update.
 * Reducers define how updates are merged (last-write-wins unless specified).
 */
export const PortfolioState = Annotation.Root({
  // ── Identity (set once at graph start) ──
  conversationId: Annotation<string>,
  artefactId: Annotation<string>,
  userId: Annotation<string>,
  specialty: Annotation<string>,
  trainingStage: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),
  /**
   * The trainee's entry type, chosen at artefact creation and validated there, so
   * it arrives trusted and selects the template for the whole run.
   *
   * Seeded once at graph start and never written by any node — a run's entry type
   * cannot change under it.
   */
  entryType: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  // ── Accumulated content ──
  /** All cleaned user messages concatenated — the full transcript */
  fullTranscript: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  // ── Completeness ──
  /**
   * Whether the transcript is a portfolio entry at all — graded by
   * check_completeness alongside the section rubric. Drives the reject_entry
   * branch of completenessRouter, which only acts on it at round 0.
   *
   * Defaults to `true` (fail open): nothing may reject an entry except an
   * explicit verdict from a successful grading call.
   *
   * `check_completeness` is the ONLY writer, and it only ever writes `false` —
   * every other path leaves the channel alone and inherits the default. That is
   * what makes relying on the default safe, so a second writer (or a `true` write
   * that could mask a `false`) would invalidate the reasoning here.
   */
  isRelevant: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => true,
  }),
  missingSections: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  hasEnoughInfo: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),
  followUpRound: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),
  /**
   * Follow-up round cap for THIS run: askable probes × ATTEMPT_LIMIT. Derived by
   * check_completeness from the active template so the circuit breaker scales with
   * template size and never truncates elicitation before the coverage floor runs.
   * Defaults to DEFAULT_MAX_FOLLOWUP_ROUNDS until check_completeness first sets it.
   */
  maxFollowupRounds: Annotation<number>({
    reducer: (_, next) => next,
    default: () => DEFAULT_MAX_FOLLOWUP_ROUNDS,
  }),
  /** Questions generated by generate_followup, consumed by ask_followup. */
  pendingFollowupQuestions: Annotation<FollowupQuestion[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  /**
   * Running history of every follow-up question text asked across all rounds.
   * Appended (not replaced) each round so generate_followup can avoid re-asking.
   */
  askedFollowupQuestions: Annotation<string[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  /**
   * Per-section ask counter + tier-at-last-ask, keyed by section id. Populated by
   * generate_followup each round; read by the exhaustion guard so a section that is
   * re-asked without improving is retired rather than looped. Last-write-wins — the
   * node returns the fully-merged map.
   */
  sectionAttempts: Annotation<Record<string, SectionAttempt>>({
    reducer: (_, next) => next,
    default: () => ({}),
  }),
  /**
   * MOB-047 follow-up intro copy state. `followupTierFloor` is the highest tone tier
   * shown so far (monotonic — the intro never regresses if readiness dips between
   * rounds). `lastFollowupLineIdx` backs no-immediate-repeat line selection.
   * `pendingFollowupIntro` carries the line chosen by generate_followup to
   * ask_followup (parallels pendingFollowupQuestions).
   */
  followupTierFloor: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 1,
  }),
  lastFollowupLineIdx: Annotation<number>({
    reducer: (_, next) => next,
    default: () => -1,
  }),
  pendingFollowupIntro: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  // ── Readiness (Phase 1 grades probes; Phase 5 rolls up to sections) ──
  /** Per-probe graded readiness, keyed by probe id. */
  probeReadiness: Annotation<Record<string, ReadinessEntry>>({
    reducer: (_, next) => next,
    default: () => ({}),
  }),
  /**
   * Best (highest) tier each probe has ever reached — the monotonic ratchet.
   * check_completeness grades each probe against this floor so grader noise can
   * never re-open a section that has already cleared. Safe because the conversation
   * is append-only (content accumulates, it is never retracted).
   */
  bestTierByProbe: Annotation<Record<string, ReadinessTier>>({
    reducer: (_, next) => next,
    default: () => ({}),
  }),
  /** Per-output-section readiness roll-up, keyed by section id. */
  sectionReadiness: Annotation<Record<string, ReadinessEntry>>({
    reducer: (_, next) => next,
    default: () => ({}),
  }),
  /** Overall readiness score 0–10, shown on the Entry Card. */
  readinessScore: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),
  /** Draft lifecycle status, gated at save. */
  draftStatus: Annotation<DraftStatus>({
    reducer: (_, next) => next,
    default: () => 'in_progress',
  }),

  // ── Capabilities ──
  capabilities: Annotation<CapabilityTag[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // ── Reflection ──
  title: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  /**
   * The rendered document fields the trainee submits (e.g. the FourteenFish
   * "Brief description"), produced directly by the reflect node — one entry per
   * template section. This is the single source of truth for the entry body:
   * it is shown, edited, versioned, and exported. The granular probes are an
   * in-node intermediate and are not persisted.
   */
  composedDocument: Annotation<
    Array<{
      sectionId: string;
      label: string;
      text: string;
    }>
  >({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // ── PDP ──
  pdpGoals: Annotation<PdpGoal[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  /**
   * Debug/eval trace of the reflect step (per-section probe extraction, the
   * synthesised narrative, the verification verdict, and what shipped). Written
   * to the analysis-run record as immutable provenance — never persisted on the
   * artefact, never shown to the trainee.
   */
  reflectTrace: Annotation<ReflectTrace | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  /**
   * Debug/eval trace of the refine step (per-section before/after text, the
   * meaning-preservation verdict, and whether the merged or original text
   * shipped). Same provenance treatment as `reflectTrace`: written to the
   * analysis-run record, never persisted on the artefact or shown to the trainee.
   */
  refineTrace: Annotation<RefineTrace | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
});

/** Per-section trace emitted by the reflect node for debug/eval (see analysis-runs). */
export type ReflectTrace = Array<{
  sectionId: string;
  probes: Array<{ probeId: string; title: string; text: string; covered: boolean }>;
  narrative: string;
  verification: { ok: boolean; reason: string } | null;
  finalText: string;
  source: 'composed' | 'concat';
}>;

/** Per-section trace emitted by the refine node for debug/eval (see analysis-runs). */
export type RefineTrace = Array<{
  sectionId: string;
  label: string;
  before: string;
  after: string;
  /** merged = model text used; unchanged = model returned identical; fallback = model omitted/blanked or call failed. */
  source: 'merged' | 'unchanged' | 'fallback';
}>;

/** Inferred type of the graph state */
export type PortfolioStateType = typeof PortfolioState.State;
