import { MediaRefCollection, MediaStatus, MediaType } from '@acme/shared';
import { MongooseModule, getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection, Model, Types } from 'mongoose';
import {
  Exemption,
  OWNER_SEED_COUNT,
  OwnershipContext,
  STRANGER_SEED_COUNT,
  describeOwnershipSuite,
  ownershipSpecFactory,
} from '../../common/testing/ownership-harness';
import { nanoidAlphanumeric } from '../../common/utils/nanoid.util';
import { isErr, isOk } from '../../common/utils/result.util';
import { MediaRepository } from '../media.repository';
import { MEDIA_REPOSITORY } from '../media.repository.interface';
import { Media, MediaDocument, MediaSchema } from '../schemas/media.schema';

/**
 * Generated ownership + blast-radius coverage for MediaRepository.
 *
 * A media row is the pointer to a consultation recording: `bucket` + `key` locate
 * the object in storage, and the audio is un-redacted by nature — the trainee's
 * voice speaking the patient's name. A lost owner predicate hands out the handle
 * to someone else's recording.
 *
 * Six of eleven methods are worker-global by design, so the EXEMPTION REASONS
 * carry more weight here than the specs do. `markDeleted` and
 * `incrementDeleteAttempts` take ids with no owner predicate at all — the same
 * shape as `purgeThreads`, but soft — and their safety lives in
 * `findPendingDeleteBatch` supplying those ids. Each reason names that chain.
 */

const OWNER = new Types.ObjectId();
const STRANGER = new Types.ObjectId();

/** Seeded size, so `updateStatus` can write a different one and produce a real diff. */
const SEEDED_SIZE_BYTES = 1_000;
const UPDATED_SIZE_BYTES = 4_242;

// Assigned in setup; the seed builder only ever runs inside a test.
let mediaModel: Model<MediaDocument>;

interface SeededMedia {
  media: MediaDocument;
  /** The message this recording hangs off — the key markPendingDeleteByMessageIds takes. */
  messageId: Types.ObjectId;
}

/**
 * Built through the model rather than through `create`: a fixture must not depend
 * on the code under test being correct.
 *
 * Seeded ATTACHED with a MESSAGES ref because that is the exact shape
 * `markPendingDeleteByMessageIds` filters on — status, refCollection and
 * refDocumentId all have to match or that spec passes without writing anything.
 */
async function seedMedia(owner: Types.ObjectId): Promise<SeededMedia> {
  const messageId = new Types.ObjectId();

  const [media] = await mediaModel.create([
    {
      xid: nanoidAlphanumeric(),
      userId: owner,
      bucket: 'logdit-media',
      key: `audio/${owner.toHexString()}/${nanoidAlphanumeric()}.m4a`,
      mediaType: MediaType.AUDIO,
      mimeType: 'audio/mp4',
      sizeBytes: SEEDED_SIZE_BYTES,
      status: MediaStatus.ATTACHED,
      refCollection: MediaRefCollection.MESSAGES,
      refDocumentId: messageId,
    },
  ]);

  return { media, messageId };
}

const spec = ownershipSpecFactory<MediaRepository, Types.ObjectId>();

