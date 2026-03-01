import { IArtefactsRepository } from '../artefacts/artefacts.repository.interface';
import { IConversationsRepository } from '../conversations/conversations.repository.interface';
import { TransactionService } from '../database/transaction.service';
import { LLMService } from '../llm';
import { IPdpActionsRepository } from '../pdp-actions/pdp-actions.repository.interface';

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
  pdpActionsRepository: IPdpActionsRepository;
  transactionService: TransactionService;
  llmService: LLMService;
}
