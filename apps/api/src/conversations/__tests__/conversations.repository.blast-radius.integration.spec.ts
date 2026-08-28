import {
  ArtefactStatus,
  ConversationStatus,
  MessageRole,
  MessageStatus,
  MessageType,
  Specialty,
} from '@acme/shared';
import { MongooseModule, getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection, Model, Types } from 'mongoose';
import { Artefact, ArtefactDocument, ArtefactSchema } from '../../artefacts/schemas/artefact.schema';
import {
  Exemption,
  OWNER_SEED_COUNT,
  OwnershipContext,
  STRANGER_SEED_COUNT,
  describeOwnershipSuite,
  ownershipSpecFactory,
} from '../../common/testing/ownership-harness';
import { nanoidAlphanumeric } from '../../common/utils/nanoid.util';
import { isOk } from '../../common/utils/result.util';
import { Media, MediaSchema } from '../../media/schemas/media.schema';
import { ConversationsRepository } from '../conversations.repository';
import { CONVERSATIONS_REPOSITORY } from '../conversations.repository.interface';
import {
  Conversation,
  ConversationDocument,
  ConversationSchema,
} from '../schemas/conversation.schema';
import { Message, MessageDocument, MessageSchema } from '../schemas/message.schema';

/**
 * Generated ownership + blast-radius coverage for every ConversationsRepository
 * method.
 *
 * Complements `conversations.repository.ownership.integration.spec.ts`, which
 * keeps the semantics this harness does not generate — idempotency counts,
 * live-filter behaviour, the mixed-batch cascade cases. Around eight methods are
 * asserted from both angles; that overlap is deliberate.
 *
 * First repository here spanning two collections: each seed writes an artefact, a
 * conversation and a message, so `targetKeys` holds three documents and the
 * "nothing outside the target" assertion has to hold across all of them.
 */

const OWNER = new Types.ObjectId();
const STRANGER = new Types.ObjectId();

// Assigned in setup; seeds only ever run inside a test.
let conversationModel: Model<ConversationDocument>;
let messageModel: Model<MessageDocument>;
let artefactModel: Model<ArtefactDocument>;

interface SeededConversation {
  conversation: ConversationDocument;
  message: MessageDocument;
  artefactId: Types.ObjectId;
}

interface SeedOptions {
  /** Status of the seeded user message. COMPLETE unless a spec needs otherwise. */
  messageStatus?: MessageStatus;
  /** Append an assistant message after the user message. */
  withLaterAssistant?: boolean;
}

/**
 * Built through the models rather than through `createConversation` /
 * `createMessage`: a fixture must not depend on the code under test being
 * correct, or a bug in a create path produces malformed fixtures that every
 * downstream spec then agrees with.
 *
 * The artefact is real (not a bare ObjectId) because
 * `findArtefactRefByConversationId` populates it.
 *
 * Parameterised because two predicates cannot be tested against the default
 * fixture: `hasProcessingMessages` returns false for everyone when every message
 * is COMPLETE, and `hasLaterAssistantMessage` returns false for everyone when no
 * assistant message exists. Both would then pass with the owner predicate removed
 * — a green test proving nothing. Each takes the fixture that makes its answer
 * differ between owner and stranger.
 */
async function seedConversation(
  owner: Types.ObjectId,
  options: SeedOptions = {}
): Promise<SeededConversation> {
  const [artefact] = await artefactModel.create([
    {
      artefactId: `${owner.toHexString()}_${new Types.ObjectId().toHexString().slice(-8)}`,
      userId: owner,
      specialty: Specialty.GP,
      trainingStage: 'ST1',
      status: ArtefactStatus.IN_REVIEW,
      title: 'Falls review, Mrs P',
      artefactType: 'CLINICAL_CASE_REVIEW',
    },
  ]);

  const [conversation] = await conversationModel.create([
    {
      userId: owner,
      artefact: artefact._id,
      title: 'Falls review, Mrs P',
      status: ConversationStatus.ACTIVE,
    },
  ]);

  const [message] = await messageModel.create([
    {
      conversation: conversation._id,
      userId: owner,
      role: MessageRole.USER,
      messageType: MessageType.TEXT,
      rawContent: 'Lying and standing BP showed a postural drop.',
      content: 'Lying and standing BP showed a postural drop.',
      status: options.messageStatus ?? MessageStatus.COMPLETE,
      idempotencyKey: nanoidAlphanumeric(),
    },
  ]);

  if (options.withLaterAssistant) {
    // Created after, so its _id sorts above the user message — which is exactly
    // what `hasLaterAssistantMessage` tests for.
    await messageModel.create([
      {
        conversation: conversation._id,
        userId: owner,
        role: MessageRole.ASSISTANT,
        messageType: MessageType.TEXT,
        content: 'What did the lying and standing readings show?',
        status: MessageStatus.COMPLETE,
        idempotencyKey: nanoidAlphanumeric(),
      },
    ]);
  }

  return { conversation, message, artefactId: artefact._id };
}

