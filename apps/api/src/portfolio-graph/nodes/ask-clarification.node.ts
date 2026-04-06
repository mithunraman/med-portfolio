import { interrupt } from '@langchain/langgraph';
import { Logger } from '@nestjs/common';
import { ANALYSIS_STEP_STARTED, GraphDeps } from '../graph-deps';
import { PortfolioStateType } from '../portfolio-graph.state';

const logger = new Logger('AskClarificationNode');

/**
 * Factory that creates the ask_clarification node with injected dependencies.
 *
 * Interrupt-only node — no LLM call.
 *
 * Fires when classify returns confidence below CONFIDENCE_THRESHOLD.
 * Pauses the graph so the service layer can write an ASSISTANT message
 * asking the user to provide more clinical detail. On resume, increments
 * clarificationRound and loops back to gather_context → classify.
 *
 * Separated from classify so the LLM call is checkpointed before the
 * interrupt — on resume, only this node replays (no LLM re-invocation).
 */
export function createAskClarificationNode(deps: GraphDeps) {
  return async function askClarificationNode(
    state: PortfolioStateType
  ): Promise<Partial<PortfolioStateType>> {
    const cid = state.conversationId;
    deps.eventEmitter.emit(ANALYSIS_STEP_STARTED, {
      conversationId: cid,
      step: 'ask_clarification',
    });
    logger.log(
      `[${cid}] Asking for clarification ` +
        `(round ${state.clarificationRound + 1}, confidence: ${state.classificationConfidence})`
    );

    interrupt({
      type: 'clarification',
      confidence: state.classificationConfidence,
      reasoning: state.classificationReasoning,
      suggestedEntryType: state.entryType,
      clarificationRound: state.clarificationRound,
    });

    return { clarificationRound: state.clarificationRound + 1 };
  };
}
