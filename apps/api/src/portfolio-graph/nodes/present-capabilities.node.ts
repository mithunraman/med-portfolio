import { interrupt } from '@langchain/langgraph';
import { Logger } from '@nestjs/common';
import { PortfolioStateType } from '../portfolio-graph.state';

const logger = new Logger('PresentCapabilitiesNode');

export interface CapabilityOption {
  code: string;
  name: string;
  confidence: number;
  evidence: string[];
}

interface CapabilitiesResumeValue {
  selectedCodes: string[];
}

/**
 * Pure graph node — no side effects.
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
export async function presentCapabilitiesNode(
  state: PortfolioStateType
): Promise<Partial<PortfolioStateType>> {
  logger.log(`Presenting capabilities for conversation ${state.conversationId}`);

  // Build options from the LLM-tagged capabilities (already sorted by confidence)
  const options: CapabilityOption[] = state.capabilities.map((cap) => ({
    code: cap.code,
    name: cap.name,
    confidence: cap.confidence,
    evidence: cap.evidence,
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
      `User confirmed ${filteredCapabilities.length} capabilities: ${selectedCodes.join(', ')}`
    );

    return { capabilities: filteredCapabilities };
  }

  // No valid selections — keep all LLM suggestions
  logger.warn('No valid capability selections — keeping all LLM suggestions');
  return {};
}
