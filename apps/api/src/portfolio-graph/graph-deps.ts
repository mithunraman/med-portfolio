import type { EventEmitter2 } from '@nestjs/event-emitter';
import { ThinkingStep } from './thinking-step.enum';
import { IArtefactsRepository } from '../artefacts/artefacts.repository.interface';
import { IConversationsRepository } from '../conversations/conversations.repository.interface';
import { TransactionService } from '../database/transaction.service';
import { LLMService, ModelConfigService } from '../llm';
import { IPdpGoalsRepository } from '../pdp-goals/pdp-goals.repository.interface';

/** Event emitted by each graph node when it starts executing. */
export const ANALYSIS_STEP_STARTED = 'analysis.step.started';

export interface AnalysisStepStartedEvent {
  conversationId: string;
  /** Owner of the conversation — the listener scopes its write by it. */
  userId: string;
  step: ThinkingStep;
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
  modelConfig: ModelConfigService;
  eventEmitter: EventEmitter2;
}

/**
 * The only place an ANALYSIS_STEP_STARTED payload is constructed.
 *
 * EventEmitter2's signature is `emit(event, ...values: any[])`, so
 * `AnalysisStepStartedEvent` cannot be enforced at a call site — it is
 * documentation there, not a check. Twelve nodes previously hand-wrote the
 * literal, which is why adding one field meant editing twelve files and why a
 * node could omit one and still compile.
 *
 * Funnelling through here buys two things the literals could not:
 *
 * 1. The payload is built once against the interface, so no node can omit
 *    `userId` or `conversationId`. (The listener's `toObjectId` guards stay as
 *    the backstop for anything that ever emits outside this helper.)
 * 2. `step` is a `ThinkingStep`, not a bare string. That closes the silent
 *    degradation `thinking-step.enum.ts` documents on itself: a step missing
 *    from the enum "degrades silently to no label shown rather than raising
 *    anything". Now a new node fails to compile until it is added to the enum,
 *    and adding it fails `STEP_LABELS` (a total `Record<ThinkingStep, string>`)
 *    until it has a label. Two build errors instead of a blank UI.
 *
 * Takes a structural slice rather than `PortfolioStateType`: nothing needs the
 * whole state, and it keeps this module from depending on the state module.
 */
export function emitStepStarted(
  deps: Pick<GraphDeps, 'eventEmitter'>,
  state: { conversationId: string; userId: string },
  step: ThinkingStep,
): void {
  deps.eventEmitter.emit(ANALYSIS_STEP_STARTED, {
    conversationId: state.conversationId,
    userId: state.userId,
    step,
  } satisfies AnalysisStepStartedEvent);
}