const SPECS = [
  // ─── record axis: a record key plus the caller ───
  spec({
    method: 'findByXid',
    axis: 'record',
    mutates: false,
    seed: seedMedia,
    call: (repo, target, caller) => repo.findByXid(target.media.xid, caller),
    assertOwnerResult: (result, target) => {
      // `key` specifically: it is the storage handle, and returning someone
      // else's is the whole exposure this method has.
      expect(isOk(result) && result.value?.key).toBe(target.media.key);
    },
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: null }),
  }),
  spec({
    method: 'updateStatus',
    axis: 'record',
    mutates: true,
    seed: seedMedia,
    // sizeBytes changes as well as status: re-writing the status it already has
    // would leave modifiedCount at zero and the write would be indistinguishable
    // from a no-op.
    call: (repo, target, caller) =>
      repo.updateStatus(target.media.xid, caller, {
        status: MediaStatus.ATTACHED,
        sizeBytes: UPDATED_SIZE_BYTES,
      }),
    assertOwnerResult: (result) => {
      expect(isOk(result) && result.value?.sizeBytes).toBe(UPDATED_SIZE_BYTES);
    },
    assertForeignResult: (result) => {
      expect(isErr(result) && result.error.code).toBe('NOT_FOUND');
    },
  }),
  spec({
    method: 'markPendingDeleteByMessageIds',
    axis: 'record',
    mutates: true,
    seed: seedMedia,
    call: (repo, target, caller) =>
      repo.markPendingDeleteByMessageIds([target.messageId], caller),
    assertOwnerResult: (result) => expect(result).toEqual({ ok: true, value: 1 }),
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: 0 }),
  }),

  // ─── owner axis: keyed by the owner alone ───
  spec({
    method: 'findByUser',
    axis: 'owner',
    mutates: false,
    seed: seedMedia,
    call: (repo, _target, caller) => repo.findByUser(caller),
    // The projection is `bucket key` only, so there is no userId on the returned
    // rows to assert against — the seeded key embeds the owner instead, which is
    // what makes a leaked row identifiable here.
    assertOwnerResult: (result) => {
      const rows = isOk(result) ? result.value : [];
      expect(rows).toHaveLength(OWNER_SEED_COUNT);
      expect(rows.every((m) => m.key.includes(OWNER.toHexString()))).toBe(true);
    },
    assertForeignResult: (result) => {
      const rows = isOk(result) ? result.value : [];
      expect(rows).toHaveLength(STRANGER_SEED_COUNT);
      expect(rows.every((m) => m.key.includes(STRANGER.toHexString()))).toBe(true);
    },
  }),
  spec({
    method: 'markPendingDeleteByUser',
    axis: 'owner',
    mutates: true,
    seed: seedMedia,
    // The only method here taking the owner as a string rather than an ObjectId.
    call: (repo, _target, caller) => repo.markPendingDeleteByUser(caller.toHexString()),
    assertOwnerResult: (result) => expect(result).toEqual({ ok: true, value: OWNER_SEED_COUNT }),
    assertForeignResult: (result) =>
      expect(result).toEqual({ ok: true, value: STRANGER_SEED_COUNT }),
  }),
];

const EXEMPT: Exemption[] = [
  {
    method: 'create',
    kind: 'payload-scoped',
    reason:
      'Insert only. The owner arrives in CreateMediaData and is written to the new row; ' +
      'no filter is applied and no existing recording is reachable.',
  },
  {
    method: 'expireAudioOlderThan',
    kind: 'global-by-design',
    reason:
      'Retention sweep (C-3). Un-redacted audio must be bounded on a timer, not only on ' +
      'user-initiated deletion, so this must reach every account. Selects on mediaType, ' +
      'status and a createdAt cutoff — no caller-supplied ids — and only moves rows into ' +
      'the existing PENDING_DELETE pipeline.',
  },
  {
    method: 'findPendingDeleteBatch',
    kind: 'global-by-design',
    reason:
      'Delete-worker queue head. Cross-user by design: it drains PENDING_DELETE rows for ' +
      'every account, bounded by the dead-letter threshold. Reads only, and it is the ' +
      'supplier whose scoping the two id-taking methods below depend on.',
  },
  {
    method: 'markDeleted',
    kind: 'guarded-otherwise',
    reason:
      'Takes ids with NO owner predicate — the same shape as CheckpointRepository. Safe ' +
      'because the ids are never caller-supplied: they come from findPendingDeleteBatch in ' +
      'the same worker pass, and the `status: PENDING_DELETE` clause means a row that left ' +
      'that state between read and write is skipped rather than clobbered.',
  },
  {
    method: 'incrementDeleteAttempts',
    kind: 'guarded-otherwise',
    reason:
      'Same chain and the same guard as markDeleted: the id comes from ' +
      'findPendingDeleteBatch, and `status: PENDING_DELETE` bounds the write. It touches ' +
      'one retry counter and no content.',
  },
  {
    method: 'countDeadLettered',
    kind: 'global-by-design',
    reason:
      'Ops gauge over the whole collection — the point is the global backlog. Takes no ids, ' +
      'returns a count, writes nothing.',
  },
];

describeOwnershipSuite<MediaRepository, Types.ObjectId>({
  name: 'MediaRepository',
  repoClass: MediaRepository,
  owner: OWNER,
  stranger: STRANGER,
  specs: SPECS,
  exempt: EXEMPT,
  setup: async (): Promise<OwnershipContext<MediaRepository>> => {
    const mongod = await MongoMemoryServer.create();
    const module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([{ name: Media.name, schema: MediaSchema }]),
      ],
      providers: [{ provide: MEDIA_REPOSITORY, useClass: MediaRepository }],
    }).compile();

    await module.init();
    mediaModel = module.get<Model<MediaDocument>>(getModelToken(Media.name));

    return {
      repo: module.get(MEDIA_REPOSITORY),
      connection: module.get<Connection>(getConnectionToken()),
      teardown: async () => {
        await module.close();
        await mongod.stop();
      },
    };
  },
});
