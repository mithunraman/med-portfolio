import { END, START, StateGraph } from '@langchain/langgraph';
import { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import { GraphDeps } from './graph-deps';
import {
  askFollowupNode,
  checkCompletenessNode,
  createClassifyNode,
  createGatherContextNode,
  createPresentClassificationNode,
  generatePdpNode,
  presentDraftNode,
  qualityCheckNode,
  reflectNode,
  repairNode,
  saveNode,
  tagCapabilitiesNode,
} from './nodes';
import { PortfolioState, PortfolioStateType } from './portfolio-graph.state';

// ── Max loop limits ──
const MAX_FOLLOWUP_ROUNDS = 2;
const MAX_REPAIR_ROUNDS = 1;

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
 * After quality_check: present draft if passed, or repair if failed.
 */
function qualityRouter(state: PortfolioStateType): 'present_draft' | 'repair' {
  if (state.qualityResult?.passed || state.repairRound >= MAX_REPAIR_ROUNDS) {
    return 'present_draft';
  }
  return 'repair';
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
 *               └───────────────────────────────────┘                      reflect
 *                  (loop back, skip classification)                          ↓
 *                                                                      generate_pdp
 *                                                                            ↓
 *                                                                     quality_check
 *                                                                            ↓
 *                                                                  ┌── qualityRouter ──┐
 *                                                                  ↓                    ↓
 *                                                             present_draft           repair
 *                                                                  ↓                    ↓
 *                                                                save           quality_check
 *                                                                  ↓              (loop back)
 *                                                                 END
 */
export function buildPortfolioGraph(checkpointer: BaseCheckpointSaver, deps: GraphDeps) {
  const graph = new StateGraph(PortfolioState)
    // ── Nodes (factories receive deps, stubs are plain functions) ──
    .addNode('gather_context', createGatherContextNode(deps))
    .addNode('classify', createClassifyNode(deps))
    .addNode('present_classification', createPresentClassificationNode(deps))
    .addNode('check_completeness', checkCompletenessNode)
    .addNode('ask_followup', askFollowupNode)
    .addNode('tag_capabilities', tagCapabilitiesNode)
    .addNode('reflect', reflectNode)
    .addNode('generate_pdp', generatePdpNode)
    .addNode('quality_check', qualityCheckNode)
    .addNode('repair', repairNode)
    .addNode('present_draft', presentDraftNode)
    .addNode('save', saveNode)

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

    // Linear chain: tag → reflect → PDP → quality check
    .addEdge('tag_capabilities', 'reflect')
    .addEdge('reflect', 'generate_pdp')
    .addEdge('generate_pdp', 'quality_check')

    // Quality routing (loop 2: repair)
    .addConditionalEdges('quality_check', qualityRouter, {
      present_draft: 'present_draft',
      repair: 'repair',
    })
    .addEdge('repair', 'quality_check') // Loop back after repair

    // Final: present → save → end
    .addEdge('present_draft', 'save')
    .addEdge('save', END);

  return graph.compile({ checkpointer });
}