const spec = ownershipSpecFactory<ConversationsRepository, Types.ObjectId>();

const SPECS = [
  // ─── Conversation reads ───
  spec({
    method: 'findConversationById',
    axis: 'record',
    mutates: false,
    seed: seedConversation,
    call: (repo, target, caller) => repo.findConversationById(target.conversation._id, caller),
    assertOwnerResult: (result, target) => {
      expect(isOk(result) && result.value?.xid).toBe(target.conversation.xid);
    },
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: null }),
  }),
  spec({
    method: 'findConversationByXid',
    axis: 'record',
    mutates: false,
    seed: seedConversation,
    call: (repo, target, caller) => repo.findConversationByXid(target.conversation.xid, caller),
    assertOwnerResult: (result, target) => {
      expect(isOk(result) && result.value?.xid).toBe(target.conversation.xid);
    },
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: null }),
  }),
  spec({
    method: 'findActiveConversationByArtefact',
    axis: 'record',
    mutates: false,
    seed: seedConversation,
    call: (repo, target, caller) => repo.findActiveConversationByArtefact(target.artefactId, caller),
    assertOwnerResult: (result, target) => {
      expect(isOk(result) && result.value?.xid).toBe(target.conversation.xid);
    },
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: null }),
  }),
  spec({
    method: 'findActiveConversationsByArtefacts',
    axis: 'record',
    mutates: false,
    seed: seedConversation,
    call: (repo, target, caller) =>
      repo.findActiveConversationsByArtefacts([target.artefactId], caller),
    assertOwnerResult: (result, target) => {
      const found = isOk(result) ? result.value.get(target.artefactId.toString()) : undefined;
      expect(found?.xid).toBe(target.conversation.xid);
    },
    assertForeignResult: (result) => {
      expect(isOk(result) && result.value.size).toBe(0);
    },
  }),
  spec({
    method: 'findArtefactRefByConversationId',
    axis: 'record',
    mutates: false,
    seed: seedConversation,
    call: (repo, target, caller) =>
      repo.findArtefactRefByConversationId(target.conversation._id, caller),
    assertOwnerResult: (result) => {
      expect(isOk(result) && result.value?.artefactType).toBe('CLINICAL_CASE_REVIEW');
    },
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: null }),
  }),
  spec({
    // Owner-scoped despite being a read: its output is the target list for a HARD
    // delete of LangGraph checkpoints, which has no userId of its own to filter on.
    method: 'findIdsByArtefactIds',
    axis: 'record',
    mutates: false,
    seed: seedConversation,
    call: (repo, target, caller) => repo.findIdsByArtefactIds([target.artefactId], caller),
    assertOwnerResult: (result, target) => {
      expect(isOk(result) && result.value.map((id) => id.toString())).toEqual([
        target.conversation._id.toString(),
      ]);
    },
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: [] }),
  }),

  // ─── Message reads ───
  spec({
    method: 'findMessageById',
    axis: 'record',
    mutates: false,
    seed: seedConversation,
    call: (repo, target, caller) => repo.findMessageById(target.message._id, caller),
    assertOwnerResult: (result, target) => {
      expect(isOk(result) && result.value?.xid).toBe(target.message.xid);
    },
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: null }),
  }),
  spec({
    method: 'findMessagesByXids',
    axis: 'record',
    mutates: false,
    seed: seedConversation,
    call: (repo, target, caller) => repo.findMessagesByXids([target.message.xid], caller),
    assertOwnerResult: (result, target) => {
      expect(isOk(result) && result.value.map((m) => m.xid)).toEqual([target.message.xid]);
    },
    assertForeignResult: (result) => {
      expect(isOk(result) && result.value).toEqual([]);
    },
  }),
  spec({
    method: 'findMessageByIdempotencyKey',
    axis: 'record',
    mutates: false,
    seed: seedConversation,
    call: (repo, target, caller) =>
      repo.findMessageByIdempotencyKey(caller, target.message.idempotencyKey),
    assertOwnerResult: (result, target) => {
      expect(isOk(result) && result.value?.xid).toBe(target.message.xid);
    },
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: null }),
  }),
  spec({
    method: 'listMessages',
    axis: 'record',
    mutates: false,
    seed: seedConversation,
    call: (repo, target, caller) =>
      repo.listMessages({ conversation: target.conversation._id, userId: caller }),
    assertOwnerResult: (result, target) => {
      expect(isOk(result) && result.value.messages.map((m) => m.xid)).toEqual([target.message.xid]);
    },
    assertForeignResult: (result) => {
      expect(isOk(result) && result.value.messages).toEqual([]);
    },
  }),

  // ─── Conversation-state predicates ───
  spec({
    method: 'hasCompleteMessages',
    axis: 'record',
    mutates: false,
    seed: seedConversation,
    call: (repo, target, caller) => repo.hasCompleteMessages(target.conversation._id, caller),
    assertOwnerResult: (result) => expect(result).toEqual({ ok: true, value: true }),
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: false }),
  }),
  spec({
    method: 'hasProcessingMessages',
    axis: 'record',
    mutates: false,
    // PENDING is in PROCESSING_MESSAGE_STATUSES, so the owner sees `true` where a
    // stranger must see `false`. With the default COMPLETE fixture both would be
    // `false` and the case could not detect a missing owner predicate.
    seed: (owner) => seedConversation(owner, { messageStatus: MessageStatus.PENDING }),
    call: (repo, target, caller) => repo.hasProcessingMessages(target.conversation._id, caller),
    assertOwnerResult: (result) => expect(result).toEqual({ ok: true, value: true }),
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: false }),
  }),
  spec({
    method: 'getLastMessageRole',
    axis: 'record',
    mutates: false,
    seed: seedConversation,
    call: (repo, target, caller) => repo.getLastMessageRole(target.conversation._id, caller),
    assertOwnerResult: (result) => expect(result).toEqual({ ok: true, value: MessageRole.USER }),
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: null }),
  }),
  spec({
    method: 'hasLaterAssistantMessage',
    axis: 'record',
    mutates: false,
    // Needs an assistant message after the user message, or the answer is `false`
    // for owner and stranger alike and the case proves nothing.
    seed: (owner) => seedConversation(owner, { withLaterAssistant: true }),
    call: (repo, target, caller) =>
      repo.hasLaterAssistantMessage(target.conversation._id, target.message._id, caller),
    assertOwnerResult: (result) => expect(result).toEqual({ ok: true, value: true }),
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: false }),
  }),

  // ─── Message writes ───
  spec({
    method: 'updateMessage',
    axis: 'record',
    mutates: true,
    seed: seedConversation,
    call: (repo, target, caller) =>
      repo.updateMessage(target.message._id, caller, { content: 'rewritten' }),
    assertOwnerResult: (result) => {
      expect(isOk(result) && result.value?.content).toBe('rewritten');
    },
    // Null is the existing "missing or deleted" contract — callers no-op on it.
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: null }),
  }),
  spec({
    method: 'updateMessageIfRawContentPresent',
    axis: 'record',
    mutates: true,
    seed: seedConversation,
    call: (repo, target, caller) =>
      repo.updateMessageIfRawContentPresent(target.message._id, caller, {
        redactedContent: 'redacted',
      }),
    assertOwnerResult: (result) => {
      expect(isOk(result) && result.value?.redactedContent).toBe('redacted');
    },
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: null }),
  }),

  // ─── Cascade tombstones (bulk writes over caller-supplied id lists) ───
  spec({
    method: 'markDeleted',
    axis: 'record',
    mutates: true,
    seed: seedConversation,
    call: (repo, target, caller) => repo.markDeleted([target.conversation._id], caller),
    assertOwnerResult: (result) => expect(result).toEqual({ ok: true, value: 1 }),
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: 0 }),
  }),
  spec({
    method: 'markDeletedMessagesByIds',
    axis: 'record',
    mutates: true,
    seed: seedConversation,
    call: (repo, target, caller) => repo.markDeletedMessagesByIds([target.message._id], caller),
    assertOwnerResult: (result) => expect(result).toEqual({ ok: true, value: 1 }),
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: 0 }),
  }),
  spec({
    method: 'markDeletedMessagesByConversationIds',
    axis: 'record',
    mutates: true,
    seed: seedConversation,
    call: (repo, target, caller) =>
      repo.markDeletedMessagesByConversationIds([target.conversation._id], caller),
    assertOwnerResult: (result) => expect(result).toEqual({ ok: true, value: 1 }),
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: 0 }),
  }),

  // ─── owner axis: keyed by the owner alone ───
  spec({
    method: 'findConversationIdsByUser',
    axis: 'owner',
    mutates: false,
    seed: seedConversation,
    call: (repo, _target, caller) => repo.findConversationIdsByUser(caller),
    assertOwnerResult: (result) => {
      expect(isOk(result) && result.value).toHaveLength(OWNER_SEED_COUNT);
    },
    assertForeignResult: (result) => {
      expect(isOk(result) && result.value).toHaveLength(STRANGER_SEED_COUNT);
    },
  }),
  spec({
    // Writes to BOTH collections and returns the combined modified count, so the
    // owner expectation is one conversation plus one message per seed.
    method: 'markDeletedByUserId',
    axis: 'owner',
    mutates: true,
    seed: seedConversation,
    call: (repo, _target, caller) => repo.markDeletedByUserId(caller),
    assertOwnerResult: (result) =>
      expect(result).toEqual({ ok: true, value: OWNER_SEED_COUNT * 2 }),
    assertForeignResult: (result) =>
      expect(result).toEqual({ ok: true, value: STRANGER_SEED_COUNT * 2 }),
  }),
];

