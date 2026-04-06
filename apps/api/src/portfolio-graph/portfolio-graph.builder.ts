import { END, START, StateGraph } from '@langchain/langgraph';
import { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import { GraphDeps } from './graph-deps';
import {
  createAskClarificationNode,
  createAskFollowupNode,
  createCheckCompletenessNode,
  createClassifyNode,
  createGatherContextNode,
  createGenerateFollowupNode,
  createGeneratePdpNode,
  createPresentCapabilitiesNode,
  createPresentClassificationNode,
  createReflectNode,
  createSaveNode,
  createTagCapabilitiesNode,
} from './nodes';
import { PortfolioState, PortfolioStateType } from './portfolio-graph.state';

// ── Max loop limits ──
export const MAX_FOLLOWUP_ROUNDS = 3;
export const CONFIDENCE_THRESHOLD = 0.7;
export const MAX_CLARIFICATION_ROUNDS = 2;

// ── Router functions ──

/**
 * After gather_context: if the user has already confirmed the entry type,
 * skip classification and go straight to completeness check.
 * Otherwise (first run or clarification loop), proceed to classify.
 */
export function gatherContextRouter(state: PortfolioStateType): 'classify' | 'check_completeness' {
  return state.classificationConfirmed ? 'check_completeness' : 'classify';
}

/**
 * After classify: route based on relevance and confidence.
 *
 * - Irrelevant content → ask_clarification (up to MAX_CLARIFICATION_ROUNDS)
 * - Low confidence      → ask_clarification (up to MAX_CLARIFICATION_ROUNDS)
 * - Otherwise           → present_classification
 *
 * Both irrelevant and low-confidence share the same round counter.
 * After MAX_CLARIFICATION_ROUNDS, falls through to present_classification.
 */
export function classifyRouter(
  state: PortfolioStateType
): 'present_classification' | 'ask_clarification' {
  const canAskMore = state.clarificationRound < MAX_CLARIFICATION_ROUNDS;

  // Irrelevant content always routes to clarification if rounds remain
  if (!state.isRelevant && canAskMore) return 'ask_clarification';

  const lowConfidence = state.classificationConfidence < CONFIDENCE_THRESHOLD;
  if (lowConfidence && canAskMore) return 'ask_clarification';

  return 'present_classification';
}

/**
 * After check_completeness: proceed to tag capabilities or generate follow-up questions.
 */
function completenessRouter(state: PortfolioStateType): 'generate_followup' | 'tag_capabilities' {
  if (!state.hasEnoughInfo && state.followUpRound < MAX_FOLLOWUP_ROUNDS) {
    return 'generate_followup';
  }
  return 'tag_capabilities';
}

/**
 * Builds and compiles the portfolio processing graph.
 *
 * Graph structure:
 *
 *   START → gather_context ──┬── (classificationConfirmed) ──────────────────────→ check_completeness
 *               ↑            │                                                              ↓
 *               │            └── (first run) ──→ classify → classifyRouter ──┐  ┌── completenessRouter ──┐
 *               │                                                             │  ↓                        ↓
 *               │                                            (confidence OK) ─┴→ present_classification  generate_followup
 *               │                                                                    (INTERRUPT)              ↓
 *               │                                            (low confidence) ──→ ask_clarification    ask_followup (INTERRUPT)
 *               │                                                                    (INTERRUPT)              │
 *               ├───────────────────────────────────────────────────────────────────────┘                    │
 *               └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 *   present_classification (INTERRUPT) → check_completeness → ... → tag_capabilities
 *                                                                          ↓
 *                                                               present_capabilities (INTERRUPT)
 *                                                                          ↓
 *                                                                       reflect → generate_pdp → save → END
 */
export function buildPortfolioGraph(checkpointer: BaseCheckpointSaver, deps: GraphDeps) {
  const graph = new StateGraph(PortfolioState)
    // ── Nodes ──
    .addNode('gather_context', createGatherContextNode(deps))
    .addNode('classify', createClassifyNode(deps))
    .addNode('ask_clarification', createAskClarificationNode(deps))
    .addNode('present_classification', createPresentClassificationNode(deps))
    .addNode('check_completeness', createCheckCompletenessNode(deps))
    .addNode('generate_followup', createGenerateFollowupNode(deps))
    .addNode('ask_followup', createAskFollowupNode(deps))
    .addNode('tag_capabilities', createTagCapabilitiesNode(deps))
    .addNode('present_capabilities', createPresentCapabilitiesNode(deps))
    .addNode('reflect', createReflectNode(deps))
    .addNode('generate_pdp', createGeneratePdpNode(deps))
    .addNode('save', createSaveNode(deps))

    // ── Edges ──

    // Entry point
    .addEdge(START, 'gather_context')

    // After gathering context: classify on first run, skip to completeness if type confirmed
    .addConditionalEdges('gather_context', gatherContextRouter, {
      classify: 'classify',
      check_completeness: 'check_completeness',
    })

    // Classification → route based on confidence
    .addConditionalEdges('classify', classifyRouter, {
      present_classification: 'present_classification',
      ask_clarification: 'ask_clarification',
    })
    .addEdge('ask_clarification', 'gather_context')
    .addEdge('present_classification', 'check_completeness')

    // Completeness routing (loop: generate questions → interrupt → loop back)
    .addConditionalEdges('check_completeness', completenessRouter, {
      generate_followup: 'generate_followup',
      tag_capabilities: 'tag_capabilities',
    })
    .addEdge('generate_followup', 'ask_followup')
    .addEdge('ask_followup', 'gather_context') // Loop back, re-gather + re-check completeness

    // Linear chain: tag → present capabilities → reflect → PDP → save → end
    .addEdge('tag_capabilities', 'present_capabilities')
    .addEdge('present_capabilities', 'reflect')
    .addEdge('reflect', 'generate_pdp')
    .addEdge('generate_pdp', 'save')
    .addEdge('save', END);

  return graph.compile({ checkpointer });
}
