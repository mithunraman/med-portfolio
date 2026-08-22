import type { CapabilityOption } from '@acme/shared';
import { interrupt } from '@langchain/langgraph';
import { Logger } from '@nestjs/common';
import { GraphDeps, emitStepStarted } from '../graph-deps';
import { ThinkingStep } from '../thinking-step.enum';
import { PortfolioStateType } from '../portfolio-graph.state';
import { tierToConfidence } from './capability-grading.util';

const logger = new Logger('PresentCapabilitiesNode');

/**
 * Cap on confirmed capabilities, matching the tagger's MAX_CAPABILITIES (5) so
 * every option the user is offered can actually be saved. RCGP entries are
 * typically mapped to ≤3 capabilities, but the user makes that final selection
 * later when uploading to their portfolio website — we don't truncate here.
 */
const MAX_CONFIRMED_CAPABILITIES = 5;

interface CapabilitiesResumeValue {
  selectedCodes: string[];
}

/**
 * Factory that creates the present_capabilities node with injected dependencies.
 *
 * Presents the LLM-tagged capabilities to the user for confirmation.
 * The user can select/deselect from the suggestions (multi-select).
 * The interrupt payload carries the options, so the node is replay-safe by design.
 *
 * On resume, validates the user's selections against the options
 * that were presented. Invalid codes are silently dropped.
 * If nothing valid remains, falls back to the full LLM suggestion.
 *
 * The empty-capabilities branch interrupts with a terminal message and stops
 * there; `capabilitiesRouter` routes it to END rather than into the compose chain.
 */
export function createPresentCapabilitiesNode(deps: GraphDeps) {
  return async function presentCapabilitiesNode(
    state: PortfolioStateType
  ): Promise<Partial<PortfolioStateType>> {
    const cid = state.conversationId;
    emitStepStarted(deps, state, ThinkingStep.PRESENT_CAPABILITIES);
    logger.log(`[${cid}] Presenting capabilities`);

    // ── Empty capabilities: interrupt with empty options for terminal message ──
    if (state.capabilities.length === 0) {
      logger.warn(`[${cid}] No capabilities — interrupting with empty options`);
      interrupt({ type: 'capabilities', options: [], entryType: state.entryType });
      // Terminal: the API refuses to resume terminal questions, so the run parks
      // at the interrupt above. If something did resume it, `capabilitiesRouter`
      // sends it to END — there is nothing to justify or compose.
      return {};
    }

    // Build options from the tagged capabilities (already sorted by tier). The
    // tier is projected onto the option's `confidence` for the percentage UI.
    const options: CapabilityOption[] = state.capabilities.map((cap) => ({
      code: cap.code,
      name: cap.name,
      confidence: tierToConfidence(cap.tier),
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
    const selectedCodes =
      resumeValue?.selectedCodes?.filter((code) => presentedCodes.has(code)) ?? [];

    if (selectedCodes.length > 0) {
      const selectedSet = new Set(selectedCodes);
      // Keep the tier-ranked order from state.capabilities; the cap (5) matches
      // the number of options offered, so all valid selections are retained.
      const filteredCapabilities = state.capabilities
        .filter((cap) => selectedSet.has(cap.code))
        .slice(0, MAX_CONFIRMED_CAPABILITIES);

      logger.log(
        `[${cid}] User confirmed ${filteredCapabilities.length} capabilities ` +
          `(of ${selectedCodes.length} selected): ${filteredCapabilities.map((c) => c.code).join(', ')}`
      );

      return { capabilities: filteredCapabilities };
    }

    // No valid selections — keep all LLM suggestions
    logger.warn(`[${cid}] No valid capability selections — keeping all LLM suggestions`);
    return {};
  };
}
