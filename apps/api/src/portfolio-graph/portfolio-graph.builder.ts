import { END, START, StateGraph } from '@langchain/langgraph';
import { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import { GraphDeps } from './graph-deps';
import {
  createAskFollowupNode,
  createCheckCompletenessNode,
  createClassifyNode,
  createGatherContextNode,
  createGeneratePdpNode,
  createReflectNode,
  createSaveNode,
  createTagCapabilitiesNode,
  presentCapabilitiesNode,
  presentClassificationNode,
} from './nodes';
import { PortfolioState, PortfolioStateType } from './portfolio-graph.state';

// ── Max loop limits ──
const MAX_FOLLOWUP_ROUNDS = 2;

// ── Router functions ──

/**
 * After gather_context: if the user has already confirmed the entry type,
 * skip classification and go straight to completeness check.
 * Otherwise (first run), proceed to classify.
 */
function gatherContextRouter(state: PortfolioStateType): 'classify' | 'check_completeness' {
  return state.classificationSource === 'USER_CONFIRMED' ? 'check_completeness' : 'classify';
}

/**
 * After check_completeness: proceed to tag capabilities or ask follow-up questions.
 */
function completenessRouter(state: PortfolioStateType): 'ask_followup' | 'tag_capabilities' {
  if (!state.hasEnoughInfo && state.followUpRound < MAX_FOLLOWUP_ROUNDS) {
    return 'ask_followup';
  }
  return 'tag_capabilities';
}

/**
 * Builds and compiles the portfolio processing graph.
 *
 * Graph structure:
 *
 *   START → gather_context ──┬── (first run) ──→ classify → present_classification (INTERRUPT)
 *               ↑            │                                       ↓
 *               │            └── (type confirmed) ──→ check_completeness
 *               │                                              ↓
 *               │                                   ┌── completenessRouter ──┐
 *               │                                   ↓                        ↓
 *               │                              ask_followup          tag_capabilities
 *               │                                   ↓                        ↓
 *               └───────────────────────────────────┘              present_capabilities (INTERRUPT)
 *                  (loop back, skip classification)                          ↓
 *                                                                        reflect
 *                                                                            ↓
 *                                                                      generate_pdp
 *                                                                            ↓
 *                                                                          save
 *                                                                            ↓
 *                                                                           END
 */
export function buildPortfolioGraph(checkpointer: BaseCheckpointSaver, deps: GraphDeps) {
  const graph = new StateGraph(PortfolioState)
    // ── Nodes ──
    .addNode('gather_context', createGatherContextNode(deps))
    .addNode('classify', createClassifyNode(deps))
    .addNode('present_classification', presentClassificationNode)
    .addNode('check_completeness', createCheckCompletenessNode(deps))
    .addNode('ask_followup', createAskFollowupNode(deps))
    .addNode('tag_capabilities', createTagCapabilitiesNode(deps))
    .addNode('present_capabilities', presentCapabilitiesNode)
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

    // Classification → always present to user for confirmation
    .addEdge('classify', 'present_classification')
    .addEdge('present_classification', 'check_completeness')

    // Completeness routing (loop 1: follow-up)
    .addConditionalEdges('check_completeness', completenessRouter, {
      ask_followup: 'ask_followup',
      tag_capabilities: 'tag_capabilities',
    })
    .addEdge('ask_followup', 'gather_context') // Loop back, re-gather + re-check completeness

    // Linear chain: tag → present capabilities → reflect → PDP → save → end
    .addEdge('tag_capabilities', 'present_capabilities')
    .addEdge('present_capabilities', 'reflect')
    .addEdge('reflect', 'generate_pdp')
    .addEdge('generate_pdp', 'save')
    .addEdge('save', END);

  return graph.compile({ checkpointer });
}
