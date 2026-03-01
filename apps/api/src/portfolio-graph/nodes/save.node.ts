import { ArtefactStatus } from '@acme/shared';
import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { GraphDeps } from '../graph-deps';
import { PortfolioStateType } from '../portfolio-graph.state';

/**
 * Saves the completed entry to the artefact.
 * Updates the artefact with all generated content and transitions status to REVIEW.
 */
export function createSaveNode(deps: GraphDeps) {
  const logger = new Logger('SaveNode');

  return async (state: PortfolioStateType): Promise<Partial<PortfolioStateType>> => {
    logger.log(`Saving entry for artefact ${state.artefactId}`);

    const result = await deps.artefactsRepository.updateArtefactById(
      new Types.ObjectId(state.artefactId),
      {
        artefactType: state.entryType,
        title: state.title,
        reflection: state.reflection,
        capabilities: state.capabilities.map((c) => ({
          code: c.code,
          evidence: c.evidence.join('; '),
        })),
        pdpActions: state.pdpActions.map((p) => ({
          action: p.action,
          timeframe: p.timeframe,
        })),
        status: ArtefactStatus.REVIEW,
      }
    );

    if (!result.ok) {
      logger.error(`Failed to save artefact ${state.artefactId}: ${result.error.message}`);
      return { error: `Failed to save artefact: ${result.error.message}` };
    }

    logger.log(`Artefact ${state.artefactId} saved successfully`);
    return {};
  };
}
