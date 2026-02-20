import { Command } from '@langchain/langgraph';
import { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import {
  CONVERSATIONS_REPOSITORY,
  IConversationsRepository,
} from '../conversations/conversations.repository.interface';
import { LLMService } from '../llm';
import { buildPortfolioGraph } from './portfolio-graph.builder';

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
    // Cast needed because Mongoose may bundle a slightly different mongodb driver version
    // than @langchain/langgraph-checkpoint-mongodb expects.
    const client = this.connection.getClient() as any;
    this.checkpointer = new MongoDBSaver({ client, dbName: this.connection.db!.databaseName });

    // The JS MongoDBSaver doesn't create indexes (unlike the Python version).
    // Add compound indexes matching its query patterns: getTuple() filters by
    // (thread_id, checkpoint_ns) and sorts by checkpoint_id desc.
    const db = this.connection.db!;
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

    try {
      await this.graph.invoke(
        {
          conversationId: params.conversationId,
          artefactId: params.artefactId,
          userId: params.userId,
          specialty: params.specialty,
        },
        config
      );
    } catch (error) {
      // interrupt() throws a special exception to pause the graph — that's expected.
      // Real errors will have been caught and logged by the nodes.
      if (this.isInterruptError(error)) {
        this.logger.log(`Graph paused (interrupt) for conversation ${conversationId}`);
        return;
      }
      throw error;
    }
  }

  /**
   * Resume a paused graph after the user responds (to follow-up or review).
   * Called when a new message arrives in a conversation that has a paused graph.
   */
  async resumeGraph(conversationId: string, resumeValue?: unknown): Promise<void> {
    const config = { configurable: { thread_id: conversationId } };

    this.logger.log(`Resuming portfolio graph for conversation ${conversationId}`);

    try {
      await this.graph.invoke(new Command({ resume: resumeValue ?? true }), config);
    } catch (error) {
      if (this.isInterruptError(error)) {
        this.logger.log(`Graph paused again (interrupt) for conversation ${conversationId}`);
        return;
      }
      throw error;
    }
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
   * Get the current state of a graph execution.
   * Useful for debugging and for the API to report graph status.
   */
  async getGraphState(conversationId: string) {
    const config = { configurable: { thread_id: conversationId } };
    return this.graph.getState(config);
  }

  /**
   * Check if an error is a LangGraph interrupt (expected when the graph pauses).
   */
  private isInterruptError(error: unknown): boolean {
    if (error instanceof Error) {
      return error.name === 'GraphInterrupt' || error.message.includes('interrupt');
    }
    return false;
  }
}
