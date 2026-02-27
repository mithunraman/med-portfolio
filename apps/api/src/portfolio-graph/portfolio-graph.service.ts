import {
  type CapabilityOption,
  type CapabilityOptionsMetadata,
  type ClassificationOption,
  type ClassificationOptionsMetadata,
  type FollowupQuestionsMetadata,
  InteractionType,
  MessageMetadataType,
  MessageProcessingStatus,
  MessageRole,
  MessageType,
} from '@acme/shared';
import { Command } from '@langchain/langgraph';
import { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import {
  CONVERSATIONS_REPOSITORY,
  IConversationsRepository,
} from '../conversations/conversations.repository.interface';
import { LLMService } from '../llm';
import { buildPortfolioGraph } from './portfolio-graph.builder';

/**
 * Maps each interrupt node to its expected resume value type.
 * `true` means the node resumes with no payload (just a signal).
 */
export interface GraphResumeMap {
  present_classification: { entryType: string };
  ask_followup: true;
  present_capabilities: { selectedCodes: string[] };
  present_draft: { approved: boolean };
}

export type InterruptNode = keyof GraphResumeMap;

/** Discriminated union representing the current state of the graph for a conversation. */
export type GraphStatus =
  | { status: 'not_started' }
  | { status: 'running' }
  | { status: 'paused'; node: InterruptNode }
  | { status: 'completed' };

@Injectable()
export class PortfolioGraphService implements OnModuleInit {
  private readonly logger = new Logger(PortfolioGraphService.name);
  private graph!: ReturnType<typeof buildPortfolioGraph>;
  private checkpointer!: MongoDBSaver;

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @Inject(CONVERSATIONS_REPOSITORY)
    private readonly conversationsRepository: IConversationsRepository,
    private readonly llmService: LLMService
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
      conversationsRepository: this.conversationsRepository,
      llmService: this.llmService,
    };
    this.graph = buildPortfolioGraph(this.checkpointer, deps);
    this.logger.log('Portfolio graph compiled and ready');
  }

  /**
   * Start a new graph execution for a conversation.
   * Called after the first message in a conversation completes cleaning.
   */
  async startGraph(params: {
    conversationId: string;
    artefactId: string;
    userId: string;
    specialty: string;
  }): Promise<void> {
    const { conversationId } = params;
    const config = { configurable: { thread_id: conversationId } };

    this.logger.log(`Starting portfolio graph for conversation ${conversationId}`);

    await this.graph.invoke(
      {
        conversationId: params.conversationId,
        artefactId: params.artefactId,
        userId: params.userId,
        specialty: params.specialty,
      },
      config
    );

    // graph.invoke() returns normally when a node calls interrupt() —
    // it does NOT throw. Check the checkpoint for a pending interrupt.
    await this.handleInterruptSideEffectsIfPaused(conversationId);
  }

  /**
   * Resume a paused graph after the user responds (to classification, follow-up, or review).
   *
   * Type-safe: each interrupt node declares its resume value shape in GraphResumeMap.
   * Nodes that resume with just a signal (e.g. ask_followup) take no resumeValue arg.
   */
  async resumeGraph<N extends InterruptNode>(
    conversationId: string,
    node: N,
    ...args: GraphResumeMap[N] extends true ? [] : [resumeValue: GraphResumeMap[N]]
  ): Promise<void> {
    const config = { configurable: { thread_id: conversationId } };
    const resumeValue = args.length > 0 ? args[0] : true;

    this.logger.log(
      `Resuming portfolio graph for conversation ${conversationId} at node "${node}"`
    );

    await this.graph.invoke(new Command({ resume: resumeValue }), config);

    // The resumed graph may hit another interrupt (e.g. follow-up after classification).
    await this.handleInterruptSideEffectsIfPaused(conversationId);
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
  async getPausedNode(conversationId: string): Promise<InterruptNode | null> {
    const config = { configurable: { thread_id: conversationId } };
    const state = await this.graph.getState(config);

    if (!state?.next?.length) return null;

    const nextNode = state.next[0];
    const interruptNodes = new Set<string>([
      'present_classification',
      'ask_followup',
      'present_capabilities',
      'present_draft',
    ]);

    if (interruptNodes.has(nextNode)) {
      return nextNode as InterruptNode;
    }

    return null;
  }

  /**
   * Get the current state of a graph execution.
   * Useful for debugging and for the API to report graph status.
   */
  async getGraphState(conversationId: string) {
    const config = { configurable: { thread_id: conversationId } };
    return this.graph.getState(config);
  }

  /**
   * Determine the high-level status of the graph for a conversation.
   *
   * - not_started: no checkpoint exists (conversationId not set)
   * - paused: graph is waiting at an interrupt node for user input
   * - running: checkpoint exists with pending nodes that aren't interrupt points
   * - completed: checkpoint exists but no pending nodes remain
   */
  async getGraphStatus(conversationId: string): Promise<GraphStatus> {
    const config = { configurable: { thread_id: conversationId } };
    const state = await this.graph.getState(config);

    if (!state?.values?.conversationId) return { status: 'not_started' };
    if (!state.next?.length) return { status: 'completed' };

    const nextNode = state.next[0];
    const interruptNodes = new Set<string>([
      'present_classification',
      'ask_followup',
      'present_capabilities',
      'present_draft',
    ]);

    if (interruptNodes.has(nextNode)) return { status: 'paused', node: nextNode as InterruptNode };

    return { status: 'running' };
  }

  /**
   * Check if the graph is paused at an interrupt node after invoke() returns.
   * If so, handle side effects (e.g. writing an ASSISTANT message).
   *
   * graph.invoke() does NOT throw on interrupt — it returns normally after
   * saving the checkpoint. We inspect the snapshot to detect the pause.
   */
  private async handleInterruptSideEffectsIfPaused(conversationId: string): Promise<void> {
    const pausedNode = await this.getPausedNode(conversationId);
    if (!pausedNode) return;

    this.logger.log(`Graph paused at "${pausedNode}" for conversation ${conversationId}`);
    await this.handleInterruptSideEffects(conversationId);
  }

  /**
   * Read the interrupt payload from the checkpoint and perform side effects
   * (e.g. writing an ASSISTANT message to the conversation).
   *
   * This runs once per startGraph()/resumeGraph() call — outside the graph's
   * replay cycle — so there is no idempotency concern.
   */
  private async handleInterruptSideEffects(conversationId: string): Promise<void> {
    const config = { configurable: { thread_id: conversationId } };
    const snapshot = await this.graph.getState(config);

    // The interrupt payload is stored in snapshot.tasks[].interrupts[].value
    const interruptValue = snapshot?.tasks?.[0]?.interrupts?.[0]?.value as
      | Record<string, unknown>
      | undefined;

    if (!interruptValue?.type) return;

    const state = snapshot.values as {
      conversationId: string;
      userId: string;
    };

    switch (interruptValue.type) {
      case 'classification': {
        const options = interruptValue.options as ClassificationOption[];
        const optionLines = options
          .map((o, i) => `${i + 1}. **${o.label}** (${Math.round(o.confidence * 100)}% confidence)`)
          .join('\n');

        const content =
          `Based on your input, I think this is most likely:\n\n${optionLines}\n\n` +
          `Please select the entry type, or choose a different one.`;

        const metadata: ClassificationOptionsMetadata = {
          type: MessageMetadataType.CLASSIFICATION_OPTIONS,
          interactionType: InteractionType.SINGLE_SELECT,
          options,
          suggestedEntryType: interruptValue.suggestedEntryType as string,
          reasoning: interruptValue.reasoning as string,
        };

        const result = await this.conversationsRepository.createMessage({
          conversation: new Types.ObjectId(state.conversationId),
          userId: new Types.ObjectId(state.userId),
          role: MessageRole.ASSISTANT,
          messageType: MessageType.TEXT,
          rawContent: content,
          content,
          processingStatus: MessageProcessingStatus.COMPLETE,
          metadata,
        });

        if (!result.ok) {
          this.logger.error(`Failed to send classification options: ${result.error.message}`);
        }
        break;
      }

      case 'followup': {
        const questions = interruptValue.questions as Array<{
          sectionId: string;
          question: string;
        }>;
        const followUpRound = interruptValue.followUpRound as number;

        const questionLines = questions.map((q) => `- ${q.question}`).join('\n');
        const roundLabel = followUpRound === 1 ? 'a couple more' : 'a few final';

        const content =
          `Thanks for sharing that. I just have ${roundLabel} questions to make sure your portfolio entry is as strong as possible:\n\n` +
          `${questionLines}\n\n` +
          `Take your time — you can answer all of these in one go or one at a time.`;

        const followupMetadata: FollowupQuestionsMetadata = {
          type: MessageMetadataType.FOLLOWUP_QUESTIONS,
          interactionType: InteractionType.FREE_TEXT,
          questions,
          missingSections: interruptValue.missingSections as string[],
          followUpRound,
          entryType: interruptValue.entryType as string,
        };

        const followupResult = await this.conversationsRepository.createMessage({
          conversation: new Types.ObjectId(state.conversationId),
          userId: new Types.ObjectId(state.userId),
          role: MessageRole.ASSISTANT,
          messageType: MessageType.TEXT,
          rawContent: content,
          content,
          processingStatus: MessageProcessingStatus.COMPLETE,
          metadata: followupMetadata,
        });

        if (!followupResult.ok) {
          this.logger.error(`Failed to send follow-up questions: ${followupResult.error.message}`);
        }
        break;
      }

      case 'capabilities': {
        const options = interruptValue.options as CapabilityOption[];
        const optionLines = options
          .map(
            (o, i) =>
              `${i + 1}. **${o.code} — ${o.name}** (${Math.round(o.confidence * 100)}% confidence)\n` +
              `   _${o.evidence[0]}_`
          )
          .join('\n');

        const capContent =
          `I've identified the following capabilities in your entry:\n\n${optionLines}\n\n` +
          `Please confirm which capabilities apply, or deselect any that don't fit.`;

        const capMetadata: CapabilityOptionsMetadata = {
          type: MessageMetadataType.CAPABILITY_OPTIONS,
          interactionType: InteractionType.MULTI_SELECT,
          options,
          entryType: interruptValue.entryType as string,
        };

        const capResult = await this.conversationsRepository.createMessage({
          conversation: new Types.ObjectId(state.conversationId),
          userId: new Types.ObjectId(state.userId),
          role: MessageRole.ASSISTANT,
          messageType: MessageType.TEXT,
          rawContent: capContent,
          content: capContent,
          processingStatus: MessageProcessingStatus.COMPLETE,
          metadata: capMetadata,
        });

        if (!capResult.ok) {
          this.logger.error(`Failed to send capability options: ${capResult.error.message}`);
        }
        break;
      }

      // Future interrupt types (review) can be handled here
    }
  }
}
