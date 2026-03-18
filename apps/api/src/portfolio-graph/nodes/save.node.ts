import { ArtefactStatus } from '@acme/shared';
import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { ANALYSIS_STEP_STARTED, GraphDeps } from '../graph-deps';
import { PortfolioStateType } from '../portfolio-graph.state';

/**
 * Saves the completed entry to the artefact and creates PDP goals.
 * Both writes are wrapped in a transaction so they succeed or fail together.
 *
 * Errors are NOT caught — they propagate through graph.invoke() so the
 * handler can transition the run to FAILED and the outbox can retry.
 */
export function createSaveNode(deps: GraphDeps) {
  const logger = new Logger('SaveNode');

  return async (state: PortfolioStateType): Promise<Partial<PortfolioStateType>> => {
    deps.eventEmitter.emit(ANALYSIS_STEP_STARTED, { conversationId: state.conversationId, step: 'save' });
    logger.log(`Saving entry for artefact ${state.artefactId}`);

    const artefactObjectId = new Types.ObjectId(state.artefactId);
    const userObjectId = new Types.ObjectId(state.userId);

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
              evidence: c.reasoning,
            })),
            status: ArtefactStatus.IN_REVIEW,
          },
          session
        );

        if (!artefactResult.ok) throw new Error(artefactResult.error.message);

        if (state.pdpGoals.length > 0) {
          // Delete-then-create for idempotency: if LangGraph replays this node
          // (e.g. checkpoint write failed after transaction committed), re-running
          // produces the same result instead of duplicating goals.
          const deleteResult =
            await deps.pdpGoalsRepository.deleteByArtefactId(artefactObjectId, session);
          if (!deleteResult.ok) throw new Error(deleteResult.error.message);

          const pdpResult = await deps.pdpGoalsRepository.create(
            state.pdpGoals.map((g) => ({
              userId: userObjectId,
              artefactId: artefactObjectId,
              goal: g.goal,
              actions: g.actions.map((a) => ({
                action: a.action,
                intendedEvidence: a.intendedEvidence,
              })),
            })),
            session
          );

          if (!pdpResult.ok) throw new Error(pdpResult.error.message);
        }
      },
      { context: 'save-node' }
    );

    logger.log(`Artefact ${state.artefactId} saved successfully`);
    return {};
  };
}
