import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Connection, Model } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';

import { ConversationsService } from '../../conversations.service';
import { ConversationsRepository } from '../../conversations.repository';
import {
  CONVERSATIONS_REPOSITORY,
  IConversationsRepository,
} from '../../conversations.repository.interface';
import { Conversation, ConversationDocument, ConversationSchema } from '../../schemas/conversation.schema';
import { Message, MessageDocument, MessageSchema } from '../../schemas/message.schema';
import { Media, MediaSchema } from '../../../media/schemas/media.schema';
import { TransactionService } from '../../../database/transaction.service';
import { PortfolioGraphService } from '../../../portfolio-graph/portfolio-graph.service';
import { LLMService } from '../../../llm/llm.service';
import { ProcessingService } from '../../../processing/processing.service';
import { MediaService } from '../../../media/media.service';
import { MEDIA_REPOSITORY } from '../../../media/media.repository.interface';
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
  graphService: PortfolioGraphService;
  repo: IConversationsRepository;
  connection: Connection;
}

export async function createTestHarness(llmMock: SequentialLLMMock): Promise<TestHarness> {
  // Use replica set so Mongoose transactions work (they require oplog)
  const mongod = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  const uri = mongod.getUri();

  const module = await Test.createTestingModule({
    imports: [
      MongooseModule.forRoot(uri),
      MongooseModule.forFeature([
        { name: Conversation.name, schema: ConversationSchema },
        { name: Message.name, schema: MessageSchema },
        // Media schema needed for .populate('media') in listMessages
        { name: Media.name, schema: MediaSchema },
      ]),
    ],
    providers: [
      // Real services
      ConversationsService,
      {
        provide: CONVERSATIONS_REPOSITORY,
        useClass: ConversationsRepository,
      },
      TransactionService,
      PortfolioGraphService,

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
  const conversationModel = module.get<Model<ConversationDocument>>(getModelToken(Conversation.name));
  const messageModel = module.get<Model<MessageDocument>>(getModelToken(Message.name));

  // Initialise factory helpers with the real models
  initFactories(conversationModel, messageModel);

  // Warm up the replica set: do a write+read to ensure the oplog and
  // checkpoint collections are fully operational before tests start.
  // Without this, the first graph invocation may see a stale/empty checkpoint.
  const warmupCollection = connection.db!.collection('_warmup');
  await warmupCollection.insertOne({ ts: Date.now() });
  await warmupCollection.findOne({});
  await warmupCollection.drop();

  return {
    module,
    mongod,
    service: module.get(ConversationsService),
    graphService: module.get(PortfolioGraphService),
    repo: module.get(CONVERSATIONS_REPOSITORY),
    connection,
  };
}

/**
 * Drop all documents from relevant collections between tests.
 * Preserves indexes but clears data for isolation.
 */
export async function cleanupDatabase(connection: Connection): Promise<void> {
  const collections = connection.db!.collections();
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
