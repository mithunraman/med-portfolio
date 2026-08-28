import { AnalysisRunStatus } from '@acme/shared';
import { MongooseModule, getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection, Model, Types } from 'mongoose';
import {
  Exemption,
  OwnershipContext,
  describeOwnershipSuite,
  ownershipSpecFactory,
} from '../../common/testing/ownership-harness';
import { nanoidAlphanumeric } from '../../common/utils/nanoid.util';
import { isOk } from '../../common/utils/result.util';
import { AnalysisRunsRepository } from '../analysis-runs.repository';
import { ANALYSIS_RUNS_REPOSITORY } from '../analysis-runs.repository.interface';
import {
  AnalysisRun,
  AnalysisRunDocument,
  AnalysisRunSchema,
} from '../schemas/analysis-run.schema';

/**
 * Generated ownership + blast-radius coverage for AnalysisRunsRepository.
 *
 * `reflectTrace` carries the composed clinical entry — per-section `narrative`,
 * `finalText`, and per-probe `text` — so this is content-bearing, not metadata.
 *
 * Two things shape the fixture:
 *
 * - **Unique indexes.** `{conversationId, idempotencyKey}`, `{conversationId,
 *   runNumber}`, and a partial unique `{conversationId}` limited to non-terminal
 *   statuses. Every seed therefore gets its own conversation; sharing one would
 *   make the second seed collide rather than test anything.
 * - **`updateRunStatus` is a compare-and-set.** Its filter fuses ownership with
 *   `status: expectedStatus`. If seeds carried different statuses, the status
 *   clause would do the filtering and the ownership half would go untested — so
 *   every seeded run shares one status, leaving only `userId` and `_id` to
 *   distinguish them.
 *
 * Every method here keys on a run id or a conversation id PLUS `userId`, so all
 * twelve specs are record-axis. There is no owner-axis method in this repository;
 * that is the shape of the code, not an omission.
 */

const OWNER = new Types.ObjectId();
const STRANGER = new Types.ObjectId();

/** Shared by every seed — see the compare-and-set note above. */
const SEED_STATUS = AnalysisRunStatus.PENDING;

// Assigned in setup; the seed builder only ever runs inside a test.
let runModel: Model<AnalysisRunDocument>;

interface SeededRun {
  run: AnalysisRunDocument;
  conversationId: Types.ObjectId;
  artefactId: Types.ObjectId;
}

/**
 * Built through the model rather than through `createRun`: a fixture must not
 * depend on the code under test being correct.
 *
 * `reflectTrace` is non-empty so the tombstone paths have content to scrub and a
 * blast-radius diff shows a real change rather than a status flip alone. Kept
 * small — snapshots serialise whole documents, and a large trace makes a failing
 * diff unreadable.
 */
async function seedRun(owner: Types.ObjectId): Promise<SeededRun> {
  const conversationId = new Types.ObjectId();
  const artefactId = new Types.ObjectId();

  const [run] = await runModel.create([
    {
      conversationId,
      userId: owner,
      artefactId,
      runNumber: 1,
      idempotencyKey: nanoidAlphanumeric(),
      langGraphThreadId: nanoidAlphanumeric(),
      status: SEED_STATUS,
      snapshotRange: { fromMessageId: null, toMessageId: null },
      reflectTrace: [
        {
          sectionId: 'reflection',
          probes: [{ probeId: 'p1', title: 'What changed', text: 'Postural BP', covered: true }],
          narrative: 'Lying 142, standing 118, dizzy on standing.',
          verification: null,
          finalText: 'Postural hypotension, likely ramipril plus tamsulosin.',
          source: 'composed',
        },
      ],
    },
  ]);

  return { run, conversationId, artefactId };
}

const spec = ownershipSpecFactory<AnalysisRunsRepository, Types.ObjectId>();

