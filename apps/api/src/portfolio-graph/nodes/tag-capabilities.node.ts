import { Logger } from '@nestjs/common';
import { PortfolioStateType } from '../portfolio-graph.state';

const logger = new Logger('TagCapabilitiesNode');

/**
 * Maps the transcript to RCGP capabilities with evidence quotes.
 * Uses the full capability framework from SpecialtyConfig.
 * Entry type biases which capabilities are most likely relevant.
 */
export async function tagCapabilitiesNode(
  state: PortfolioStateType,
): Promise<Partial<PortfolioStateType>> {
  logger.log(`Tagging capabilities for conversation ${state.conversationId}`);

  // TODO: Build capability tagging prompt with all capabilities from SpecialtyConfig
  // TODO: Include entry type to bias selection
  // TODO: Call LLM to extract 1-3 capabilities with evidence quotes
  // TODO: Parse and validate against known capability codes

  return {
    capabilities: state.capabilities,
  };
}
