import { END, START, StateGraph } from '@langchain/langgraph';
import { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import { GraphDeps } from './graph-deps';
import {
  createAskFollowupNode,
  createCheckCompletenessNode,
  createRefineNode,
  createElicitJustificationNode,
  createGatherContextNode,
  createGenerateFollowupNode,
  createGeneratePdpNode,
  createPresentCapabilitiesNode,
  createReflectNode,
  createRejectEntryNode,
  createSaveNode,
  createTagCapabilitiesNode,
} from './nodes';
import { shouldContinueElicitation } from './elicitation.util';
import { PortfolioState, PortfolioStateType } from './portfolio-graph.state';

// ── Router functions ──

/**
 * After check_completeness: reject the entry, generate follow-up questions, or
 * proceed to tag capabilities.
 *
 * The relevance gate fires ONLY on the first pass (`followUpRound === 0`). The
 * grader re-assesses relevance every round, so enforcing it later would let one
 * noisy verdict terminate a journey the trainee has already invested rounds in.
 * A first-pass-only gate still catches what it is for — content that was never a
 * portfolio entry — because that verdict is available before any question is asked.
 */
export function completenessRouter(
  state: PortfolioStateType
): 'generate_followup' | 'tag_capabilities' | 'reject_entry' {
  if (!state.isRelevant && state.followUpRound === 0) return 'reject_entry';

  // The exit policy (rubric met, good-enough, exhausted, done, or round cap) lives in
  // shouldContinueElicitation so it is pure and unit-testable.
  return shouldContinueElicitation(state, state.maxFollowupRounds)
    ? 'generate_followup'
    : 'tag_capabilities';
}

/**
 * After present_capabilities: a run with no confirmed capabilities produces no
 * entry, so it ends rather than composing one.
 *
 * On the normal path this branch is not reached: the empty-capabilities case
 * interrupts with a TERMINAL message, and the API refuses to resume terminal
 * questions, so the run parks there. The edge exists so that the skip is enforced
 * by the topology rather than by an `if` in every downstream node — which is what
 * it replaced. Anything that did resume the run (a directly enqueued outbox job,
 * say) still cannot compose an entry with nothing to justify.
 */
export function capabilitiesRouter(state: PortfolioStateType): 'elicit_justification' | typeof END {
  return state.capabilities.length === 0 ? END : 'elicit_justification';
}

/**
 * Builds and compiles the portfolio processing graph.
 *
 * The entry type is chosen by the trainee at artefact creation and seeded into
 * state at start, so there is nothing to classify — the graph opens straight into
 * the elicitation loop.
 *
 * Graph structure:
 *
 *   START → gather_context → check_completeness ──┬─ (not a portfolio entry, round 0)
 *               ↑                                 │        → reject_entry (INTERRUPT) → END
 *               │                                 │
 *               │                                 ├─ (gaps remain) → generate_followup
 *               │                                 │                        ↓
 *               │                                 │                  ask_followup (INTERRUPT)
 *               └─────────────────────────────────┼────────────────────────┘
 *                                                 │
 *                                                 └─ (rubric met / exhausted) → tag_capabilities
 *                                                                                     ↓
 *                                                                       present_capabilities (INTERRUPT)
 *                                                                                     ↓
 *                          elicit_justification → reflect → refine → generate_pdp → save → END
 */
export function buildPortfolioGraph(checkpointer: BaseCheckpointSaver, deps: GraphDeps) {
  const graph = new StateGraph(PortfolioState)
    // ── Nodes ──
    .addNode('gather_context', createGatherContextNode(deps))
    .addNode('check_completeness', createCheckCompletenessNode(deps))
    .addNode('reject_entry', createRejectEntryNode(deps))
    .addNode('generate_followup', createGenerateFollowupNode(deps))
    .addNode('ask_followup', createAskFollowupNode(deps))
    .addNode('tag_capabilities', createTagCapabilitiesNode(deps))
    .addNode('present_capabilities', createPresentCapabilitiesNode(deps))
    .addNode('elicit_justification', createElicitJustificationNode(deps))
    .addNode('reflect', createReflectNode(deps))
    .addNode('refine', createRefineNode(deps))
    .addNode('generate_pdp', createGeneratePdpNode(deps))
    .addNode('save', createSaveNode(deps))

    // ── Edges ──

    // Entry point — gather the transcript, then assess it against the template.
    .addEdge(START, 'gather_context')
    .addEdge('gather_context', 'check_completeness')

    // Completeness routing (loop: generate questions → interrupt → loop back)
    .addConditionalEdges('check_completeness', completenessRouter, {
      generate_followup: 'generate_followup',
      tag_capabilities: 'tag_capabilities',
      reject_entry: 'reject_entry',
    })
    .addEdge('reject_entry', END)
    .addEdge('generate_followup', 'ask_followup')
    .addEdge('ask_followup', 'gather_context') // Loop back, re-gather + re-check completeness

    // Linear chain: tag → present → justify → reflect → refine → PDP → save → end
    .addEdge('tag_capabilities', 'present_capabilities')
    .addConditionalEdges('present_capabilities', capabilitiesRouter, {
      elicit_justification: 'elicit_justification',
      [END]: END,
    })
    .addEdge('elicit_justification', 'reflect')
    .addEdge('reflect', 'refine')
    .addEdge('refine', 'generate_pdp')
    .addEdge('generate_pdp', 'save')
    .addEdge('save', END);

  return graph.compile({ checkpointer });
}
