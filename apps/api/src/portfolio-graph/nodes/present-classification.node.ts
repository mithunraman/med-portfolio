import { type ClassificationOption, Specialty } from '@acme/shared';
import { interrupt } from '@langchain/langgraph';
import { Logger } from '@nestjs/common';
import { getSpecialtyConfig } from '../../specialties/specialty.registry';
import { PortfolioStateType } from '../portfolio-graph.state';

const logger = new Logger('PresentClassificationNode');

interface ClassificationResumeValue {
  entryType: string;
}

/**
 * Pure graph node — no side effects.
 *
 * Builds classification options from the LLM's suggestion + alternatives,
 * then pauses the graph via interrupt(). The interrupt payload carries the
 * options so the service layer can present them to the user (e.g. write an
 * ASSISTANT message). This keeps the node replay-safe by design.
 *
 * On resume, validates the user's chosen entry type against the specialty config.
 * Invalid selections fall back to the LLM's original suggestion.
 */
export async function presentClassificationNode(
  state: PortfolioStateType,
): Promise<Partial<PortfolioStateType>> {
  logger.log(`Presenting classification for conversation ${state.conversationId}`);

  const specialty = Number(state.specialty) as Specialty;
  const config = getSpecialtyConfig(specialty);
  const validCodes = new Set(config.entryTypes.map((et) => et.code));

  // Build options from primary suggestion + alternatives
  const options: ClassificationOption[] = [];

  if (state.entryType) {
    const entryDef = config.entryTypes.find((et) => et.code === state.entryType);
    options.push({
      code: state.entryType,
      label: entryDef?.label ?? state.entryType,
      confidence: state.classificationConfidence,
      reasoning: state.classificationReasoning,
    });
  }

  for (const alt of state.alternatives) {
    if (alt.entryType === state.entryType) continue; // skip duplicate

    const entryDef = config.entryTypes.find((et) => et.code === alt.entryType);
    options.push({
      code: alt.entryType,
      label: entryDef?.label ?? alt.entryType,
      confidence: alt.confidence,
      reasoning: alt.reasoning,
    });
  }

  // Pause the graph — the interrupt payload is read by PortfolioGraphService
  // to write the ASSISTANT message. Returns the resume value on second execution.
  const resumeValue = interrupt({
    type: 'classification',
    options,
    suggestedEntryType: state.entryType,
    reasoning: state.classificationReasoning,
  }) as ClassificationResumeValue;

  // ── Validate resume value ──
  const selectedType = resumeValue?.entryType;

  if (selectedType && validCodes.has(selectedType)) {
    logger.log(`User confirmed entry type: ${selectedType}`);
    return {
      entryType: selectedType,
      classificationConfidence: 1.0,
      classificationSource: 'USER_CONFIRMED',
    };
  }

  // Invalid or missing selection — keep LLM's suggestion
  logger.warn(
    `Invalid resume value (entryType: ${selectedType}), keeping LLM suggestion: ${state.entryType}`,
  );
  return {
    classificationSource: 'USER_CONFIRMED',
  };
}
