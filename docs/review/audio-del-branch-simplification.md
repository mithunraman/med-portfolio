# `audio-del` Branch — Simplification Review

Reviewed branch: `audio-del` (vs `main`)
Scope: media deletion lifecycle — introduces a `PENDING_DELETE` state and an hourly `MediaSweeperService` that performs out-of-band S3 cleanup. Account cleanup, conversation/message deletion, and artefact deletion all now mark media `PENDING_DELETE` instead of inline-deleting S3 objects.

Files reviewed:
- [apps/api/src/media/media-sweeper.service.ts](../../apps/api/src/media/media-sweeper.service.ts) (new)
- [apps/api/src/media/media.repository.ts](../../apps/api/src/media/media.repository.ts)
- [apps/api/src/media/media.repository.interface.ts](../../apps/api/src/media/media.repository.interface.ts)
- [apps/api/src/media/schemas/media.schema.ts](../../apps/api/src/media/schemas/media.schema.ts)
- [apps/api/src/media/media.module.ts](../../apps/api/src/media/media.module.ts)
- [apps/api/src/account-cleanup/account-cleanup.service.ts](../../apps/api/src/account-cleanup/account-cleanup.service.ts)
- [apps/api/src/account-cleanup/account-cleanup.module.ts](../../apps/api/src/account-cleanup/account-cleanup.module.ts)
- [apps/api/src/artefacts/artefacts.service.ts](../../apps/api/src/artefacts/artefacts.service.ts)
- [apps/api/src/conversations/conversations.service.ts](../../apps/api/src/conversations/conversations.service.ts)
- [packages/shared/src/enums/media-status.enum.ts](../../packages/shared/src/enums/media-status.enum.ts)
- Test files for the above.

---

## High-value simplifications

### 1. Service layer leaks Mongo type vocabulary — violates CLAUDE.md

