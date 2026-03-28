import { EventEmitterModule } from '@nestjs/event-emitter';
import { MongooseModule, getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Connection, Model } from 'mongoose';

import { AnalysisRunListener } from '../../../analysis-runs/analysis-run.listener';
import { AnalysisRunsRepository } from '../../../analysis-runs/analysis-runs.repository';
import { ANALYSIS_RUNS_REPOSITORY } from '../../../analysis-runs/analysis-runs.repository.interface';
import { AnalysisRunsService } from '../../../analysis-runs/analysis-runs.service';
import {
  AnalysisRun,
  AnalysisRunSchema as AnalysisRunMongooseSchema,
} from '../../../analysis-runs/schemas/analysis-run.schema';
import { ArtefactsRepository } from '../../../artefacts/artefacts.repository';
import { ARTEFACTS_REPOSITORY } from '../../../artefacts/artefacts.repository.interface';
import {
  Artefact,
  ArtefactDocument,
  ArtefactSchema,
} from '../../../artefacts/schemas/artefact.schema';
import { TransactionService } from '../../../database/transaction.service';
import { LLMService } from '../../../llm/llm.service';
import { MEDIA_REPOSITORY } from '../../../media/media.repository.interface';
import { MediaService } from '../../../media/media.service';
import { Media, MediaSchema } from '../../../media/schemas/media.schema';
import { AnalysisResumeHandler } from '../../../outbox/handlers/analysis-resume.handler';
import { AnalysisStartHandler } from '../../../outbox/handlers/analysis-start.handler';
import { OUTBOX_HANDLERS, OutboxConsumer } from '../../../outbox/outbox.consumer';
import { OutboxRepository } from '../../../outbox/outbox.repository';
import { OUTBOX_REPOSITORY } from '../../../outbox/outbox.repository.interface';
import { OutboxService } from '../../../outbox/outbox.service';
import { OutboxEntry, OutboxEntrySchema } from '../../../outbox/schemas/outbox.schema';
import { PdpGoalsRepository } from '../../../pdp-goals/pdp-goals.repository';
import { PDP_GOALS_REPOSITORY } from '../../../pdp-goals/pdp-goals.repository.interface';
import {
  PdpGoal,
  PdpGoalDocument,
  PdpGoalSchema as PdpGoalMongooseSchema,
} from '../../../pdp-goals/schemas/pdp-goal.schema';
import { PortfolioGraphService } from '../../../portfolio-graph/portfolio-graph.service';
import { MessageProcessingHandler } from '../../../outbox/handlers/message-processing.handler';
import { ProcessingService } from '../../../processing/processing.service';
import { ConversationContextService } from '../../conversation-context.service';
import { ConversationsRepository } from '../../conversations.repository';
import {
  CONVERSATIONS_REPOSITORY,
  IConversationsRepository,
} from '../../conversations.repository.interface';
import { ConversationsService } from '../../conversations.service';
import {
  Conversation,
  ConversationDocument,
  ConversationSchema,
} from '../../schemas/conversation.schema';
import { Message, MessageDocument, MessageSchema } from '../../schemas/message.schema';
import { MetricsService } from '../../../common/metrics';
import { initFactories } from './factories';
import type { SequentialLLMMock } from './llm-mock';

/**
 * Integration test harness.
 *
 * Wires up:
 *  - Real: ConversationsService, ConversationsRepository, PortfolioGraphService, TransactionService
 *  - Real: MongoDB replica set via MongoMemoryReplSet (supports transactions + checkpointing)
 *  - Mocked: LLMService (via SequentialLLMMock), ProcessingService, MediaService, MediaRepository
 */
export interface TestHarness {
  module: TestingModule;
  mongod: MongoMemoryReplSet;
  service: ConversationsService;
  analysisRunsService: AnalysisRunsService;
  repo: IConversationsRepository;
  connection: Connection;
}

