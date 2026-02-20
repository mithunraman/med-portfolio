import { Logger } from '@nestjs/common';
import { interrupt } from '@langchain/langgraph';
import { PortfolioStateType } from '../portfolio-graph.state';

const logger = new Logger('PresentDraftNode');

/**
 * Presents the complete draft entry to the user for review.
 * Sends the formatted entry as an ASSISTANT message and pauses.
 *
 * The interrupt payload contains the full draft so the caller
 * can display it in the UI. The resume value indicates whether
 * the user approved or requested changes.
 */
export async function presentDraftNode(
  state: PortfolioStateType,
): Promise<Partial<PortfolioStateType>> {
  logger.log(`Presenting draft for conversation ${state.conversationId}`);

  // TODO: Format the complete entry (type, reflection, capabilities, PDP)
  // TODO: Send as ASSISTANT message in the conversation

  const userResponse = interrupt({
    type: 'review',
    draft: {
      entryType: state.entryType,
      reflection: state.reflection,
      capabilities: state.capabilities,
      pdpActions: state.pdpActions,
      qualityScore: state.qualityResult?.score,
    },
  });

  return {
    userApproved: userResponse === true || userResponse?.approved === true,
  };
}
