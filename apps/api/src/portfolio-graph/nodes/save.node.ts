import { Logger } from '@nestjs/common';
import { ANALYSIS_STEP_STARTED, GraphDeps } from '../graph-deps';
import { PortfolioStateType } from '../portfolio-graph.state';

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

    if (!state.entryType) throw new Error('Cannot save: entryType is not set');
    if (!state.title) throw new Error('Cannot save: title is not set');
    if (!state.reflection) throw new Error('Cannot save: reflection is not set');
    if (state.capabilities.length === 0) throw new Error('Cannot save: no capabilities');

    logger.log(`Validation passed for artefact ${state.artefactId}`);
    return {};
  };
}
