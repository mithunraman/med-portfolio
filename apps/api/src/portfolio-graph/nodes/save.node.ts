import { Logger } from '@nestjs/common';
import { ANALYSIS_STEP_STARTED, GraphDeps } from '../graph-deps';
import { DraftStatus, PortfolioStateType } from '../portfolio-graph.state';

/**
 * Validation gate before graph completion.
 *
 * Asserts all required fields are present in graph state before the graph
 * reaches END. No DB writes — the handler performs all saves in a single
 * transaction after graph.invoke() returns (Phase 3/4).
 *
 * Graph topology: `generate_pdp → save → END`
 */
export function createSaveNode(deps: GraphDeps) {
  const logger = new Logger('SaveNode');

  return async (state: PortfolioStateType): Promise<Partial<PortfolioStateType>> => {
    deps.eventEmitter.emit(ANALYSIS_STEP_STARTED, {
      conversationId: state.conversationId,
      step: 'save',
    });

    const cid = state.conversationId;

    // ── Irrelevant content path: graph completes without artefact output ──
    if (!state.entryType) {
      logger.warn(
        `[${cid}] No entry type — graph completing without artefact (content was not relevant)`
      );
      return {};
    }

    // ── Normal path: validate all required fields are present ──
    if (!state.title) throw new Error(`[${cid}] Cannot save: title is not set`);
    if (!state.reflection) throw new Error(`[${cid}] Cannot save: reflection is not set`);
    if (state.capabilities.length === 0) throw new Error(`[${cid}] Cannot save: no capabilities`);

    // ── Readiness gate (Phase 6): never finalise silently as "complete" ──
    // An entry is 'ready' only when the rubric cleared; if the trainee stopped
    // early or gaps remain, it is saved as 'needs_attention' so the residual
    // gaps stay visible rather than implying the entry is done.
    const draftStatus: DraftStatus =
      state.hasEnoughInfo && !state.userStopped ? 'ready' : 'needs_attention';

    logger.log(
      `[${cid}] Validation passed for artefact ${state.artefactId} ` +
        `(readiness ${state.readinessScore}/10, status=${draftStatus})`
    );
    return { draftStatus };
  };
}
