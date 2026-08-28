import type { Connection } from 'mongoose';

/**
 * Whole-database snapshot/diff, for asserting the *blast radius* of a write.
 *
 * The bug class this exists for is not "did the target change?" — that assertion
 * is trivial and almost never fails. It is "did anything ELSE change?". A filter
 * that lost its `userId`, an `updateMany` where `updateOne` was meant, a `$set`
 * that widened onto siblings: every one of those still satisfies a target-only
 * assertion.
 *
 * Two choices here are load-bearing:
 *
 * - **Read through the raw driver, not `model.find().lean()`.** Mongoose applies
 *   schema defaults and casting on read, so a document that genuinely changed on
 *   disk can read back identical. The snapshot has to see what is actually stored.
 * - **Snapshot every collection, not the one under test.** Cascades, hooks and
 *   secondary writes land elsewhere; a single-collection snapshot cannot see the
 *   version-history row a write incidentally created.
 *
 * Scope note: this is O(collections x documents) per call, which is fine against
 * the handful of documents an integration test seeds and wrong for anything else.
 * It is a test utility, not a general-purpose one.
 */

const SYSTEM_COLLECTION = /^system\./;

/** `collection:_id` -> canonical serialisation of the document. */
export type Snapshot = ReadonlyMap<string, string>;

/**
 * Order-independent serialisation.
 *
 * Mongo does not reorder fields on a plain `$set`, but an aggregation-pipeline
 * update rebuilds the document and can — `artefactTombstoneUpdate()` is exactly
 * that. Without sorting keys, every pipeline-update spec would report a spurious
 * change and the suite would be untrustworthy in precisely the erasure paths that
 * matter most.
 */
function canonical(value: unknown): unknown {
  if (value instanceof Date) return `Date(${value.toISOString()})`;
  if (Array.isArray(value)) return value.map(canonical);

  if (value !== null && typeof value === 'object') {
    // BSON scalars (ObjectId, Binary, Decimal128) compare by their string form
    // rather than by recursing into driver internals.
    if (typeof (value as { _bsontype?: unknown })._bsontype === 'string') return String(value);

    const source = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(source)
        .sort()
        .map((key) => [key, canonical(source[key])])
    );
  }

  return value;
}

export function docKey(collection: string, id: unknown): string {
  return `${collection}:${String(id)}`;
}

function db(connection: Connection) {
  if (!connection.db) throw new Error('blast-radius: connection has no db handle');
  return connection.db;
}

async function collectionNames(connection: Connection): Promise<string[]> {
  const collections = await db(connection).listCollections().toArray();
  return collections.map((c) => c.name).filter((name) => !SYSTEM_COLLECTION.test(name));
}

export async function snapshotAll(connection: Connection): Promise<Snapshot> {
  const snapshot = new Map<string, string>();

  for (const name of await collectionNames(connection)) {
    const docs = await db(connection).collection(name).find({}).toArray();
    for (const doc of docs) {
      snapshot.set(docKey(name, doc._id), JSON.stringify(canonical(doc)));
    }
  }

  return snapshot;
}

export interface SnapshotDiff {
  changed: string[];
  added: string[];
  removed: string[];
  /** Everything the operation touched, sorted. This is the blast radius. */
  touched: string[];
}

export function diffSnapshots(before: Snapshot, after: Snapshot): SnapshotDiff {
  const changed: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];

  for (const [key, value] of after) {
    const previous = before.get(key);
    if (previous === undefined) added.push(key);
    else if (previous !== value) changed.push(key);
  }

  for (const key of before.keys()) {
    if (!after.has(key)) removed.push(key);
  }

  return {
    changed: changed.sort(),
    added: added.sort(),
    removed: removed.sort(),
    touched: [...changed, ...added, ...removed].sort(),
  };
}

export async function clearAll(connection: Connection): Promise<void> {
  const names = await collectionNames(connection);
  await Promise.all(names.map((name) => db(connection).collection(name).deleteMany({})));
}

/** Keys in `a` that also appear in `b`. */
export function intersect(a: readonly string[], b: readonly string[]): string[] {
  const set = new Set(b);
  return a.filter((key) => set.has(key));
}