const SPECS = [
  // ─── Run reads keyed by run id ───
  spec({
    method: 'findRunById',
    axis: 'record',
    mutates: false,
    seed: seedRun,
    call: (repo, target, caller) => repo.findRunById(target.run._id, caller),
    assertOwnerResult: (result, target) => {
      expect(isOk(result) && result.value?._id.toString()).toBe(target.run._id.toString());
    },
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: null }),
  }),

  // ─── Run reads keyed by conversation ───
  spec({
    method: 'findRunByIdempotencyKey',
    axis: 'record',
    mutates: false,
    seed: seedRun,
    call: (repo, target, caller) =>
      repo.findRunByIdempotencyKey(target.conversationId, caller, target.run.idempotencyKey),
    assertOwnerResult: (result, target) => {
      expect(isOk(result) && result.value?._id.toString()).toBe(target.run._id.toString());
    },
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: null }),
  }),
  spec({
    method: 'findActiveRun',
    axis: 'record',
    mutates: false,
    seed: seedRun,
    call: (repo, target, caller) => repo.findActiveRun(target.conversationId, caller),
    assertOwnerResult: (result, target) => {
      expect(isOk(result) && result.value?._id.toString()).toBe(target.run._id.toString());
    },
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: null }),
  }),
  spec({
    method: 'findExecutingRun',
    axis: 'record',
    mutates: false,
    seed: seedRun,
    // PENDING is in EXECUTING_RUN_STATUSES, so the owner gets a hit here.
    call: (repo, target, caller) => repo.findExecutingRun(target.conversationId, caller),
    assertOwnerResult: (result, target) => {
      expect(isOk(result) && result.value?._id.toString()).toBe(target.run._id.toString());
    },
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: null }),
  }),
  spec({
    method: 'findLatestRun',
    axis: 'record',
    mutates: false,
    seed: seedRun,
    call: (repo, target, caller) => repo.findLatestRun(target.conversationId, caller),
    assertOwnerResult: (result, target) => {
      expect(isOk(result) && result.value?._id.toString()).toBe(target.run._id.toString());
    },
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: null }),
  }),
  spec({
    method: 'getMaxRunNumber',
    axis: 'record',
    mutates: false,
    seed: seedRun,
    call: (repo, target, caller) => repo.getMaxRunNumber(target.conversationId, caller),
    assertOwnerResult: (result) => expect(result).toEqual({ ok: true, value: 1 }),
    // Zero, not an error — the "no runs yet" answer, which is also what a
    // non-owner must get.
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: 0 }),
  }),
  spec({
    method: 'listRuns',
    axis: 'record',
    mutates: false,
    seed: seedRun,
    call: (repo, target, caller) => repo.listRuns(target.conversationId, caller),
    assertOwnerResult: (result, target) => {
      expect(isOk(result) && result.value.map((r) => r._id.toString())).toEqual([
        target.run._id.toString(),
      ]);
    },
    assertForeignResult: (result) => {
      expect(isOk(result) && result.value).toEqual([]);
    },
  }),
  spec({
    /**
     * Owner-scoped despite being a read: its output is the target list for
     * `purgeThreads`, a HARD delete against collections carrying no userId of
     * their own. A foreign thread id surviving here is unrecoverable loss of
     * another user's graph state, not a leak.
     */
    method: 'findThreadIdsByConversationIds',
    axis: 'record',
    mutates: false,
    seed: seedRun,
    call: (repo, target, caller) =>
      repo.findThreadIdsByConversationIds([target.conversationId], caller),
    assertOwnerResult: (result, target) => {
      expect(isOk(result) && result.value).toEqual([target.run.langGraphThreadId]);
    },
    assertForeignResult: (result) => {
      expect(isOk(result) && result.value).toEqual([]);
    },
  }),

  // ─── Writes ───
  spec({
    /**
     * Compare-and-set: `{ userId, _id, status: expectedStatus }`. Passing the
     * status every seeded run already has neutralises that clause, so the case
     * tests the ownership and record predicates rather than the precondition.
     */
    method: 'updateRunStatus',
    axis: 'record',
    mutates: true,
    seed: seedRun,
    call: (repo, target, caller) =>
      repo.updateRunStatus(target.run._id, caller, SEED_STATUS, { currentStep: 'reflect' }),
    assertOwnerResult: (result) => {
      expect(isOk(result) && result.value?.currentStep).toBe('reflect');
    },
    // Null is the existing "missing, or not in the expected status" contract.
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: null }),
  }),
  spec({
    method: 'updateCurrentStep',
    axis: 'record',
    mutates: true,
    seed: seedRun,
    call: (repo, target, caller) => repo.updateCurrentStep(target.conversationId, caller, 'compose'),
    assertOwnerResult: (result) => {
      expect(isOk(result) && result.value?.currentStep).toBe('compose');
    },
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: null }),
  }),
  spec({
    method: 'markDeletedByConversationIds',
    axis: 'record',
    mutates: true,
    seed: seedRun,
    call: (repo, target, caller) =>
      repo.markDeletedByConversationIds([target.conversationId], caller),
    assertOwnerResult: (result) => expect(result).toEqual({ ok: true, value: 1 }),
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: 0 }),
  }),
  spec({
    method: 'markDeletedByArtefactIds',
    axis: 'record',
    mutates: true,
    seed: seedRun,
    call: (repo, target, caller) => repo.markDeletedByArtefactIds([target.artefactId], caller),
    assertOwnerResult: (result) => expect(result).toEqual({ ok: true, value: 1 }),
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: 0 }),
  }),
];