const EXEMPT: Exemption[] = [
  {
    method: 'createConversation',
    kind: 'payload-scoped',
    reason:
      'Insert only. The owner arrives in CreateConversationData and is written to the ' +
      'new document; no filter is applied and no existing record is reachable.',
  },
  {
    method: 'createMessage',
    kind: 'payload-scoped',
    reason:
      'Insert only for the message. It also bumps the parent conversation\'s updatedAt ' +
      'by _id without a userId — safe because that _id is not caller-supplied: it comes ' +
      'from CreateMessageData.conversation, which the service resolves through an ' +
      'owner-scoped read first. Worth revisiting if a caller ever passes a raw id.',
  },
  {
    method: 'findMessageIdsByConversationIds',
    kind: 'global-by-design',
    reason:
      'Takes conversation ids already resolved under user scope by findIdsByArtefactIds ' +
      'or findConversationIdsByUser, and is used only as the input to a cascade whose ' +
      'own writes are owner-scoped. Adding userId here would be harmless but would imply ' +
      'the ids are untrusted, which they are not.',
  },
  {
    method: 'findExpiredRawContentBatchAcrossAllUsers',
    kind: 'global-by-design',
    reason:
      'Retention sweep (C-2). Scans every user by design, selecting on rawContent age ' +
      'alone; the name carries the hazard. It has no caller-supplied ids and writes ' +
      'nothing.',
  },
  {
    method: 'scrubRawContentAcrossAllUsers',
    kind: 'global-by-design',
    reason:
      'Retention sweep (C-2). Writes to ids produced by ' +
      'findExpiredRawContentBatchAcrossAllUsers in the same tick — deliberately not ' +
      'user-scoped, since the whole point is to expire raw content for every user.',
  },
];

