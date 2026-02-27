import { Annotation } from '@langchain/langgraph';

/**
 * Classification alternative returned by the classify node.
 */
export interface ClassificationAlternative {
  entryType: string;
  confidence: number;
  reasoning: string;
}

/**
 * Section coverage result from completeness check.
 * Key = section ID, value = whether the transcript covers it.
 */
export type SectionCoverage = Record<string, boolean>;

/**
 * Capability tag extracted from the transcript.
 */
export interface CapabilityTag {
  code: string;
  name: string;
  evidence: string[];
  confidence: number;
}

/**
 * PDP action generated from the reflection.
 */
export interface PdpAction {
  action: string;
  timeframe: string;
}

/**
 * The state that flows through the portfolio processing graph.
 *
 * Each node reads what it needs and returns a partial update.
 * Reducers define how updates are merged (last-write-wins unless specified).
 */
export const PortfolioState = Annotation.Root({
  // ── Identity (set once at graph start, never updated) ──
  conversationId: Annotation<string>,
  artefactId: Annotation<string>,
  userId: Annotation<string>,
  specialty: Annotation<string>,

  // ── Accumulated content ──
  /** All cleaned user messages concatenated — the full transcript */
  fullTranscript: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),
  /** Count of user messages in the conversation */
  messageCount: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),

  // ── Classification ──
  entryType: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  classificationConfidence: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),
  classificationReasoning: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),
  classificationSignals: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  alternatives: Annotation<ClassificationAlternative[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  /** Whether the entry type was confirmed by the user or only suggested by the LLM */
  classificationSource: Annotation<'LLM' | 'USER_CONFIRMED' | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // ── Completeness ──
  sectionCoverage: Annotation<SectionCoverage>({
    reducer: (_, next) => next,
    default: () => ({}),
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

  // ── Capabilities ──
  capabilities: Annotation<CapabilityTag[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // ── Reflection ──
  reflection: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // ── PDP ──
  pdpActions: Annotation<PdpAction[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // ── Error tracking ──
  error: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
});

/** Inferred type of the graph state */
export type PortfolioStateType = typeof PortfolioState.State;
