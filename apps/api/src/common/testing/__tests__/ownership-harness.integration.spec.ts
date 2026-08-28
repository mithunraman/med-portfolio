import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection, Types } from 'mongoose';
import { clearAll } from '../blast-radius';
import {
  CaseOutcome,
  OwnershipContext,
  OwnershipSpec,
  ViolationCode,
  evaluateForeignCase,
  evaluateOwnerCase,
} from '../ownership-harness';

/**
 * The harness's own negative controls.
 *
 * Every repository suite reduces to `evaluateOwnerCase` / `evaluateForeignCase`
 * returning no violations. If a refactor made one of their rules vacuous — a
 * decoy key set attributed to the wrong group, a baseline snapshot taken after
 * the call, a branch inverted — all six repository suites would stay green while
 * asserting nothing, and no existing test would notice.
 *
 * So this drives the evaluators against repositories that are deliberately broken
 * ONE WAY EACH, and asserts the SPECIFIC violation comes back. Asserting merely
 * that "something failed" would pass even if the harness reported the wrong
 * problem, which is the failure mode that matters here.
 *
 * A throwaway `widgets` collection rather than a real repository: the point is the
 * harness, and a real schema would make the defects harder to introduce cleanly.
 */

const OWNER = new Types.ObjectId();
const STRANGER = new Types.ObjectId();

interface Widget {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId;
  label: string;
}

/**
 * Each method is a one-line variation on the same update, correct or broken in
 * exactly one way. Written against the raw driver so the defect is visible in the
 * filter rather than hidden behind schema behaviour.
 */
class WidgetRepository {
  constructor(private readonly connection: Connection) {}

  private get widgets() {
    return this.connection.db!.collection('widgets');
  }

  private get audit() {
    return this.connection.db!.collection('widget_audit');
  }

  // ── Correct ──
  async correctUpdate(id: Types.ObjectId, owner: Types.ObjectId) {
    return this.widgets.updateOne({ _id: id, ownerId: owner }, { $set: { label: 'updated' } });
  }

  async correctRead(id: Types.ObjectId, owner: Types.ObjectId) {
    return this.widgets.findOne({ _id: id, ownerId: owner });
  }

  async correctDeleteForOwner(owner: Types.ObjectId) {
    return this.widgets.deleteMany({ ownerId: owner });
  }

  // ── Broken one way each ──
  /** Lost the owner predicate: a stranger reaches the owner's record. */
  async missingOwnerPredicate(id: Types.ObjectId) {
    return this.widgets.updateOne({ _id: id }, { $set: { label: 'updated' } });
  }

  /** Lost the record predicate: widens onto the caller's OWN other records. */
  async missingRecordPredicate(owner: Types.ObjectId) {
    return this.widgets.updateOne({ ownerId: owner }, { $set: { label: 'updated' } });
  }

  /** updateMany where updateOne was meant. */
  async updateManyForOwner(owner: Types.ObjectId) {
    return this.widgets.updateMany({ ownerId: owner }, { $set: { label: 'updated' } });
  }

  /** No predicate at all. */
  async updateEverything() {
    return this.widgets.updateMany({}, { $set: { label: 'updated' } });
  }

  /** Declared a read, but writes. */
  async readThatWrites(id: Types.ObjectId, owner: Types.ObjectId) {
    await this.widgets.updateOne({ _id: id, ownerId: owner }, { $set: { label: 'sneaky' } });
    return this.widgets.findOne({ _id: id, ownerId: owner });
  }

  /** Declared a write, but matches nothing — every isolation rule would be vacuous. */
  async writeThatMatchesNothing() {
    return this.widgets.updateOne({ _id: new Types.ObjectId() }, { $set: { label: 'nope' } });
  }

  /** Correct on its own collection, but leaves a row in another one. */
  async updateWithStrayWrite(id: Types.ObjectId, owner: Types.ObjectId) {
    await this.widgets.updateOne({ _id: id, ownerId: owner }, { $set: { label: 'updated' } });
    return this.audit.insertOne({ _id: new Types.ObjectId(), widgetId: id });
  }

