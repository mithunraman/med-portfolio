import type { CapabilityOption } from '@acme/shared';
import { interrupt } from '@langchain/langgraph';
import { Logger } from '@nestjs/common';
import { ANALYSIS_STEP_STARTED, GraphDeps } from '../graph-deps';
import { PortfolioStateType } from '../portfolio-graph.state';

const logger = new Logger('PresentCapabilitiesNode');

interface CapabilitiesResumeValue {
  selectedCodes: string[];
}

/**
 * Factory that creates the present_capabilities node with injected dependencies.
 *
 * Presents the LLM-tagged capabilities to the user for confirmation.
 * The user can select/deselect from the suggestions (multi-select).
 * This keeps the node replay-safe by design — identical to the
 * present_classification pattern.
 *
 * On resume, validates the user's selections against the options
 * that were presented. Invalid codes are silently dropped.
 * If nothing valid remains, falls back to the full LLM suggestion.
 */
export function createPresentCapabilitiesNode(deps: GraphDeps) {
  return async function presentCapabilitiesNode(
    state: PortfolioStateType
  ): Promise<Partial<PortfolioStateType>> {
    const cid = state.conversationId;
    deps.eventEmitter.emit(ANALYSIS_STEP_STARTED, { conversationId: cid, step: 'present_capabilities' });
    logger.log(`[${cid}] Presenting capabilities`);

    // ── Guard: no entry type (irrelevant content path) — skip entirely ──
    if (!state.entryType) {
      logger.warn(`[${cid}] No entry type — skipping capability presentation`);
      return {};
    }

    // ── Empty capabilities: interrupt with empty options for terminal message ──
    if (state.capabilities.length === 0) {
      logger.warn(`[${cid}] No capabilities — interrupting with empty options`);
      interrupt({ type: 'capabilities', options: [], entryType: state.entryType });
      // After resume: clear entryType so downstream nodes skip gracefully
      return { entryType: null };
    }

  // Build options from the LLM-tagged capabilities (already sorted by confidence)
  const options: CapabilityOption[] = state.capabilities.map((cap) => ({
    code: cap.code,
    name: cap.name,
    confidence: cap.confidence,
    reasoning: cap.reasoning,
  }));

  // Pause the graph — the interrupt payload is read by PortfolioGraphService
  // to write the ASSISTANT message. Returns the resume value on second execution.
  const resumeValue = interrupt({
    type: 'capabilities',
    options,
    entryType: state.entryType,
  }) as CapabilitiesResumeValue;

  // ── Validate resume value ──
  const presentedCodes = new Set(options.map((o) => o.code));
  const selectedCodes = resumeValue?.selectedCodes?.filter((code) => presentedCodes.has(code)) ?? [];

  if (selectedCodes.length > 0) {
    const selectedSet = new Set(selectedCodes);
    const filteredCapabilities = state.capabilities.filter((cap) => selectedSet.has(cap.code));

    logger.log(
      `[${cid}] User confirmed ${filteredCapabilities.length} capabilities: ${selectedCodes.join(', ')}`
    );

    return { capabilities: filteredCapabilities };
  }

  // No valid selections — keep all LLM suggestions
  logger.warn(`[${cid}] No valid capability selections — keeping all LLM suggestions`);
  return {};
  };
}