const EXEMPT: Exemption[] = [
  {
    method: 'createRun',
    kind: 'payload-scoped',
    reason:
      'Insert only. The owner arrives in CreateAnalysisRunData and is written to the ' +
      'new run; no filter is applied and no existing run is reachable. Duplicate ' +
      'protection comes from the unique indexes, not from a query predicate.',
  },
  {
    method: 'findRunsForSweepBatch',
    kind: 'global-by-design',
    reason:
      'Checkpoint sweeper, runs on the retention cron and must reach every account. ' +
      'Selects on status plus an updatedAt cutoff with no caller-supplied ids, and ' +
      'writes nothing. Adding userId would break the sweep — the docblock says so.',
  },
  {
    method: 'expireStaleRuns',
    kind: 'global-by-design',
    reason:
      'Same sweeper. Expires runs wedged past a staleness cutoff across all users; the ' +
      'selection is status + time, never a caller-supplied id.',
  },
  {
    method: 'markCheckpointsPurged',
    kind: 'guarded-otherwise',
    reason:
      'Stamps checkpointsPurgedAt on run ids produced by findRunsForSweepBatch in the ' +
      'same tick. Deliberately unscoped because its supplier is: the sweeper is ' +
      'cross-user by design. It sets one bookkeeping timestamp and touches no content.',
  },
];

describeOwnershipSuite<AnalysisRunsRepository, Types.ObjectId>({
  name: 'AnalysisRunsRepository',
  repoClass: AnalysisRunsRepository,
  owner: OWNER,
  stranger: STRANGER,
  specs: SPECS,
  exempt: EXEMPT,
  setup: async (): Promise<OwnershipContext<AnalysisRunsRepository>> => {
    const mongod = await MongoMemoryServer.create();
    const module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([{ name: AnalysisRun.name, schema: AnalysisRunSchema }]),
      ],
      providers: [{ provide: ANALYSIS_RUNS_REPOSITORY, useClass: AnalysisRunsRepository }],
    }).compile();

    await module.init();
    runModel = module.get<Model<AnalysisRunDocument>>(getModelToken(AnalysisRun.name));
    // Unique + partial indexes are load-bearing for this fixture; build them
    // before the first seed rather than relying on lazy autoIndex timing.
    await runModel.syncIndexes();

    return {
      repo: module.get(ANALYSIS_RUNS_REPOSITORY),
      connection: module.get<Connection>(getConnectionToken()),
      teardown: async () => {
        await module.close();
        await mongod.stop();
      },
    };
  },
});
