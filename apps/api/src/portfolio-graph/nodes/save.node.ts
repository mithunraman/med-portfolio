import { ArtefactStatus } from '@acme/shared';
import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { GraphDeps } from '../graph-deps';
import { PortfolioStateType } from '../portfolio-graph.state';

/**
 * Saves the completed entry to the artefact and creates PDP actions.
 * Both writes are wrapped in a transaction so they succeed or fail together.
 */
export function createSaveNode(deps: GraphDeps) {
  const logger = new Logger('SaveNode');

  return async (state: PortfolioStateType): Promise<Partial<PortfolioStateType>> => {
    logger.log(`Saving entry for artefact ${state.artefactId}`);

    const artefactObjectId = new Types.ObjectId(state.artefactId);
    const userObjectId = new Types.ObjectId(state.userId);

    try {
      await deps.transactionService.withTransaction(
        async (session) => {
          const artefactResult = await deps.artefactsRepository.updateArtefactById(
            artefactObjectId,
            {
              artefactType: state.entryType,
              title: state.title,
              reflection: state.reflection,
              capabilities: state.capabilities.map((c) => ({
                code: c.code,
                evidence: c.evidence.join('; '),
              })),
              status: ArtefactStatus.REVIEW,
            },
            session
          );

          if (!artefactResult.ok) throw new Error(artefactResult.error.message);

          if (state.pdpActions.length > 0) {
            const pdpResult = await deps.pdpActionsRepository.create(
              state.pdpActions.map((p) => ({
                userId: userObjectId,
                artefactId: artefactObjectId,
                action: p.action,
                timeframe: p.timeframe,
              })),
              session
            );

            if (!pdpResult.ok) throw new Error(pdpResult.error.message);
          }
        },
        { context: 'save-node' }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to save artefact ${state.artefactId}: ${message}`);
      return { error: `Failed to save artefact: ${message}` };
    }

    logger.log(`Artefact ${state.artefactId} saved successfully`);
    return {};
  };
}
