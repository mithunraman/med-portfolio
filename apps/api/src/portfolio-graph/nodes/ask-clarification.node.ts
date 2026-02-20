import { Logger } from '@nestjs/common';
import { interrupt } from '@langchain/langgraph';
import { PortfolioStateType } from '../portfolio-graph.state';

const logger = new Logger('AskClarificationNode');

/**
 * Generates broad, type-agnostic questions when classification confidence is low.
 * These questions help determine WHAT KIND of entry this is (not what's missing for a template).
 *
 * Pauses the graph via interrupt() — resumes when the user sends their next message.
 */
export async function askClarificationNode(
  state: PortfolioStateType,
): Promise<Partial<PortfolioStateType>> {
  logger.log(
    `Asking clarification for conversation ${state.conversationId} (round ${state.clarificationRound + 1})`,
  );

  // TODO: Generate context-aware clarification questions via LLM
  // TODO: Send as ASSISTANT message in the conversation

  interrupt({
    type: 'clarification',
    reason: 'Classification confidence too low',
    entryType: state.entryType,
    confidence: state.classificationConfidence,
  });

  return {
    clarificationRound: state.clarificationRound + 1,
  };
}
