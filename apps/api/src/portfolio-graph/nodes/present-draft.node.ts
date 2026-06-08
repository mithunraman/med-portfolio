import { interrupt } from '@langchain/langgraph';
import { Logger } from '@nestjs/common';
import { ANALYSIS_STEP_STARTED, GraphDeps } from '../graph-deps';
import { PortfolioStateType } from '../portfolio-graph.state';

const logger = new Logger('PresentDraftNode');

interface DraftResumeValue {
  confirmed: boolean;
}

/**
 * Factory that creates the present_draft node.
 *
 * The final sign-off gate (Phase 6): pauses the graph to show the trainee the
 * assembled document and the suggested PDP goals before anything is saved, so
 * nothing finalises silently. The trainee either submits (rubric decides
 * ready vs needs_attention) or saves as a draft (forces needs_attention).
 *
 * Replay-safe by design — the interrupt payload carries the document + PDP so
 * the service can write the ASSISTANT message; the resume value is read on the
 * second execution.
 */
export function createPresentDraftNode(deps: GraphDeps) {
  return async function presentDraftNode(
    state: PortfolioStateType
  ): Promise<Partial<PortfolioStateType>> {
    const cid = state.conversationId;
    deps.eventEmitter.emit(ANALYSIS_STEP_STARTED, { conversationId: cid, step: 'present_draft' });

    // ── Guard: irrelevant content path — nothing to sign off ──
    if (!state.entryType) {
      return {};
    }

    const resume = interrupt({
      type: 'draft',
      document: state.composedDocument,
      pdpGoals: state.pdpGoals,
      readinessScore: state.readinessScore,
      draftStatus: state.hasEnoughInfo && !state.userStopped ? 'ready' : 'needs_attention',
    }) as DraftResumeValue | undefined;

    // "Save as draft" (confirmed === false) keeps the entry as needs_attention
    // by flowing through the save gate via userStopped.
    if (resume?.confirmed === false) {
      logger.log(`[${cid}] Trainee chose to save as draft`);
      return { userStopped: true };
    }

    logger.log(`[${cid}] Trainee submitted the entry`);
    return {};
  };
}