export async function createTestHarness(llmMock: SequentialLLMMock): Promise<TestHarness> {
  // Use replica set so Mongoose transactions work (they require oplog)
  const mongod = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
    instanceOpts: [
      { args: ['--setParameter', 'maxTransactionLockRequestTimeoutMillis=5000'] },
    ],
  });
  const uri = mongod.getUri();

  const module = await Test.createTestingModule({
    imports: [
      EventEmitterModule.forRoot(),
      MongooseModule.forRoot(uri),
      MongooseModule.forFeature([
        { name: Conversation.name, schema: ConversationSchema },
        { name: Message.name, schema: MessageSchema },
        // Media schema needed for .populate('media') in listMessages
        { name: Media.name, schema: MediaSchema },
        { name: Artefact.name, schema: ArtefactSchema },
        { name: PdpGoal.name, schema: PdpGoalMongooseSchema },
        { name: AnalysisRun.name, schema: AnalysisRunMongooseSchema },
        { name: OutboxEntry.name, schema: OutboxEntrySchema },
      ]),
    ],
    providers: [
      // Real services
      ConversationsService,
      ConversationContextService,
      {
        provide: CONVERSATIONS_REPOSITORY,
        useClass: ConversationsRepository,
      },
      TransactionService,
      PortfolioGraphService,
      {
        provide: ARTEFACTS_REPOSITORY,
        useClass: ArtefactsRepository,
      },
      {
        provide: PDP_GOALS_REPOSITORY,
        useClass: PdpGoalsRepository,
      },

      // Analysis runs — real service + repository + listener
      AnalysisRunsService,
      AnalysisRunListener,
      {
        provide: ANALYSIS_RUNS_REPOSITORY,
        useClass: AnalysisRunsRepository,
      },

      // Outbox — real service + repository + consumer + handlers
      OutboxService,
      {
        provide: OUTBOX_REPOSITORY,
        useClass: OutboxRepository,
      },
      AnalysisStartHandler,
      AnalysisResumeHandler,
      MessageProcessingHandler,
      {
        provide: OUTBOX_HANDLERS,
        useFactory: (
          start: AnalysisStartHandler,
          resume: AnalysisResumeHandler,
          processing: MessageProcessingHandler,
        ) => [start, resume, processing],
        inject: [AnalysisStartHandler, AnalysisResumeHandler, MessageProcessingHandler],
      },
      OutboxConsumer,

      // Mock PinoLogger for OutboxConsumer
      {
        provide: 'PinoLogger:OutboxConsumer',
        useValue: {
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
          debug: jest.fn(),
          trace: jest.fn(),
          setContext: jest.fn(),
          assign: jest.fn(),
        },
      },

      // Mock MetricsService
      {
        provide: MetricsService,
        useValue: {
          recordOutboxQueueDepth: jest.fn(),
          recordOutboxJobStart: jest.fn(),
          recordOutboxJobEnd: jest.fn(),
          recordOutboxJobFailure: jest.fn(),
        },
      },

      // Mocked LLMService — replaced by SequentialLLMMock
      {
        provide: LLMService,
        useValue: llmMock.build(),
      },

      // Mocked ProcessingService — no-op (we manually set message status)
      {
        provide: ProcessingService,
        useValue: {
          processMessage: jest.fn().mockResolvedValue(undefined),
        },
      },

      // Mocked MediaService — not used in text-only tests
      {
        provide: MediaService,
        useValue: {
          validateMediaUpload: jest.fn(),
          getPresignedUrl: jest.fn(),
        },
      },

      // Mocked MediaRepository — not used in text-only tests
      {
        provide: MEDIA_REPOSITORY,
        useValue: {
          updateStatus: jest.fn(),
        },
      },
    ],
  }).compile();

  // Initialise the module (triggers PortfolioGraphService.onModuleInit)
  await module.init();

  const connection = module.get<Connection>(getConnectionToken());
  const conversationModel = module.get<Model<ConversationDocument>>(
    getModelToken(Conversation.name)
  );
  const messageModel = module.get<Model<MessageDocument>>(getModelToken(Message.name));
  const artefactModel = module.get<Model<ArtefactDocument>>(getModelToken(Artefact.name));
  const pdpGoalModel = module.get<Model<PdpGoalDocument>>(getModelToken(PdpGoal.name));

  // Initialise factory helpers with the real models
  initFactories(conversationModel, messageModel, artefactModel, pdpGoalModel);

  // Warm up the replica set: do a write+read to ensure the oplog and
  // checkpoint collections are fully operational before tests start.
  // Without this, the first graph invocation may see a stale/empty checkpoint.
  if (!connection.db) throw new Error('Database not connected');
  const warmupCollection = connection.db.collection('_warmup');
  await warmupCollection.insertOne({ ts: Date.now() });
  await warmupCollection.findOne({});
  await warmupCollection.drop();

  return {
    module,
    mongod,
    service: module.get(ConversationsService),
    analysisRunsService: module.get(AnalysisRunsService),
    repo: module.get(CONVERSATIONS_REPOSITORY),
    connection,
  };
}

/**
 * Drop all documents from relevant collections between tests.
 * Preserves indexes but clears data for isolation.
 */
export async function cleanupDatabase(connection: Connection): Promise<void> {
  if (!connection.db) throw new Error('Database not connected');
  const collections = connection.db.collections();
  for (const collection of await collections) {
    await collection.deleteMany({});
  }
}

/**
 * Tear down the test harness: close NestJS module + stop MongoMemoryReplSet.
 */
export async function destroyTestHarness(harness: TestHarness): Promise<void> {
  await harness.module.close();
  await harness.mongod.stop();
}
