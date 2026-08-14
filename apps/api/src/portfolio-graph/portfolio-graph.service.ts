import {
  type CapabilityOption,
  type FreeTextQuestion,
  type MultiSelectQuestion,
  MessageRole,
  MessageStatus,
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
import { CHECKPOINT_COLLECTION, CHECKPOINT_WRITES_COLLECTION } from '../checkpoints';
import {
  type CreateMessageData,
  CONVERSATIONS_REPOSITORY,
  IConversationsRepository,
} from '../conversations/conversations.repository.interface';
import { TransactionService } from '../database/transaction.service';
import { LLMService, ModelConfigService } from '../llm';
import {
  IPdpGoalsRepository,
  PDP_GOALS_REPOSITORY,
} from '../pdp-goals/pdp-goals.repository.interface';
import { DEFAULT_FOLLOWUP_LINE } from './followup-copy';
import { buildPortfolioGraph } from './portfolio-graph.builder';
import type { PortfolioStateType } from './portfolio-graph.state';
import { buildReadinessSnapshot } from './readiness-snapshot';

/**
 * Maps each RESUMABLE interrupt node to its expected resume value type.
 * `true` means the node resumes with no payload (just a signal).
 */
export interface ResumableNodeMap {
  ask_followup: true;
  present_capabilities: { selectedCodes: string[] };
}

/** Interrupt nodes that can be resumed with a user's answer. */
export type ResumableNode = keyof ResumableNodeMap;

/**
 * Interrupt nodes that pause the graph with an informational message and are
 * never resumed — the API rejects resumes of terminal questions. Kept out of
 * `ResumableNodeMap` so `resumeGraph` cannot be called with one: the contract is
 * enforced by the type rather than by a comment.
 */
export type TerminalNode = 'reject_entry';

/** Every node the graph can pause at — what `getPausedNode` reports. */
export type InterruptNode = ResumableNode | TerminalNode;

/**
 * Runtime membership test for `getPausedNode`, which only has a raw string from
 * the checkpoint to work with.
 *
 * Derived from a `Record<InterruptNode, true>` rather than hand-written, because
 * that errors BOTH ways: an unknown key is rejected, and a missing one fails to
 * compile. Omission is the dangerous direction — a node absent from this set makes
 * a genuinely paused run look unpaused, and callers read the resulting `null` as
 * "the run completed", silently transitioning it to COMPLETED with no question
 * message ever written.
 */
const INTERRUPT_NODE_FLAGS: Record<InterruptNode, true> = {
  ask_followup: true,
  present_capabilities: true,
  reject_entry: true,
};

const INTERRUPT_NODES: ReadonlySet<string> = new Set(Object.keys(INTERRUPT_NODE_FLAGS));

const CAPABILITIES_PROMPTS = [
  "I spotted some capabilities in your entry. Confirm the ones that apply, or deselect any that don't fit.",
  'Here are the capabilities I picked up from your input. Check the ones that match.',
  "I've mapped your entry to a few capabilities. Select the ones that are relevant.",
  "Based on what you've shared, these capabilities stood out. Confirm or adjust as needed.",
  "A few capabilities came through in your entry. Keep the ones that fit and remove any that don't.",
  "I've highlighted some capabilities from your input. Does this look right?",
  "These capabilities seem to align with your entry. Deselect any that aren't a match.",
  "Your entry maps to the capabilities below. Confirm the ones you'd like to include.",
  'I found some relevant capabilities in your input. Review and adjust the selection.',
  "Here's what I identified - select the capabilities that best reflect your entry.",
] as const;

/** Data needed to create the ASSISTANT question message for an interrupt. No DB writes. */
export interface InterruptPayload {
  idempotencyKey: string;
  pausedNode: InterruptNode;
  messageData: CreateMessageData;
  questionType: 'single_select' | 'multi_select' | 'free_text' | 'terminal';
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
    private readonly modelConfig: ModelConfigService,
    private readonly eventEmitter: EventEmitter2
  ) {}

  async onModuleInit() {
    // Get the native MongoDB client from the Mongoose connection.
    // Cast through unknown because Mongoose may bundle a slightly different mongodb
    // driver version than @langchain/langgraph-checkpoint-mongodb expects.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = this.connection.getClient() as any;
    const db = this.connection.db;
    if (!db) throw new Error('MongoDB not connected - cannot initialize checkpointer');
    // Collection names are passed explicitly (rather than relying on the saver's
    // defaults) so the CheckpointRepository that purges them and the saver that
    // writes them read the same constants and cannot drift apart.
    this.checkpointer = new MongoDBSaver({
      client,
      dbName: db.databaseName,
      checkpointCollectionName: CHECKPOINT_COLLECTION,
      checkpointWritesCollectionName: CHECKPOINT_WRITES_COLLECTION,
    });

    // The JS MongoDBSaver doesn't create indexes (unlike the Python version).
    // Add compound indexes matching its query patterns: getTuple() filters by
    // (thread_id, checkpoint_ns) and sorts by checkpoint_id desc. Both lead with
    // thread_id, which is also what the retention purge filters on.
    await Promise.all([
      db
        .collection(CHECKPOINT_COLLECTION)
        .createIndex({ thread_id: 1, checkpoint_ns: 1, checkpoint_id: -1 }, { background: true }),
      db
        .collection(CHECKPOINT_WRITES_COLLECTION)
        .createIndex({ thread_id: 1, checkpoint_ns: 1, checkpoint_id: 1 }, { background: true }),
    ]);

    const deps = {
      artefactsRepository: this.artefactsRepository,
      conversationsRepository: this.conversationsRepository,
      pdpGoalsRepository: this.pdpGoalsRepository,
      transactionService: this.transactionService,
      llmService: this.llmService,
      modelConfig: this.modelConfig,
      eventEmitter: this.eventEmitter,
    };
    this.graph = buildPortfolioGraph(this.checkpointer, deps);
    this.logger.log('Portfolio graph compiled and ready');
  }

  /**
   * Start a new graph execution for a conversation.
   * Returns the interrupt node name if the graph paused, null if it completed.
   * No side effects (message creation) - the handler is responsible for those.
   *
   * threadId is the LangGraph thread namespace (e.g. `${conversationId}:${runNumber}`).
   */
  async startGraph(params: {
    conversationId: string;
    artefactId: string;
    userId: string;
    specialty: string;
    trainingStage: string;
    /** Chosen by the trainee at artefact creation; validated at that boundary. */
    entryType: string;
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
        entryType: params.entryType,
      },
      config
    );

    // graph.invoke() returns normally when a node calls interrupt() -
    // it does NOT throw. Check the checkpoint for a pending interrupt.
    return this.getPausedNode(threadId);
  }

  /**
   * Resume a paused graph after the user responds (to a follow-up or capability review).
   * Returns the interrupt node name if the graph paused again, null if it completed.
   * No side effects (message creation) - the handler is responsible for those.
   *
   * threadId is the LangGraph thread namespace (e.g. `${conversationId}:${runNumber}`).
   * Type-safe: each resumable node declares its resume value shape in
   * `ResumableNodeMap`, and nodes that resume with just a signal (e.g.
   * ask_followup) take no resumeValue arg. Constrained to `ResumableNode`, so
   * passing a terminal node here is a compile error rather than a runtime one.
   */
  async resumeGraph<N extends ResumableNode>(
    threadId: string,
    node: N,
    ...args: ResumableNodeMap[N] extends true ? [] : [resumeValue: ResumableNodeMap[N]]
  ): Promise<InterruptNode | null> {
    const config = { configurable: { thread_id: threadId } };
    const resumeValue = args.length > 0 ? args[0] : true;

    this.logger.log(`Resuming portfolio graph at node "${node}" (thread: ${threadId})`);

    await this.graph.invoke(new Command({ resume: resumeValue }), config);

    // The resumed graph may hit another interrupt (e.g. follow-up after classification).
    return this.getPausedNode(threadId);
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

    if (INTERRUPT_NODES.has(nextNode)) {
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
   * the run status - both wrapped in a single transaction (Phase 3).
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

    // Live readiness snapshot for the Entry Card - rides on each question message.
    const readiness = buildReadinessSnapshot(snapshot.values as PortfolioStateType);

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
      case 'followup': {
        const questions = interruptValue.questions as Array<{
          sectionId: string;
          question: string;
          hints: { examples: string[] };
        }>;
        const followUpRound = interruptValue.followUpRound as number;

        // Readiness-driven intro line chosen in generate_followup (MOB-047).
        const content = (interruptValue.introLine as string) || DEFAULT_FOLLOWUP_LINE;

        const question: FreeTextQuestion = {
          questionType: 'free_text',
          prompts: questions.map((q) => ({ key: q.sectionId, text: q.question, hints: q.hints })),
          missingSections: interruptValue.missingSections as string[],
          followUpRound,
          entryType: interruptValue.entryType as string,
          readiness,
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
            status: MessageStatus.COMPLETE,
            question,
            idempotencyKey,
          },
        };
      }

      case 'rejected': {
        // Terminal: check_completeness graded the transcript as not a portfolio
        // entry. No question to answer — the trainee starts a new conversation.
        const terminalContent =
          "That doesn't look like a portfolio entry to me. " +
          'You can start a new conversation describing a clinical experience, ' +
          'learning event, or professional activity you would like to reflect on.';

        return {
          idempotencyKey,
          pausedNode,
          questionType: 'terminal',
          messageData: {
            conversation: conversationOid,
            userId: userOid,
            role: MessageRole.ASSISTANT,
            messageType: MessageType.TEXT,
            rawContent: terminalContent,
            content: terminalContent,
            status: MessageStatus.COMPLETE,
            idempotencyKey,
          },
        };
      }

      case 'capabilities': {
        const options = interruptValue.options as CapabilityOption[];

        // ── Terminal message: no capabilities identified ──
        if (options.length === 0) {
          const terminalContent =
            "I wasn't able to identify specific curriculum capabilities from what you've shared. " +
            'You can start a new conversation with more detail about what you did, ' +
            'your clinical reasoning, or what you learned.';

          return {
            idempotencyKey,
            pausedNode,
            questionType: 'terminal',
            messageData: {
              conversation: conversationOid,
              userId: userOid,
              role: MessageRole.ASSISTANT,
              messageType: MessageType.TEXT,
              rawContent: terminalContent,
              content: terminalContent,
              status: MessageStatus.COMPLETE,
              idempotencyKey,
            },
          };
        }

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
          readiness,
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
            status: MessageStatus.COMPLETE,
            question,
            idempotencyKey,
          },
        };
      }

    }

    return null;
  }
}
