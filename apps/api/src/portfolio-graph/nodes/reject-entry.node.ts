import { interrupt } from '@langchain/langgraph';
import { Logger } from '@nestjs/common';
import { ANALYSIS_STEP_STARTED, GraphDeps } from '../graph-deps';
import { PortfolioStateType } from '../portfolio-graph.state';

const logger = new Logger('RejectEntryNode');

/**
 * Factory that creates the reject_entry node with injected dependencies.
 *
 * Interrupt-only node — no LLM call.
 *
 * Terminal branch for a transcript `check_completeness` graded as not a portfolio
 * entry (off-topic content, or a detected prompt-injection attempt). Pauses so the
 * service layer can write a terminal ASSISTANT message, then runs to END.
 *
 * The interrupt is never resumed: terminal questions are rejected at the API layer
 * (`conversations.service.handleResume`), so the run finishes here and the trainee
 * starts a new conversation. The edge to END exists so the graph has no dangling
 * node, not because a resume path is expected.
 *
 * Only reachable at follow-up round 0 — see `completenessRouter`.
 */
export function createRejectEntryNode(deps: GraphDeps) {
  return async function rejectEntryNode(
    state: PortfolioStateType
  ): Promise<Partial<PortfolioStateType>> {
    const cid = state.conversationId;
    deps.eventEmitter.emit(ANALYSIS_STEP_STARTED, {
      conversationId: cid,
      step: 'reject_entry',
    });
    logger.warn(`[${cid}] Rejecting entry — transcript is not a portfolio entry`);

    interrupt({ type: 'rejected' });

    return {};
  };
}
