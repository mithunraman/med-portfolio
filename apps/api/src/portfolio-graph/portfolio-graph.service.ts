import {
  type CapabilityOption,
  type ClassificationOption,
  type FreeTextQuestion,
  type MultiSelectQuestion,
  type SingleSelectQuestion,
  MessageProcessingStatus,
  MessageRole,
  MessageType,
} from '@acme/shared';
import { Command } from '@langchain/langgraph';
import { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import {
  ARTEFACTS_REPOSITORY,
  IArtefactsRepository,
} from '../artefacts/artefacts.repository.interface';
import {
  type CreateMessageData,
  CONVERSATIONS_REPOSITORY,
  IConversationsRepository,
} from '../conversations/conversations.repository.interface';
import { TransactionService } from '../database/transaction.service';
import { LLMService } from '../llm';
import {
  IPdpGoalsRepository,
  PDP_GOALS_REPOSITORY,
} from '../pdp-goals/pdp-goals.repository.interface';
import { buildPortfolioGraph } from './portfolio-graph.builder';
import type { PortfolioStateType } from './portfolio-graph.state';

/**
 * Maps each interrupt node to its expected resume value type.
 * `true` means the node resumes with no payload (just a signal).
 */
export interface GraphResumeMap {
  present_classification: { entryType: string };
  ask_followup: true;
  present_capabilities: { selectedCodes: string[] };
}

export type InterruptNode = keyof GraphResumeMap;

const CLASSIFICATION_PROMPTS = [
  'Which entry type best describes this? Select one below, or choose a different one.',
  "I've identified some possible entry types. Pick the best match, or choose another.",
  'Here are the entry types I think fit best. Select one, or go with something else.',
  "Based on what you've shared, these entry types seem most relevant. Which one fits?",
  'I narrowed it down to a few entry types. Choose the closest match below.',
  'Take a look at the options below — which entry type feels right?',
  "These entry types look like the best fit. Select one, or pick a different one if you'd prefer.",
  'I think one of these entry types matches your input. Which would you go with?',
  "Here's what I came up with — select the entry type that fits best, or choose your own.",
  'A few entry types stood out. Pick the one that best captures your input.',
] as const;

const FOLLOWUP_PROMPTS: Record<string, readonly string[]> = {
  initial: [
    'Thanks for sharing that. I have a couple more questions to strengthen your portfolio entry. Take your time — answer all at once or one by one.',
    "Great input! Just a couple more things I'd like to know to make your entry shine.",
    'Nearly there — I have a couple more questions to round out your portfolio entry.',
    'Thanks! A couple more quick questions to make sure we capture everything.',
    'Appreciate the detail. Just a couple more questions to fill in the gaps.',
    "That's really helpful. I have a couple more follow-ups to get the full picture.",
    'Good stuff — a couple more questions and your entry will be in great shape.',
    'Thanks for that. A couple more things to cover so your portfolio entry stands out.',
    'Nice work so far. Just a couple more questions to bring it all together.',
    'Almost done — I have a couple more questions to make your entry as strong as possible.',
  ],
  final: [
    "You're almost there! Just a few final questions to polish your portfolio entry.",
    'Thanks for sticking with it. A few final questions to wrap things up.',
    "We're in the home stretch — a few final things to make your entry complete.",
    'Nearly finished! Just a few final questions to tie everything together.',
    'Last stretch — I have a few final questions to round off your entry.',
    'Great progress. A few final questions and your portfolio entry will be ready.',
    'Thanks for all the detail so far. Just a few final follow-ups.',
    'Almost there — a few final questions to make sure nothing is missed.',
    "You've done the hard part. A few final questions to finish strong.",
    'Just a few final things to cover, then your entry will be all set.',
  ],
} as const;

const CAPABILITIES_PROMPTS = [
  'I spotted some capabilities in your entry. Confirm the ones that apply, or deselect any that don\'t fit.',
  "Here are the capabilities I picked up from your input. Check the ones that match.",
  "I've mapped your entry to a few capabilities. Select the ones that are relevant.",
  "Based on what you've shared, these capabilities stood out. Confirm or adjust as needed.",
  "A few capabilities came through in your entry. Keep the ones that fit and remove any that don't.",
  "I've highlighted some capabilities from your input. Does this look right?",
  "These capabilities seem to align with your entry. Deselect any that aren't a match.",
  "Your entry maps to the capabilities below. Confirm the ones you'd like to include.",
  "I found some relevant capabilities in your input. Review and adjust the selection.",
  "Here's what I identified — select the capabilities that best reflect your entry.",
] as const;

/** Data needed to create the ASSISTANT question message for an interrupt. No DB writes. */
export interface InterruptPayload {
  idempotencyKey: string;
  pausedNode: InterruptNode;
  messageData: CreateMessageData;
  questionType: 'single_select' | 'multi_select' | 'free_text';
}

@Injectable()
export class PortfolioGraphService implements OnModuleInit {
  private readonly logger = new Logger(PortfolioGraphService.name);
  private graph!: ReturnType<typeof buildPortfolioGraph>;
  private checkpointer!: MongoDBSaver;

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @Inject(ARTEFACTS_REPOSITORY)
    private readonly artefactsRepository: IArtefactsRepository,
    @Inject(CONVERSATIONS_REPOSITORY)
    private readonly conversationsRepository: IConversationsRepository,
    @Inject(PDP_GOALS_REPOSITORY)
    private readonly pdpGoalsRepository: IPdpGoalsRepository,
    private readonly transactionService: TransactionService,
    private readonly llmService: LLMService,
    private readonly eventEmitter: EventEmitter2
  ) {}

  async onModuleInit() {
    // Get the native MongoDB client from the Mongoose connection.
    // Cast through unknown because Mongoose may bundle a slightly different mongodb
    // driver version than @langchain/langgraph-checkpoint-mongodb expects.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = this.connection.getClient() as any;
    const db = this.connection.db;
    if (!db) throw new Error('MongoDB not connected — cannot initialize checkpointer');
    this.checkpointer = new MongoDBSaver({ client, dbName: db.databaseName });

    // The JS MongoDBSaver doesn't create indexes (unlike the Python version).
    // Add compound indexes matching its query patterns: getTuple() filters by
    // (thread_id, checkpoint_ns) and sorts by checkpoint_id desc.
    await Promise.all([
      db
        .collection('checkpoints')
        .createIndex({ thread_id: 1, checkpoint_ns: 1, checkpoint_id: -1 }, { background: true }),
      db
        .collection('checkpoint_writes')
        .createIndex({ thread_id: 1, checkpoint_ns: 1, checkpoint_id: 1 }, { background: true }),
    ]);

    const deps = {
      artefactsRepository: this.artefactsRepository,
      conversationsRepository: this.conversationsRepository,
      pdpGoalsRepository: this.pdpGoalsRepository,
      transactionService: this.transactionService,
      llmService: this.llmService,
      eventEmitter: this.eventEmitter,
    };
    this.graph = buildPortfolioGraph(this.checkpointer, deps);
    this.logger.log('Portfolio graph compiled and ready');
  }

  /**
   * Start a new graph execution for a conversation.
   * Returns the interrupt node name if the graph paused, null if it completed.
   * No side effects (message creation) — the handler is responsible for those.
   *
   * threadId is the LangGraph thread namespace (e.g. `${conversationId}:${runNumber}`).
   */
  async startGraph(params: {
    conversationId: string;
    artefactId: string;
    userId: string;
    specialty: string;
    trainingStage: string;
    threadId: string;
  }): Promise<InterruptNode | null> {
    const { threadId } = params;
    const config = { configurable: { thread_id: threadId } };

    this.logger.log(
      `Starting portfolio graph for conversation ${params.conversationId} (thread: ${threadId})`
    );

    await this.graph.invoke(
      {
        conversationId: params.conversationId,
        artefactId: params.artefactId,
        userId: params.userId,
        specialty: params.specialty,
        trainingStage: params.trainingStage,
      },
      config
    );

    // graph.invoke() returns normally when a node calls interrupt() —
    // it does NOT throw. Check the checkpoint for a pending interrupt.
    return this.getPausedNode(threadId);
  }

  /**
   * Resume a paused graph after the user responds (to classification, follow-up, or review).
   * Returns the interrupt node name if the graph paused again, null if it completed.
   * No side effects (message creation) — the handler is responsible for those.
   *
   * threadId is the LangGraph thread namespace (e.g. `${conversationId}:${runNumber}`).
   * Type-safe: each interrupt node declares its resume value shape in GraphResumeMap.
   * Nodes that resume with just a signal (e.g. ask_followup) take no resumeValue arg.
   */
  async resumeGraph<N extends InterruptNode>(
    threadId: string,
    node: N,
    ...args: GraphResumeMap[N] extends true ? [] : [resumeValue: GraphResumeMap[N]]
  ): Promise<InterruptNode | null> {
    const config = { configurable: { thread_id: threadId } };
    const resumeValue = args.length > 0 ? args[0] : true;

    this.logger.log(`Resuming portfolio graph at node "${node}" (thread: ${threadId})`);

    await this.graph.invoke(new Command({ resume: resumeValue }), config);

    // The resumed graph may hit another interrupt (e.g. follow-up after classification).
    return this.getPausedNode(threadId);
  }

  /**
   * Check if a graph checkpoint exists for a conversation.
   * Used to determine whether to start a new graph or resume an existing one.
   *
   * Note: graph.getState() returns a StateSnapshot with default channel values
   * even for threads that have never been invoked. We check for `conversationId`
   * which has no default — it's only set when startGraph() provides initial input.
   */
  async hasCheckpoint(conversationId: string): Promise<boolean> {
    const config = { configurable: { thread_id: conversationId } };
    const state = await this.graph.getState(config);
    return !!state?.values?.conversationId;
  }

  /**
   * Inspect the graph checkpoint to determine which interrupt node (if any)
   * the graph is currently paused at.
   *
   * LangGraph's StateSnapshot.next contains the node(s) scheduled to run
   * on the next invocation. When a node calls interrupt(), the checkpoint
   * saves with that node still in `next` (it re-executes on resume).
   *
   * Returns the interrupt node name if paused at a known interrupt point,
   * or null if the graph is not paused at an interrupt node.
   */
  async getPausedNode(threadId: string): Promise<InterruptNode | null> {
    const config = { configurable: { thread_id: threadId } };
    const state = await this.graph.getState(config);

    if (!state?.next?.length) return null;

    const nextNode = state.next[0];
    const interruptNodes = new Set<string>([
      'present_classification',
      'ask_followup',
      'present_capabilities',
    ]);

    if (interruptNodes.has(nextNode)) {
      return nextNode as InterruptNode;
    }

    return null;
  }

  /**
   * Read the completed graph's state from the checkpoint.
   * Pure read, no side effects, safe to call any number of times.
   * Used by handlers to extract final state for saving artefact + PDP goals.
   */
  async getFinalState(threadId: string): Promise<PortfolioStateType> {
    const config = { configurable: { thread_id: threadId } };
    const snapshot = await this.graph.getState(config);
    if (!snapshot?.values?.conversationId) {
      throw new Error(`No graph state found for thread ${threadId}`);
    }
    return snapshot.values as PortfolioStateType;
  }

  /**
   * Read the interrupt payload from the checkpoint and return all data needed
   * to create the ASSISTANT question message. **No DB writes.**
   *
   * The handler is responsible for creating the message and transitioning
   * the run status — both wrapped in a single transaction (Phase 3).
   *
   * Idempotency key is derived deterministically from
   * `${conversationId}:${pausedNode}:${checkpointId}` so retries produce
   * the same key and can check-before-create.
   *
   * Returns null if no interrupt payload is found (unknown interrupt type).
   */
  async getInterruptPayload(threadId: string): Promise<InterruptPayload | null> {
    const config = { configurable: { thread_id: threadId } };
    const snapshot = await this.graph.getState(config);

    // The interrupt payload is stored in snapshot.tasks[].interrupts[].value
    const interruptValue = snapshot?.tasks?.[0]?.interrupts?.[0]?.value as
      | Record<string, unknown>
      | undefined;

    if (!interruptValue?.type) return null;

    const state = snapshot.values as {
      conversationId: string;
      userId: string;
    };

    const pausedNode = snapshot.next?.[0] as InterruptNode | undefined;
    if (!pausedNode) return null;

    // Derive a deterministic idempotency key from the checkpoint state.
    // Same interrupt at the same checkpoint always produces the same key,
    // making retries safe (no duplicate messages).
    const checkpointId = (snapshot?.config?.configurable?.checkpoint_id as string) ?? 'unknown';
    const idempotencyKey = `${state.conversationId}:${pausedNode}:${checkpointId}`;

    const conversationOid = new Types.ObjectId(state.conversationId);
    const userOid = new Types.ObjectId(state.userId);

    switch (interruptValue.type) {
      case 'classification': {
        const options = interruptValue.options as ClassificationOption[];

        const content =
          CLASSIFICATION_PROMPTS[Math.floor(Math.random() * CLASSIFICATION_PROMPTS.length)];

        const question: SingleSelectQuestion = {
          questionType: 'single_select',
          options: options.map((o) => ({
            key: o.code,
            label: o.label,
            confidence: o.confidence,
            reasoning: o.reasoning,
          })),
          suggestedKey: interruptValue.suggestedEntryType as string,
        };

        return {
          idempotencyKey,
          pausedNode,
          questionType: 'single_select',
          messageData: {
            conversation: conversationOid,
            userId: userOid,
            role: MessageRole.ASSISTANT,
            messageType: MessageType.TEXT,
            rawContent: content,
            content,
            processingStatus: MessageProcessingStatus.COMPLETE,
            question,
            idempotencyKey,
          },
        };
      }

      case 'followup': {
        const questions = interruptValue.questions as Array<{
          sectionId: string;
          question: string;
          hints: { examples: string[] };
        }>;
        const followUpRound = interruptValue.followUpRound as number;

        const roundKey = followUpRound === 1 ? 'initial' : 'final';
        const prompts = FOLLOWUP_PROMPTS[roundKey];
        const content = prompts[Math.floor(Math.random() * prompts.length)];

        const question: FreeTextQuestion = {
          questionType: 'free_text',
          prompts: questions.map((q) => ({ key: q.sectionId, text: q.question, hints: q.hints })),
          missingSections: interruptValue.missingSections as string[],
          followUpRound,
          entryType: interruptValue.entryType as string,
        };

        return {
          idempotencyKey,
          pausedNode,
          questionType: 'free_text',
          messageData: {
            conversation: conversationOid,
            userId: userOid,
            role: MessageRole.ASSISTANT,
            messageType: MessageType.TEXT,
            rawContent: content,
            content,
            processingStatus: MessageProcessingStatus.COMPLETE,
            question,
            idempotencyKey,
          },
        };
      }

      case 'capabilities': {
        const options = interruptValue.options as CapabilityOption[];

        const capContent =
          CAPABILITIES_PROMPTS[Math.floor(Math.random() * CAPABILITIES_PROMPTS.length)];

        const question: MultiSelectQuestion = {
          questionType: 'multi_select',
          options: options.map((o) => ({
            key: o.code,
            label: o.name,
            confidence: o.confidence,
            reasoning: o.reasoning,
          })),
        };

        return {
          idempotencyKey,
          pausedNode,
          questionType: 'multi_select',
          messageData: {
            conversation: conversationOid,
            userId: userOid,
            role: MessageRole.ASSISTANT,
            messageType: MessageType.TEXT,
            rawContent: capContent,
            content: capContent,
            processingStatus: MessageProcessingStatus.COMPLETE,
            question,
            idempotencyKey,
          },
        };
      }
    }

    return null;
  }
}
