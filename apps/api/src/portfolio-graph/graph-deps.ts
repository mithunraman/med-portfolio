import { IConversationsRepository } from '../conversations/conversations.repository.interface';
import { LLMService } from '../llm';

/**
 * Dependencies injected into graph nodes via the factory pattern.
 *
 * Nodes are plain functions for LangGraph compatibility. They can't use
 * NestJS @Inject directly. Instead, PortfolioGraphService creates this
 * object from the DI container and passes it to buildPortfolioGraph(),
 * which hands it to each node factory.
 */
export interface GraphDeps {
  conversationsRepository: IConversationsRepository;
  llmService: LLMService;
}