describeOwnershipSuite<ConversationsRepository, Types.ObjectId>({
  name: 'ConversationsRepository',
  repoClass: ConversationsRepository,
  owner: OWNER,
  stranger: STRANGER,
  specs: SPECS,
  exempt: EXEMPT,
  setup: async (): Promise<OwnershipContext<ConversationsRepository>> => {
    const mongod = await MongoMemoryServer.create();
    const module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: Conversation.name, schema: ConversationSchema },
          { name: Message.name, schema: MessageSchema },
          { name: Media.name, schema: MediaSchema },
          // Registered because findArtefactRefByConversationId populates it.
          { name: Artefact.name, schema: ArtefactSchema },
        ]),
      ],
      providers: [{ provide: CONVERSATIONS_REPOSITORY, useClass: ConversationsRepository }],
    }).compile();

    await module.init();
    conversationModel = module.get<Model<ConversationDocument>>(getModelToken(Conversation.name));
    messageModel = module.get<Model<MessageDocument>>(getModelToken(Message.name));
    artefactModel = module.get<Model<ArtefactDocument>>(getModelToken(Artefact.name));

    return {
      repo: module.get(CONVERSATIONS_REPOSITORY),
      connection: module.get<Connection>(getConnectionToken()),
      teardown: async () => {
        await module.close();
        await mongod.stop();
      },
    };
  },
});
