import { Logger } from '@nestjs/common';
import { PortfolioStateType } from '../portfolio-graph.state';

const logger = new Logger('SaveNode');

/**
 * Saves the completed entry to the artefact.
 * Updates the artefact with all generated content and marks it as complete.
 */
export async function saveNode(
  state: PortfolioStateType,
): Promise<Partial<PortfolioStateType>> {
  logger.log(`Saving entry for conversation ${state.conversationId}`);

  // TODO: Update artefact with:
  //   - artefactType
  //   - classificationConfidence
  //   - classificationSource: 'AUTO'
  //   - classificationAlternatives
  //   - reflection
  //   - capabilities
  //   - pdpActions
  //   - status: ArtefactStatus.COMPLETE
  // TODO: Send confirmation ASSISTANT message

  return {};
}
