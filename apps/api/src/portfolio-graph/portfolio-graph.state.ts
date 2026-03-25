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
 * Assessment of how thoroughly a section is covered by the transcript.
 */
export interface SectionAssessment {
  covered: boolean;
  depth: 'rich' | 'adequate' | 'shallow';
}

/**
 * Section coverage result from completeness check.
 * Key = section ID, value = coverage assessment with depth.
 */
export type SectionCoverage = Record<string, SectionAssessment>;

/**
 * Capability tag extracted from the transcript.
 */
export interface CapabilityTag {
  code: string;
  name: string;
  reasoning: string;
  confidence: number;
}

/**
 * Capability annotation linking a capability to a section with evidence.
 */
export interface CapabilityAnnotation {
  sectionId: string;
  capabilityCode: string;
  evidence: string;
}

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
  trainingStage: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

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
  title: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  reflection: Annotation<Array<{
    sectionId: string;
    title: string;
    text: string;
    covered: boolean;
  }> | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  capabilityAnnotations: Annotation<CapabilityAnnotation[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // ── PDP ──
  pdpGoals: Annotation<PdpGoal[]>({
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
