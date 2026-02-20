import { Logger } from '@nestjs/common';
import { interrupt } from '@langchain/langgraph';
import { PortfolioStateType } from '../portfolio-graph.state';

const logger = new Logger('AskFollowupNode');

/**
 * Generates template-driven follow-up questions for missing sections.
 * Uses extractionQuestion from the template, optionally contextualised by LLM.
 *
 * Pauses the graph via interrupt() — resumes when the user sends their next message.
 */
export async function askFollowupNode(
  state: PortfolioStateType,
): Promise<Partial<PortfolioStateType>> {
  logger.log(
    `Asking follow-up for conversation ${state.conversationId} (round ${state.followUpRound + 1}, missing: ${state.missingSections.join(', ')})`,
  );

  // TODO: Load template for the entry type
  // TODO: Get extractionQuestion for each missing section
  // TODO: Optionally contextualise questions via LLM (make them specific to the transcript)
  // TODO: Send as ASSISTANT message in the conversation

  interrupt({
    type: 'followup',
    reason: 'Missing information for template sections',
    missingSections: state.missingSections,
    entryType: state.entryType,
  });

  return {
    followUpRound: state.followUpRound + 1,
  };
}