**Where:** [apps/api/src/media/media-sweeper.service.ts:66](../../apps/api/src/media/media-sweeper.service.ts#L66), [:70](../../apps/api/src/media/media-sweeper.service.ts#L70), [:71](../../apps/api/src/media/media-sweeper.service.ts#L71), [:74](../../apps/api/src/media/media-sweeper.service.ts#L74)

`MediaSweeperService` calls `item._id.toString()` four times inside the per-batch loop to feed `markDeleted` and `incrementDeleteAttempts`. Those repo methods then convert the string back to `Types.ObjectId`. The ids originated from a `find()` call in the same repo on the line above — so the round-trip `ObjectId → string → ObjectId` is wasted CPU and, more importantly, an abstraction breakage.

CLAUDE.md explicitly states:
> Services should pass ids to repositories as the type the repository interface declares… The repository performs any conversion to storage-native types internally.

**Why it matters:** The sweeper is service-layer code. By calling `_id.toString()` it acknowledges the underlying storage representation, which is exactly what CLAUDE.md wants pushed into the repo. New code in this branch should not introduce more drift on this rule — the project already has known drift in older services that we shouldn't propagate.

**Fix options (pick one):**
- Have the repo expose a domain ID type (or accept the raw `_id` opaquely) so the service passes `item._id` through without `toString()`.
- Or — cleaner — make `findPendingDeleteBatch` return rows shaped as `{ id: string; bucket: string; key: string }` (already string-ified). The service then never sees `ObjectId` at all and `markDeleted` keeps its `string[]` signature without conversion.

---

### 2. Inconsistent ID types across the new repository interface

**Where:** [apps/api/src/media/media.repository.interface.ts:41](../../apps/api/src/media/media.repository.interface.ts#L41), [:46](../../apps/api/src/media/media.repository.interface.ts#L46), [:55](../../apps/api/src/media/media.repository.interface.ts#L55), [:57](../../apps/api/src/media/media.repository.interface.ts#L57)

The new methods in `IMediaRepository` flip between `string` and `Types.ObjectId`:

```ts
markPendingDeleteByMessageIds(messageIds: Types.ObjectId[], …)  // ObjectId[]
markPendingDeleteByUser(userId: string, …)                       // string
markDeleted(ids: string[])                                       // string[]
incrementDeleteAttempts(id: string)                              // string
```

**Why it matters:** A repository interface is a domain contract. Inconsistent typing forces every caller to know which signature requires which form, and it produces the kind of `userId.toString()` plumbing currently in [account-cleanup.service.ts:152](../../apps/api/src/account-cleanup/account-cleanup.service.ts#L152). It also makes it harder to read the interface for what it actually does.

**Fix:** Standardize on `string` (xid for user-facing methods, internal `_id`-as-string for internal methods, or a branded domain id) and convert to `Types.ObjectId` inside the repo. Side effects after the standardization: `account-cleanup.service.ts` drops `userId.toString()`; and the older drift in `artefacts.service.ts` that still uses `new Types.ObjectId(userId)` becomes the obvious next cleanup target.

---

### 3. S3 deletes inside a batch are sequential

**Where:** [apps/api/src/media/media-sweeper.service.ts:62-78](../../apps/api/src/media/media-sweeper.service.ts#L62-L78)

```ts
for (const item of batch) {
  attempted++;
  try {
    await this.storageService.deleteObject(item.bucket, item.key);
    …
  } catch (error) {
    …
    await this.mediaRepository.incrementDeleteAttempts(item._id.toString());
  }
}
```

Each `deleteObject` awaits before the next starts. With `BATCH_SIZE = 10` × `MAX_BATCHES_PER_RUN = 500` = up to **5,000 sequential S3 round-trips per hourly run**, plus an additional sequential DB call for every failure.

**Why it matters:** S3 latency dominates the sweep run time. If average `DeleteObject` latency is 50ms, a fully-loaded run takes ~250 seconds just on serial S3 calls; on a slow day it pushes well past the hourly cron interval.

**Fix options:**
- Cheap win: `Promise.allSettled` over the batch — ~10× speed-up per batch, trivial change.
- Better: switch to S3 `DeleteObjects` (bulk, up to 1,000 keys per call). One call per batch, matches the existing idempotent semantics, and lets you scale `BATCH_SIZE` higher.

Bonus: after parallelizing, collect failed ids and call a single `bulkIncrementDeleteAttempts(ids: string[])` instead of one DB write per failure.

---

### 4. `findPendingDeleteBatch` has no ordering — rows can thrash

**Where:** [apps/api/src/media/media.repository.ts:153-167](../../apps/api/src/media/media.repository.ts#L153-L167)

```ts
const media = await this.mediaModel
  .find({ status: MediaStatus.PENDING_DELETE, deleteAttempts: { $lt: DEAD_LETTER_THRESHOLD } })
  .limit(limit)
  .lean();
```

No `.sort()` clause. With no ordering, Mongo returns rows in natural (insertion / storage) order. If a small set of rows fails repeatedly — say S3 returns 403 because a key has weird characters — those same rows resurface at the top of every batch and crowd out healthier work until they hit the 24-attempt dead-letter ceiling.

**Why it matters:** You added a `pendingDeleteAt` field but never read it. Without ordering, it's dead weight; with ordering it gives you FIFO semantics. Even better, sorting by `deleteAttempts ASC, pendingDeleteAt ASC` prefers fresh rows, so a few poison rows don't block the queue.

**Fix:**
```ts
.sort({ deleteAttempts: 1, pendingDeleteAt: 1 })
```
(Combine with #8 for a partial index that makes this sort cheap.)

---

### 5. Redundant work in `markDeleted` — converts strings back to `ObjectId`

**Where:** [apps/api/src/media/media.repository.ts:182-195](../../apps/api/src/media/media.repository.ts#L182-L195)

```ts
const objectIds = ids.map((id) => new Types.ObjectId(id));
```

Exists only because the caller pre-stringified ids that originally came from a `find()` (see #1). The conversion disappears completely after #1/#2.

---

## Medium-value simplifications

### 6. `getDeadLetterCount` returns `number | 'unknown'`

**Where:** [apps/api/src/media/media-sweeper.service.ts:97-104](../../apps/api/src/media/media-sweeper.service.ts#L97-L104)

```ts
private async getDeadLetterCount(): Promise<number | 'unknown'> {
  const result = await this.mediaRepository.countDeadLettered();
  if (isErr(result)) {
    this.logger.error(`countDeadLettered failed: ${result.error.message}`);
    return 'unknown';
  }
  return result.value;
}
```

A stringly-typed sentinel encoded into the return type just to satisfy a log template. The caller only interpolates the value into a string.

**Why it matters:** This couples an output-format concern (how a value is presented in a log line) into an API contract. If anything else ever consumes `getDeadLetterCount`, it has to special-case `'unknown'`.

**Fix:** Return `number | null` and let the caller format it (`${count ?? 'unknown'}`). Or just return `number` (default `0`) since the log already separately captured the error.

---

### 7. `runSweep` runs sweep and dead-letter count sequentially

**Where:** [apps/api/src/media/media-sweeper.service.ts:35-38](../../apps/api/src/media/media-sweeper.service.ts#L35-L38)

```ts
const stats = await this.sweep();
const deadLetterCount = await this.getDeadLetterCount();
```

These are independent reads. `Promise.all` would shave one round-trip per hourly run. Very small but free.

---

### 8. Status-only index is broader than necessary

**Where:** [apps/api/src/media/schemas/media.schema.ts:70](../../apps/api/src/media/schemas/media.schema.ts#L70)

```ts
MediaSchema.index({ status: 1 });
```

A general `status` index covers every status, including PENDING (creation), ATTACHED (steady state), and DELETED (final). For a collection that grows over time, the DELETED count will dominate, making the index large and the sweeper's selectivity worse.

**Why it matters:** The sweeper only ever queries one status. A partial index targets just the working set:

```ts
MediaSchema.index(
  { pendingDeleteAt: 1 },
  { partialFilterExpression: { status: MediaStatus.PENDING_DELETE } }
);
```

This index is tiny (only PENDING_DELETE rows), supports the FIFO sort from #4, and serves the sweeper's primary query without scanning any other state. The general status index then becomes optional / removable.

---

### 9. `incrementDeleteAttempts` re-checks status that the find already guaranteed

**Where:** [apps/api/src/media/media.repository.ts:197-208](../../apps/api/src/media/media.repository.ts#L197-L208)

```ts
{ _id: new Types.ObjectId(id), status: MediaStatus.PENDING_DELETE }
```

`status: PENDING_DELETE` was true when `findPendingDeleteBatch` returned the row a few ms earlier. No other writer transitions PENDING_DELETE → anything-else concurrently (the sweeper is the only mutator of PENDING_DELETE rows, and `processing = true` blocks a second sweep). The guard is defensive code with no invariant behind it.

**Why it matters:** Defensive filters that never fail mask real bugs (silent no-ops). If the status ever did change concurrently, you'd want a visible error, not a silently-skipped increment.

**Fix:** Drop the status filter; match by `_id` only.

---

### 10. `markPendingDeleteByMessageIds` and `…ByUser` disagree on valid prior statuses

**Where:** [apps/api/src/media/media.repository.ts:117-125](../../apps/api/src/media/media.repository.ts#L117-L125), [:138-145](../../apps/api/src/media/media.repository.ts#L138-L145)

- `markPendingDeleteByMessageIds` requires `status: ATTACHED`.
- `markPendingDeleteByUser` accepts `status: { $in: [ATTACHED, PENDING] }`.

**Why it matters:** If a media row is in PENDING (uploaded but not yet attached to a message) and the user races a message delete against the upload-finalize, the by-message path won't sweep it. The by-user path catches it. The asymmetry reads as accidental, not invariant-driven.

**Fix:** Either:
- Accept `{ $in: [ATTACHED, PENDING] }` in both (consistent, sweeps orphaned uploads).
- Or document the divergence with a one-line comment explaining why a by-messages call shouldn't touch PENDING rows.

---

## Low-value / nitpicks

### 11. Narrating comments

- [conversations.service.ts:208](../../apps/api/src/conversations/conversations.service.ts#L208): `// 6. Mark attached media for async S3 cleanup` — restates the method name. The "attached" qualifier is the only non-obvious bit; if it's worth keeping, shrink to that.
- [artefacts.service.ts:199](../../apps/api/src/artefacts/artefacts.service.ts#L199): `// Mark attached media for async S3 cleanup` — same as above.

**Keep these — they document non-obvious WHY:**
- [media.repository.interface.ts:41-43](../../apps/api/src/media/media.repository.interface.ts#L41-L43) — state-machine invariant.
- [media.repository.ts:13-15](../../apps/api/src/media/media.repository.ts#L13-L15) — dead-letter rationale.
- [media-sweeper.service.ts:86](../../apps/api/src/media/media-sweeper.service.ts#L86) — S3 idempotency / why we can `break` on DB failure.
- [conversations.service.ts:790-795](../../apps/api/src/conversations/conversations.service.ts#L790-L795) — why we return null for PENDING_DELETE.

---

### 12. `MAX_BATCHES_PER_RUN = 500` is undocumented

**Where:** [apps/api/src/media/media-sweeper.service.ts:8](../../apps/api/src/media/media-sweeper.service.ts#L8)

5,000 deletes per hourly run is a deliberate ceiling. A one-line comment on the choice (expected hourly throughput, max acceptable run time, etc.) would explain the constant. As written, a future reader has to guess.

---

### 13. Test helper uses `as never`

**Where:** [apps/api/src/media/__tests__/media-sweeper.service.spec.ts:55-57](../../apps/api/src/media/__tests__/media-sweeper.service.spec.ts#L55-L57)

```ts
return {
  deleteObject: jest.fn().mockResolvedValue(undefined),
} as never;
```

`as never` to silence a type mismatch is a smell. The cleaner shape:
```ts
return { deleteObject: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<StorageService>;
```

---

### 14. `findByUser` may now be dead code

**Where:** [apps/api/src/media/media.repository.ts:101-109](../../apps/api/src/media/media.repository.ts#L101-L109)

Used to be called by `account-cleanup.service.ts` to enumerate keys for inline S3 deletion. That code is gone in this branch. Worth a quick grep for other callers — if none, drop the method from interface + implementation + all mocks (it's still mocked in `account-cleanup.service.spec.ts` and `media.service.spec.ts`).

---

## What's already clean

- The state-machine guards in the `updateMany` filters (`ATTACHED → PENDING_DELETE`, `PENDING_DELETE → DELETED`) are the right shape — invalid transitions become silent no-ops at the DB layer rather than data corruption.
- The `processing` flag in `runSweep` is the right primitive for the in-process cron model — no need for a distributed lock.
- Removing `StorageModule` from `AccountCleanupModule` keeps the dependency surface honest now that account cleanup no longer touches S3 directly.
- The new comment on `resolveAudioUrl` correctly documents the WHY (S3 object may be gone or scheduled for purge).
- Sweeper test coverage is thorough: happy path, mid-batch failure, empty batch, error paths, batch drain, safety cap, concurrent invocation, dead-letter logging.

---

## Suggested order of attack

Highest leverage is **#1 + #2 + #5 together** — they're one refactor (push ID conversion into the repo). They cascade into cleaner call sites in `account-cleanup.service.ts` and `artefacts.service.ts` and remove the only CLAUDE.md violations this branch introduces.

**#3 + #4** are the biggest correctness/perf wins — parallelize S3 deletes and add FIFO ordering with the `pendingDeleteAt` field you already added.

**#8** pairs naturally with #4 (the new index supports the new sort).

Everything else is small cleanup that can ride along with whichever PR touches the file.
