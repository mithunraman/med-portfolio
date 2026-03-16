import type { EventEmitter2 } from '@nestjs/event-emitter';
import { IArtefactsRepository } from '../artefacts/artefacts.repository.interface';
import { IConversationsRepository } from '../conversations/conversations.repository.interface';
import { TransactionService } from '../database/transaction.service';
import { LLMService } from '../llm';
import { IPdpGoalsRepository } from '../pdp-goals/pdp-goals.repository.interface';

/** Event emitted by each graph node when it starts executing. */
export const ANALYSIS_STEP_STARTED = 'analysis.step.started';

export interface AnalysisStepStartedEvent {
  conversationId: string;
  step: string;
}

/**
 * Dependencies injected into graph nodes via the factory pattern.
 *
 * Nodes are plain functions for LangGraph compatibility. They can't use
 * NestJS @Inject directly. Instead, PortfolioGraphService creates this
 * object from the DI container and passes it to buildPortfolioGraph(),
 * which hands it to each node factory.
 */
export interface GraphDeps {
  artefactsRepository: IArtefactsRepository;
  conversationsRepository: IConversationsRepository;
  pdpGoalsRepository: IPdpGoalsRepository;
  transactionService: TransactionService;
  llmService: LLMService;
  eventEmitter: EventEmitter2;
}
