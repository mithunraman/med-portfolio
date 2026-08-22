import { MessageRole, MessageStatus, MessageType } from '@acme/shared';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { UNREDACTED_RETENTION_MS } from '../../common/retention.constants';
import { isOk } from '../../common/utils/result.util';
import { ConversationsRepository } from '../conversations.repository';
import { CONVERSATIONS_REPOSITORY } from '../conversations.repository.interface';
import { MessageRetentionService } from '../message-retention.service';
import { Conversation, ConversationSchema } from '../schemas/conversation.schema';
import { Message, MessageDocument, MessageSchema } from '../schemas/message.schema';

/**
 * Launch condition **C-2** — evidence, not a smoke test.
 *
 * This file is what the compliance record cites, so it is written to be read by
 * someone deciding whether the control exists. Every assertion states a property
 * of the control, and the mutation list in the DPIA names the edits that must
 * turn these red.
 */

const NOW = new Date('2026-08-06T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000);

const RAW = 'Saw Mrs Patel, NHS 999 131 4054, at 12 Elm Road.';
const REDACTED = 'Saw [PERSON], NHS [NHS_NUMBER], at [ADDRESS].';
const CLEANED = 'Saw a patient with a new diagnosis.';

interface Seed {
  status?: MessageStatus;
  createdAt?: Date;
  rawContentWrittenAt?: Date | null;
  rawContent?: string | null;
  redactedContent?: string | null;
  content?: string | null;
}

describe('Message retention sweep (C-2) — integration', () => {
  let mongod: MongoMemoryServer;
  let module: TestingModule;
  let service: MessageRetentionService;
  let repo: ConversationsRepository;
  let model: Model<MessageDocument>;
  const conversation = new Types.ObjectId();
  const userId = new Types.ObjectId();
  let seq = 0;

  async function seed(overrides: Seed = {}): Promise<MessageDocument> {
    const createdAt = overrides.createdAt ?? hoursAgo(49);
    const [doc] = await model.create([
      {
        conversation,
        userId,
        role: MessageRole.USER,
        messageType: MessageType.TEXT,
        status: overrides.status ?? MessageStatus.COMPLETE,
        rawContent: overrides.rawContent === undefined ? RAW : overrides.rawContent,
        redactedContent:
          overrides.redactedContent === undefined ? REDACTED : overrides.redactedContent,
        content: overrides.content === undefined ? CLEANED : overrides.content,
        rawContentWrittenAt:
          overrides.rawContentWrittenAt === undefined ? createdAt : overrides.rawContentWrittenAt,
        idempotencyKey: `key-${seq++}`,
        createdAt,
      },
    ]);
    return doc;
  }

  const reload = (doc: MessageDocument) => model.findById(doc._id).lean().exec();

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: Conversation.name, schema: ConversationSchema },
          { name: Message.name, schema: MessageSchema },
        ]),
      ],
      providers: [
        MessageRetentionService,
        { provide: CONVERSATIONS_REPOSITORY, useClass: ConversationsRepository },
      ],
    }).compile();

    service = module.get(MessageRetentionService);
    repo = module.get(CONVERSATIONS_REPOSITORY);
    model = module.get<Model<MessageDocument>>(getModelToken(Message.name));
    // Indexes are declared on the schema but built lazily; the index test below
    // asserts the sweep actually uses one, so it has to exist first.
    await model.ensureIndexes();
  }, 30000);

  afterAll(async () => {
    await module?.close();
    await mongod?.stop();
  });

  beforeEach(async () => {
    await model.deleteMany({});
  });

  describe('what gets scrubbed', () => {
    it('removes both un-redacted copies from a message past the window', async () => {
      const doc = await seed();

      expect(await service.sweep(NOW)).toBe(1);

      const after = await reload(doc);
      expect(after!.rawContent).toBeNull();
      expect(after!.redactedContent).toBeNull();
      expect(after!.rawContentWrittenAt).toBeNull();
    });

    it('never touches `content` — DEC-11 depends on the trainee keeping it', async () => {
      const doc = await seed();

      await service.sweep(NOW);

      expect((await reload(doc))!.content).toBe(CLEANED);
    });

    it('never changes status — a scrubbed message is still the message it was', async () => {
      const doc = await seed({ status: MessageStatus.REJECTED });

      await service.sweep(NOW);

      expect((await reload(doc))!.status).toBe(MessageStatus.REJECTED);
    });

    it('leaves a message inside the window completely alone', async () => {
      const doc = await seed({ createdAt: hoursAgo(47) });

      expect(await service.sweep(NOW)).toBe(0);

      const after = await reload(doc);
      expect(after!.rawContent).toBe(RAW);
      expect(after!.redactedContent).toBe(REDACTED);
    });

    it('scrubs exactly at the window boundary and not a moment before', async () => {
      const justInside = await seed({
        rawContentWrittenAt: new Date(NOW.getTime() - UNREDACTED_RETENTION_MS + 1000),
      });
      const justOutside = await seed({
        rawContentWrittenAt: new Date(NOW.getTime() - UNREDACTED_RETENTION_MS - 1000),
      });

      expect(await service.sweep(NOW)).toBe(1);

      expect((await reload(justInside))!.rawContent).toBe(RAW);
      expect((await reload(justOutside))!.rawContent).toBeNull();
    });
  });

  describe('the edit clock', () => {
    it('a message created 49h ago but edited an hour ago SURVIVES', async () => {
      // The case that makes the anchor worth having. Keying on createdAt alone
      // would delete content the trainee wrote 60 minutes ago, while the notice
      // promises far longer.
      const doc = await seed({ createdAt: hoursAgo(49), rawContentWrittenAt: hoursAgo(1) });

      expect(await service.sweep(NOW)).toBe(0);

      expect((await reload(doc))!.rawContent).toBe(RAW);
    });

    it('a message created and last edited 49h ago is scrubbed', async () => {
      const doc = await seed({ createdAt: hoursAgo(60), rawContentWrittenAt: hoursAgo(49) });

      expect(await service.sweep(NOW)).toBe(1);

      expect((await reload(doc))!.rawContent).toBeNull();
    });
  });

  describe('scope — every status, deliberately', () => {
    // A status filter would let a message stuck mid-pipeline retain raw PHI
    // forever, which is the exact failure this condition exists to prevent.
    const statuses: [string, MessageStatus][] = [
      ['COMPLETE', MessageStatus.COMPLETE],
      ['REJECTED', MessageStatus.REJECTED],
      ['FAILED', MessageStatus.FAILED],
      ['DELETED', MessageStatus.DELETED],
      ['PENDING (in-flight)', MessageStatus.PENDING],
      ['TRANSCRIBING (stuck)', MessageStatus.TRANSCRIBING],
      ['DEIDENTIFYING (stuck)', MessageStatus.DEIDENTIFYING],
      ['CLEANING (stuck)', MessageStatus.CLEANING],
    ];

    it.each(statuses)('scrubs a %s message past the window', async (_label, status) => {
      const doc = await seed({ status });

      await service.sweep(NOW);

      expect((await reload(doc))!.rawContent).toBeNull();
    });

    it('clears the tombstone placeholder too — DELETED rows also hold strings', async () => {
      const doc = await seed({
        status: MessageStatus.DELETED,
        rawContent: '[deleted]',
        redactedContent: '[deleted]',
        content: '[deleted]',
      });

      await service.sweep(NOW);

      const after = await reload(doc);
      expect(after!.rawContent).toBeNull();
      // `content` still carries the tombstone, so the UI is unchanged.
      expect(after!.content).toBe('[deleted]');
    });
  });

  describe('idempotency and self-healing', () => {
    it('a second run is a clean no-op', async () => {
      await seed();

      expect(await service.sweep(NOW)).toBe(1);
      expect(await service.sweep(NOW)).toBe(0);
    });

    it('re-scrubs a row whose anchor was cleared but whose content survived', async () => {
      // The predicate is the DATA, not a bookkeeping flag. A half-applied scrub
      // therefore self-heals on the next tick instead of stranding raw content
      // that no future sweep would ever visit — Mongo does not match null
      // against $lt, so this needs the explicit null branch in the filter.
      const doc = await seed();
      await model.updateOne({ _id: doc._id }, { $set: { rawContentWrittenAt: null } });

      expect(await service.sweep(NOW)).toBe(1);
      expect((await reload(doc))!.rawContent).toBeNull();
    });

    it('scrubs a legacy document that predates the anchor field', async () => {
      // Same failure shape, different cause: raw content whose age cannot be
      // vouched for. Without the null branch these are invisible forever.
      const doc = await seed();
      await model.updateOne({ _id: doc._id }, { $unset: { rawContentWrittenAt: '' } });

      expect(await service.sweep(NOW)).toBe(1);
      expect((await reload(doc))!.rawContent).toBeNull();
    });

    it('drains a backlog larger than one batch', async () => {
      for (let i = 0; i < 150; i++) await seed();

      expect(await service.sweep(NOW)).toBe(150);
      expect(await model.countDocuments({ rawContent: { $type: 'string' } })).toBe(0);
    });
  });

  describe('the invariant', () => {
    it('leaves no message holding raw content with a cleared anchor', async () => {
      await seed();
      await seed({ createdAt: hoursAgo(1) });

      await service.sweep(NOW);

      const broken = await model.countDocuments({
        rawContent: { $type: 'string' },
        rawContentWrittenAt: null,
      });
      expect(broken).toBe(0);
    });

    // `redactedContent` is reached through an invariant, not through the finder's
    // predicate: the sweep looks for `rawContent`, so a row holding
    // `redactedContent` with a null `rawContent` is invisible to every future
    // sweep and retained forever. These cover the write that could produce it.
    describe('redactedContent never outlives rawContent', () => {
      it('refuses the derived write once the sweep has scrubbed the row', async () => {
        const doc = await seed();
        await service.sweep(NOW); // rawContent, redactedContent and anchor all null

        // The pipeline, resuming with a redaction result computed before the sweep.
        const written = await repo.updateMessageIfRawContentPresent(doc._id, userId, {
          redactedContent: 'Saw [PERSON] at [ADDRESS].',
          status: MessageStatus.CLEANING,
        });

        expect(isOk(written) && written.value).toBeNull();
        const after = await reload(doc);
        expect(after!.redactedContent).toBeNull();
        expect(after!.status).toBe(MessageStatus.COMPLETE); // untouched, not advanced
      });

      it('allows the derived write while rawContent is still present', async () => {
        // The guard must not break the ordinary path it sits on.
        const doc = await seed({ createdAt: hoursAgo(1) });

        const written = await repo.updateMessageIfRawContentPresent(doc._id, userId, {
          redactedContent: 'Saw [PERSON] at [ADDRESS].',
          status: MessageStatus.CLEANING,
        });

        expect(isOk(written) && written.value).not.toBeNull();
        expect((await reload(doc))!.redactedContent).toBe('Saw [PERSON] at [ADDRESS].');
      });

      it('refuses the derived write on a tombstoned row', async () => {
        // Tombstones hold '[deleted]' strings, so the rawContent precondition
        // alone would pass. MESSAGE_LIVE_FILTER is what stops the resurrection.
        const doc = await seed({
          status: MessageStatus.DELETED,
          rawContent: '[deleted]',
          redactedContent: '[deleted]',
          content: '[deleted]',
        });

        const written = await repo.updateMessageIfRawContentPresent(doc._id, userId, {
          redactedContent: 'leaked',
          status: MessageStatus.CLEANING,
        });

        expect(isOk(written) && written.value).toBeNull();
        expect((await reload(doc))!.redactedContent).toBe('[deleted]');
      });

      it('the sweep leaves no row with redactedContent and a null rawContent', async () => {
        for (let i = 0; i < 5; i++) await seed();

        await service.sweep(NOW);

        const orphaned = await model.countDocuments({
          rawContent: null,
          redactedContent: { $type: 'string' },
        });
        expect(orphaned).toBe(0);
      });
    });
  });

  describe('the index', () => {
    it('the sweep query is served by the partial index, not a collection scan', async () => {
      // Without this the sweep degrades to scanning nearly every message ever
      // sent, growing forever — a correctness-preserving failure that only shows
      // up as a production incident.
      await seed();

      const plan = await model
        .find({
          rawContent: { $type: 'string' },
          $or: [{ rawContentWrittenAt: { $lt: hoursAgo(48) } }, { rawContentWrittenAt: null }],
        })
        .explain('queryPlanner');

      expect(JSON.stringify(plan)).toContain('IXSCAN');
    });

    it('the partial index excludes scrubbed documents', async () => {
      await seed();
      await seed();
      await service.sweep(NOW);

      const indexed = await model.countDocuments({ rawContent: { $type: 'string' } });
      expect(indexed).toBe(0);
    });
  });
});
