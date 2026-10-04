import { Logger } from '@nestjs/common';
import { GraphDeps, emitStepStarted } from '../graph-deps';
import { ThinkingStep } from '../thinking-step.enum';
import { DraftStatus, PortfolioStateType } from '../portfolio-graph.state';
import { normaliseTypography } from './typography.util';

type OutputTextFields = Pick<
  PortfolioStateType,
  'title' | 'composedDocument' | 'capabilities' | 'pdpGoals'
>;

/**
 * Normalise AI-typical typography (em dashes, curly quotes, invisible
 * characters…) in every model-written field the artefact persists.
 *
 * The field list is explicit on purpose: `capabilities[].quote` is verbatim
 * transcript evidence and must stay byte-identical; `reasoning` is never
 * persisted; section `label`s come from template config, not the model.
 * `refineTrace` keeps the raw model output for debugging and evals, so its
 * `after` text will legitimately differ from the saved section.
 */
function normaliseOutputText(state: PortfolioStateType): OutputTextFields {
  return {
    title: state.title && normaliseTypography(state.title),
    composedDocument: (state.composedDocument ?? []).map((s) => ({
      ...s,
      text: normaliseTypography(s.text),
    })),
    capabilities: state.capabilities.map((c) => ({
      ...c,
      justification: c.justification && normaliseTypography(c.justification),
    })),
    pdpGoals: state.pdpGoals.map((g) => ({
      goal: normaliseTypography(g.goal),
      actions: g.actions.map((a) => ({
        action: normaliseTypography(a.action),
        intendedEvidence: normaliseTypography(a.intendedEvidence),
      })),
    })),
  };
}

/**
 * Validation and output-normalisation gate before graph completion.
 *
 * Asserts all required fields are present in graph state, then returns the
 * model-written text fields with AI-typical typography normalised — here, at
 * the single node every completed run passes through, so the checkpointed final
 * state and the persisted artefact are identical. No DB writes — the handler
 * performs all saves in a single transaction after graph.invoke() returns
 * (Phase 3/4).
 *
 * Graph topology: `generate_pdp → save → END`
 */
export function createSaveNode(deps: GraphDeps) {
  const logger = new Logger('SaveNode');

  return async (state: PortfolioStateType): Promise<Partial<PortfolioStateType>> => {
    emitStepStarted(deps, state, ThinkingStep.SAVE);

    const cid = state.conversationId;

    // ── Normal path: validate all required fields are present ──
    if (!state.title) throw new Error(`[${cid}] Cannot save: title is not set`);
    if (!state.composedDocument || state.composedDocument.length === 0) {
      throw new Error(`[${cid}] Cannot save: entry body (composedDocument) is not set`);
    }
    if (state.capabilities.length === 0) throw new Error(`[${cid}] Cannot save: no capabilities`);

    // ── Readiness gate (Phase 6): never finalise silently as "complete" ──
    // An entry is 'ready' only when the rubric cleared; if gaps remain it is
    // saved as 'needs_attention' so the residual gaps stay visible rather than
    // implying the entry is done.
    const draftStatus: DraftStatus = state.hasEnoughInfo ? 'ready' : 'needs_attention';

    logger.log(
      `[${cid}] Validation passed for artefact ${state.artefactId} ` +
        `(readiness ${state.readinessScore}/10, status=${draftStatus})`
    );
    return { draftStatus, ...normaliseOutputText(state) };
  };
}