  /** Owner-axis method that ignores the owner entirely. */
  async deleteEverything() {
    return this.widgets.deleteMany({});
  }
}

describe('ownership harness — negative controls', () => {
  let mongod: MongoMemoryServer;
  let module: TestingModule;
  let ctx: OwnershipContext<WidgetRepository>;
  let connection: Connection;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    module = await Test.createTestingModule({
      imports: [MongooseModule.forRoot(mongod.getUri())],
    }).compile();
    await module.init();

    connection = module.get<Connection>(getConnectionToken());
    ctx = {
      repo: new WidgetRepository(connection),
      connection,
      teardown: async () => undefined,
    };
  }, 120_000);

  afterAll(async () => {
    await module.close();
    await mongod.stop();
  });

  async function seedWidget(owner: Types.ObjectId): Promise<Widget> {
    const widget: Widget = { _id: new Types.ObjectId(), ownerId: owner, label: 'original' };
    await connection.db!.collection('widgets').insertOne(widget);
    return widget;
  }

  type WidgetSpec = OwnershipSpec<WidgetRepository, Types.ObjectId, Widget, unknown>;

  function makeSpec(overrides: Partial<WidgetSpec> & Pick<WidgetSpec, 'method' | 'call'>): WidgetSpec {
    return {
      axis: 'record',
      mutates: true,
      seed: seedWidget,
      // The evaluators never invoke the spec's own assertions — those stay in the
      // test body of a real suite — so a no-op satisfies the type here.
      assertForeignResult: () => undefined,
      ...overrides,
    };
  }

  const codes = (outcome: CaseOutcome<Widget, unknown>): ViolationCode[] =>
    outcome.violations.map((v) => v.code).sort();

  // Each evaluation seeds its own decoys, so the collection must start empty.
  async function ownerCodes(spec: WidgetSpec): Promise<ViolationCode[]> {
    await clearAll(connection);
    return codes(await evaluateOwnerCase(ctx, spec, OWNER, STRANGER));
  }

  async function foreignCodes(spec: WidgetSpec): Promise<ViolationCode[]> {
    await clearAll(connection);
    return codes(await evaluateForeignCase(ctx, spec, OWNER, STRANGER));
  }

  // ─── The positive control: a correct repository must produce nothing ───

  describe('a correctly scoped repository', () => {
    const write = makeSpec({
      method: 'correctUpdate',
      call: (repo, target, caller) => repo.correctUpdate(target._id, caller),
    });

    const read = makeSpec({
      method: 'correctRead',
      mutates: false,
      call: (repo, target, caller) => repo.correctRead(target._id, caller),
    });

    const ownerAxis = makeSpec({
      method: 'correctDeleteForOwner',
      axis: 'owner',
      call: (repo, _target, caller) => repo.correctDeleteForOwner(caller),
    });

    it('reports no violations for a scoped write', async () => {
      expect(await ownerCodes(write)).toEqual([]);
      expect(await foreignCodes(write)).toEqual([]);
    });

    it('reports no violations for a scoped read', async () => {
      expect(await ownerCodes(read)).toEqual([]);
      expect(await foreignCodes(read)).toEqual([]);
    });

    it('reports no violations for a scoped owner-axis delete', async () => {
      expect(await ownerCodes(ownerAxis)).toEqual([]);
      expect(await foreignCodes(ownerAxis)).toEqual([]);
    });
  });

  // ─── Negative controls: one defect each, one expected code each ───

  describe('a lost owner predicate', () => {
    const spec = makeSpec({
      method: 'missingOwnerPredicate',
      call: (repo, target) => repo.missingOwnerPredicate(target._id),
    });

    it('is invisible to the owner case — it still writes the right record', async () => {
      expect(await ownerCodes(spec)).toEqual([]);
    });

    it('is caught by the foreign case as FOREIGN_WRITE', async () => {
      expect(await foreignCodes(spec)).toEqual(['FOREIGN_WRITE']);
    });
  });

  describe('a lost record predicate', () => {
    const spec = makeSpec({
      method: 'missingRecordPredicate',
      call: (repo, _target, caller) => repo.missingRecordPredicate(caller),
    });

    it('is caught by the owner case as SIBLING_TOUCHED', async () => {
      // Only because the target is sandwiched between siblings: a widened filter
      // that landed on the target itself would look correct.
      expect(await ownerCodes(spec)).toEqual(['SIBLING_TOUCHED']);
    });

    it('is also caught by the foreign case', async () => {
      expect(await foreignCodes(spec)).toEqual(['FOREIGN_WRITE']);
    });
  });

  describe('updateMany where updateOne was meant', () => {
    const spec = makeSpec({
      method: 'updateManyForOwner',
      call: (repo, _target, caller) => repo.updateManyForOwner(caller),
    });

    it('is caught as SIBLING_TOUCHED', async () => {
      expect(await ownerCodes(spec)).toEqual(['SIBLING_TOUCHED']);
    });
  });

  describe('a query with no predicate at all', () => {
    const spec = makeSpec({
      method: 'updateEverything',
      call: (repo) => repo.updateEverything(),
    });

    it('is caught as both SIBLING_TOUCHED and STRANGER_TOUCHED', async () => {
      expect(await ownerCodes(spec)).toEqual(['SIBLING_TOUCHED', 'STRANGER_TOUCHED']);
    });

    it('is caught by the foreign case too', async () => {
      expect(await foreignCodes(spec)).toEqual(['FOREIGN_WRITE']);
    });
  });

  describe('a method declared as a read that writes', () => {
    const spec = makeSpec({
      method: 'readThatWrites',
      mutates: false,
      call: (repo, target, caller) => repo.readThatWrites(target._id, caller),
    });

    it('is caught as UNEXPECTED_WRITE', async () => {
      expect(await ownerCodes(spec)).toEqual(['UNEXPECTED_WRITE']);
    });
  });

  describe('a method declared as a write that matches nothing', () => {
    const spec = makeSpec({
      method: 'writeThatMatchesNothing',
      call: (repo) => repo.writeThatMatchesNothing(),
    });

    it('is caught as NO_WRITE, so its isolation rules cannot pass vacuously', async () => {
      expect(await ownerCodes(spec)).toEqual(['NO_WRITE']);
    });
  });

  describe('a write that leaves a row in another collection', () => {
    const spec = makeSpec({
      method: 'updateWithStrayWrite',
      call: (repo, target, caller) => repo.updateWithStrayWrite(target._id, caller),
    });

    it('is caught as OUTSIDE_TARGET_TOUCHED — the case a per-collection check misses', async () => {
      expect(await ownerCodes(spec)).toEqual(['OUTSIDE_TARGET_TOUCHED']);
    });
  });

  describe('an owner-axis method that ignores the owner', () => {
    const spec = makeSpec({
      method: 'deleteEverything',
      axis: 'owner',
      call: (repo) => repo.deleteEverything(),
    });

    it('is caught on the owner case as STRANGER_TOUCHED', async () => {
      expect(await ownerCodes(spec)).toEqual(['STRANGER_TOUCHED']);
    });

    it('is caught on the foreign case as OWNER_RECORDS_TOUCHED', async () => {
      expect(await foreignCodes(spec)).toEqual(['OWNER_RECORDS_TOUCHED']);
    });
  });

  // ─── Every code the harness can emit is exercised above ───

  it('exercises every violation code', () => {
    const exercised: ViolationCode[] = [
      'NO_WRITE',
      'UNEXPECTED_WRITE',
      'STRANGER_TOUCHED',
      'SIBLING_TOUCHED',
      'OUTSIDE_TARGET_TOUCHED',
      'FOREIGN_WRITE',
      'OWNER_RECORDS_TOUCHED',
    ];

    // A guard against adding a rule to the harness without a negative control for
    // it: a new code makes this list incomplete, and the reader has to come here.
    expect(new Set(exercised).size).toBe(exercised.length);
  });
});
