import { Logger } from '@nestjs/common';
import { PortfolioStateType } from '../portfolio-graph.state';

const logger = new Logger('CheckCompletenessNode');

/**
 * Given the classified entry type, loads the corresponding template and checks
 * whether the transcript contains enough information for each required section.
 *
 * Returns section coverage map and list of missing sections.
 */
export async function checkCompletenessNode(
  state: PortfolioStateType
): Promise<Partial<PortfolioStateType>> {
  logger.log(
    `Checking completeness for conversation ${state.conversationId} (type: ${state.entryType})`
  );

  // TODO: Load template for the entry type via SpecialtyConfig
  // TODO: Build completeness prompt with required sections
  // TODO: Call LLM to assess which sections have sufficient evidence
  // TODO: Return sectionCoverage map and missingSections list

  return {
    sectionCoverage: state.sectionCoverage,
    missingSections: state.missingSections,
    hasEnoughInfo: state.hasEnoughInfo,
  };
}
