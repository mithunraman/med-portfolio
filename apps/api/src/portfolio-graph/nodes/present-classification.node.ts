import { type ClassificationOption, Specialty } from '@acme/shared';
import { interrupt } from '@langchain/langgraph';
import { Logger } from '@nestjs/common';
import { getSpecialtyConfig } from '../../specialties/specialty.registry';
import { ANALYSIS_STEP_STARTED, GraphDeps } from '../graph-deps';
import { PortfolioStateType } from '../portfolio-graph.state';

const logger = new Logger('PresentClassificationNode');

interface ClassificationResumeValue {
  entryType: string;
}

/**
 * Factory that creates the present_classification node with injected dependencies.
 *
 * Builds classification options from the LLM's suggestion + alternatives,
 * then pauses the graph via interrupt(). The interrupt payload carries the
 * options so the service layer can present them to the user (e.g. write an
 * ASSISTANT message). This keeps the node replay-safe by design.
 *
 * On resume, validates the user's chosen entry type against the specialty config.
 * Invalid selections fall back to the LLM's original suggestion.
 */
export function createPresentClassificationNode(deps: GraphDeps) {
  return async function presentClassificationNode(
    state: PortfolioStateType
  ): Promise<Partial<PortfolioStateType>> {
    const cid = state.conversationId;
    deps.eventEmitter.emit(ANALYSIS_STEP_STARTED, {
      conversationId: cid,
      step: 'present_classification',
    });
    logger.log(`[${cid}] Presenting classification`);

    // ── Guard: irrelevant content with no entry type after max clarification rounds ──
    if (!state.isRelevant && !state.entryType) {
      logger.warn(`[${cid}] Content not relevant — presenting terminal classification`);

      interrupt({
        type: 'classification',
        options: [],
        suggestedEntryType: null,
        reasoning: 'The content provided does not appear to be related to medical training.',
      });

      // Even if resumed, there's nothing valid to select — proceed with null entryType
      return { classificationConfirmed: true };
    }

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
      logger.log(`[${cid}] User confirmed entry type: ${selectedType}`);
      return {
        entryType: selectedType,
        classificationConfidence: 1.0,
        classificationConfirmed: true,
      };
    }

    // Invalid or missing selection — keep LLM's suggestion
    logger.warn(
      `[${cid}] Invalid resume value (entryType: ${selectedType}), keeping LLM suggestion: ${state.entryType}`
    );
    return {
      classificationConfirmed: true,
    };
  };
}
