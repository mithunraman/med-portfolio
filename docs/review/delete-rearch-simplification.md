# `delete-rearch` Branch — Simplification Review

**Branch:** `delete-rearch`
**Original review:** 2026-06-01
**Verification pass:** 2026-06-02 (after user-applied changes)
**Scope:** ~2,578-line diff reworking soft-delete / tombstone handling across artefacts, conversations, pdp-goals, analysis-runs, version-history, outbox, media, and account-cleanup modules.

Three parallel reviews (code reuse, code quality, efficiency) produced the findings below. Items are ordered by severity. Each finding includes rationale (what's wrong, why it matters) followed by a fix direction and a **status** line reflecting the current state after re-scan.

**Status legend:** ✅ FIXED · ⚠️ PARTIALLY FIXED · ❌ NOT FIXED

---

## Verification Summary

| Finding | Status |
|---|---|
| #1  Duplicative `tombstone.spec.ts` tests | ❌ NOT FIXED |
| #2  Tombstone payload helpers duplicated | ❌ NOT FIXED |
| #3  Cascade service wrappers boilerplate | ⚠️ PARTIALLY FIXED |
| #4  `$ne: DELETED` scattered + index inefficiency | ⚠️ PARTIALLY FIXED |
| #5  Missing index on `media.refDocumentId` | ✅ FIXED |
| #6  Missing index on `outbox.payload.*` | ✅ FIXED |
| #7  `Types.ObjectId[]` in service signatures | ❌ NOT FIXED |
| #8  Naming drift `anonymize*` vs `markDeleted*` | ❌ NOT FIXED |
| #9  `pdpGoalTombstoneSet` shape inconsistency | ✅ FIXED |
| #10 `findIdsByArtefactIds` JSDoc contradiction | ⚠️ PARTIALLY FIXED |
| #11 Missing index on `version_history(entityType, entityId)` | ✅ FIXED |
| #12 Unnecessary `distinct` round-trip in message-delete cascade | ❌ NOT FIXED |
| #13 `VersionHistoryEntity` enum in `packages/shared` | ❌ NOT FIXED |
| #14 `deletedAt` field written but never read | ✅ FIXED |
| #15 Speculative index on `(artefactId, status)` | ⚠️ PARTIALLY FIXED (comment) |
| #16 Duplicated "Cascade primitives" banners | ❌ NOT FIXED |
| #17 `media.service.markPendingDeleteByMessageIds` pass-through | ⚠️ PARTIALLY FIXED (doc only) |
| #18 `outbox.cancelByUser` missing `session` | ❌ NOT FIXED |
| #19 Account cleanup runs steps serially | ❌ NOT FIXED |
| #20 No short-circuit on already-deleted artefact cascade | ❌ NOT FIXED |
| #21 Stray blank line in `test-setup.ts` | ❌ NOT FIXED |
| #22 Stray meta files in commit | ❌ NOT FIXED |

**Tally:** 5 fixed, 5 partial, 12 not fixed.

---

## HIGH severity

### 1. The four new `tombstone.spec.ts` files are duplicative tautologies

**Where:**
- `apps/api/src/analysis-runs/__tests__/tombstone.spec.ts`
- `apps/api/src/artefacts/__tests__/tombstone.spec.ts`
- `apps/api/src/conversations/__tests__/tombstone.spec.ts`
- `apps/api/src/pdp-goals/__tests__/tombstone.spec.ts`

**Why this matters:**
All four files follow an identical pattern — import a `*TombstoneUpdate()` helper, then assert each field literal-by-literal (`expect(update.$set.title).toBe('[deleted]')`, `expect(update.$set.status).toBe(Status.DELETED)`, etc.). These tests are tautological:

- They will pass forever as long as nobody types something other than the literal string `[deleted]`.
- They give zero signal about whether tombstoning actually works end-to-end: that the helper is wired into the right `$set`, that the schema accepts `null` on previously-required fields, that re-running the operation is idempotent.

**Fix direction:**
Pick one of:
- **(a) Collapse to one shared spec** using `describe.each([factory, expectedShape])` under `apps/api/src/common/__tests__/tombstones.spec.ts`.
- **(b) Delete the four files and replace with one integration test per repo** that calls `markDeletedByX`, re-queries the doc, and asserts the persisted shape.

**Status: ❌ NOT FIXED.** All four files still exist with literal-by-literal assertions. Some files gained justifying comments (pdp-goals comments on the positional `$[]` operator; conversations comments on the `$unset`), but the structure and tautology remain.

---

### 2. Tombstone payload helpers are nearly identical — extract a shared builder

**Where:**
- `artefactTombstoneUpdate()` in `artefacts.repository.ts:20`
- `conversationTombstoneUpdate()` + `messageTombstoneUpdate()` in `conversations.repository.ts:20, 42`
- `pdpGoalTombstoneUpdate()` in `pdp-goals.repository.ts:24`
- `analysisRunTombstoneUpdate()` in `analysis-runs.repository.ts:19`

**Why this matters:**
Every helper resolves to the same shape: `{ <scrubbed fields>, status: <Enum>.DELETED }`. The status invariant is hand-rolled in five separate places, and the doc comment "Single source of truth for the X tombstone payload…" is copy-pasted verbatim above each one.

**Fix direction:**
A shared helper in `apps/api/src/common/utils/tombstone.util.ts`:

```ts
export function tombstoneUpdate<S>(deletedStatus: S, scrubbedFields: Record<string, unknown>) {
  return { $set: { ...scrubbedFields, status: deletedStatus } };
}
```

**Status: ❌ NOT FIXED.** Each helper still defined inline in its own repository file; no shared `tombstone.util.ts` exists. The "single source of truth" comment is still copy-pasted across all five helpers.

---

### 3. Cascade service-method wrappers are pure boilerplate (seven copies, two error styles)

**Where:**
- `analysis-runs.service.ts:160-183` (two methods)
- `pdp-goals.service.ts:238-245`
- `media.service.ts:233-243`
- `outbox.service.ts:113-128`
- `version-history.service.ts:92-110`
- plus equivalents in artefacts/conversations services

**Why this matters:**
All seven new methods share the same five-line shape (guard empty array, call repo, throw on error). Error handling drifted between bare `throw new Error(...)` and `throw new InternalServerErrorException(...)`. The empty-array guard duplicates one already inside every repo method.

**Fix direction:**
Add `unwrapVoid(result)` / `unwrapOrThrow(result)` to `common/utils/result.util.ts` that throws `InternalServerErrorException` consistently. Drop the redundant empty-array guards.

**Status: ⚠️ PARTIALLY FIXED.**
- ✅ `unwrapVoid` helper added at [common/utils/result.util.ts:44](../../apps/api/src/common/utils/result.util.ts#L44) and adopted by every cascade entry point (`analysis-runs:165,175`, `pdp-goals:242`, `media:239`, `outbox:124`, `version-history:101`).
- ✅ Redundant `if (ids.length === 0) return` guards removed from cascade primitives.
- ❌ `analysis-runs.service.ts` still has 10+ non-cascade methods using bare `throw new Error(result.error.message)` — inconsistent with the rest of the codebase.
- ❌ `conversations.service.ts:752,767,789,805` still hand-rolls `if (isErr(result)) throw new InternalServerErrorException(...)` instead of using `unwrapVoid`.

---

### 4. `status: { $ne: DELETED }` repeated 14+ times AND prevents index seeks

**Where:**
- `artefacts.repository.ts:46, 149, 188` (and one more)
- `conversations.repository.ts:85, 102, 233, 294, 365, 388, 425, 445`
- `pdp-goals.repository.ts:388, 402, 414`
- `analysis-runs.repository.ts` (×2)

**Why this matters:**
- **Drift risk:** Any new read that forgets the filter silently returns deleted data.
- **Performance:** MongoDB's `$ne` operator cannot use index bounds. Existing `(userId, status)` indexes can seek `userId` but must scan all of that user's docs and post-filter `status` in memory.

**Fix direction:**
- Switch reads from `status: { $ne: DELETED }` to `status: { $in: [<active statuses>] }` (uses index bounds).
- Introduce per-schema `notDeletedFilter()` constants OR a `pre('find')` Mongoose plugin with an `.includeDeleted()` escape hatch.
- Optionally add partial indexes.

**Status: ⚠️ PARTIALLY FIXED.**
- ✅ Named live-filter constants introduced: `ARTEFACT_LIVE_FILTER` ([artefacts.repository.ts:37](../../apps/api/src/artefacts/artefacts.repository.ts#L37)), `CONVERSATION_LIVE_FILTER` / `MESSAGE_LIVE_FILTER` ([conversations.repository.ts:34-35](../../apps/api/src/conversations/conversations.repository.ts#L34-L35)) and used at most read sites.
- ❌ `pdp-goals.repository.ts` (lines 389, 403, 420) and `analysis-runs.repository.ts` (lines 238, 262) were not given equivalent constants — still raw `status: { $ne: ... }` inline.
- ❌ `artefacts.repository.ts:108` still leaks a raw `filter.status = { $ne: ArtefactStatus.DELETED }`.
- ❌ Filters were not switched from `$ne` to `$in`, so index seeks are still bypassed for the status leg of compound indexes.

---

## MEDIUM severity

### 5. Missing index on `media.refDocumentId` — every cascade scans the media collection

**Where:** [media.schema.ts](../../apps/api/src/media/schemas/media.schema.ts) + `media.repository.ts` (`markPendingDeleteByMessageIds`).

**Why this matters:**
The cascade hot path filters `{ refDocumentId: { $in: messageIds }, refCollection: MESSAGES, status: ATTACHED }`. Without `refDocumentId` in any index, every per-message delete does a full collection scan.

**Fix direction:**
```ts
MediaSchema.index({ refDocumentId: 1, refCollection: 1, status: 1 });
```

**Status: ✅ FIXED.** [media.schema.ts:71](../../apps/api/src/media/schemas/media.schema.ts#L71) now declares `MediaSchema.index({ refDocumentId: 1, refCollection: 1, status: 1 })` with a doc-comment explaining it serves `markPendingDeleteByMessageIds`.

---

### 6. Missing index on `outbox.payload.conversationId` / `payload.userId`

**Where:** [outbox.schema.ts](../../apps/api/src/outbox/schemas/outbox.schema.ts), used by `cancelByConversationIds` and `cancelByUser`.

**Why this matters:**
Filtering on the embedded `payload.conversationId` (or `payload.userId` via `$or` in `cancelByUser`) cannot use any pre-existing index — it scans every PENDING/PROCESSING row.

**Fix direction:**
```ts
OutboxEntrySchema.index({ 'payload.conversationId': 1, status: 1 });
OutboxEntrySchema.index({ 'payload.userId': 1, status: 1 });
```

**Status: ✅ FIXED.** [outbox.schema.ts:51,54](../../apps/api/src/outbox/schemas/outbox.schema.ts#L51) now declares both indexes with comments naming the cascade hot paths they serve.

---

### 7. Cascade signatures leak `Types.ObjectId` into service public APIs (CLAUDE.md violation)

**Where:** New `deleteByIds(ids: Types.ObjectId[])` on services; existing drift in `conversations.service.ts:46`, `artefacts.service.ts:135`; outbox / analysis-runs cascade additions.

**Why this matters:**
CLAUDE.md is explicit: persistence types like `Types.ObjectId` must not appear in service files. The new cascade primitives propagate Mongo vocab through the domain layer.

**Fix direction:**
Cascade primitives accept `string[]`. The repository owns the conversion to `Types.ObjectId` internally.

**Status: ❌ NOT FIXED.** Every cascade entry still takes `Types.ObjectId[]`:
- `analysis-runs.service.ts:162,172`
- `pdp-goals.service.ts:239`
- `media.service.ts:236`
- `outbox.service.ts:120`
- `version-history.service.ts:98`
- `conversations.service.ts:752,764,788,802`
- `artefacts.service.ts:805` (`deleteByIds`)

`outbox.service.ts:123` even does an internal `id.toString()` conversion, confirming the leakage is concrete.

---

### 8. Naming drift: `anonymize*` vs `markDeleted*` vs `delete*` vs `softDelete*`

**Where:** Across all touched repositories and services.

**Why this matters:**
This branch introduces `markDeleted*` everywhere new, but leaves surviving `anonymizeByUser`, `anonymizeGoal`, `anonymizeByEntity`. Within a single file, `conversations.service.deleteByIds(ids)` calls `repository.markDeleted(ids)` — three vocabularies for the same operation.

**Fix direction:**
Repository layer: `markDeleted*` (action). Service layer: `delete*` (intent). Rename surviving `anonymize*` methods that participate in the cascade.

**Status: ❌ NOT FIXED.** Repositories still expose `anonymizeByUser` (artefacts, conversations, pdp-goals, review-periods, items), `anonymizeGoal` (pdp-goals), and `anonymizeByEntity` (version-history). Account-cleanup service still calls them via `anonymize*` private methods. The dual vocabulary persists alongside the new `markDeleted*` cascade methods.

---

### 9. `pdpGoalTombstoneSet` returns positional-update fragments mixed into normal `$set` shape

**Where:** `pdp-goals.repository.ts:23-32`

**Why this matters:**
The helper used to return top-level fields mixed with keys like `'actions.$[].action': '[deleted]'` — Mongo update-language syntax that only works inside `updateMany` `$set`. Inconsistent with `messageTombstoneUpdate` which returned the full `{ $set, $unset }` shape.

**Fix direction:**
Rename to `pdpGoalTombstoneUpdate()` and return the full `{ $set: ... }` shape — make all four helpers consistent.

**Status: ✅ FIXED.** [pdp-goals.repository.ts:24](../../apps/api/src/pdp-goals/pdp-goals.repository.ts#L24) now defines `pdpGoalTombstoneUpdate()` returning a complete `{ $set: {...} }`. All call sites (`anonymizeGoal`, `anonymizeByUser`, `markDeletedByArtefactIds`) pass the whole returned object directly to the update.

---

### 10. `findIdsByArtefactIds` JSDoc contradicts itself

**Where:** `conversations.repository.ts:382-393` (implementation) vs the interface JSDoc.

**Why this matters:**
- Interface JSDoc: "Resolve **live** conversation IDs for a set of artefact IDs."
- Implementation JSDoc: "Deliberately does NOT filter — returns all rows including tombstones."

A non-cascade caller will silently include deleted rows.

**Fix direction:**
Either rename to `findAllIdsByArtefactIds`, or split into `findLive*` and `findAll*`. Update the interface JSDoc.

**Status: ⚠️ PARTIALLY FIXED.** The implementation JSDoc at [conversations.repository.ts:401-408](../../apps/api/src/conversations/conversations.repository.ts#L401) now carries an accurate explanation ("returns ALL conversation IDs ... including already-tombstoned"). However, the interface JSDoc at [conversations.repository.interface.ts:175](../../apps/api/src/conversations/conversations.repository.interface.ts#L175) still says "Resolve **live** conversation IDs" — directly contradicting the implementation. The contradiction is now between the interface and impl rather than within the impl. Method was not renamed.

---

### 11. Verify index on `version_history(entityType, entityId)`

**Where:** version-history schema

**Why this matters:**
Cascade filter is `{ entityType, entityId: {$in: entityIds} }`. Without a compound index, every artefact delete scans the entire (potentially large) version-history collection.

**Fix direction:**
Confirm `VersionHistorySchema.index({ entityType: 1, entityId: 1 })`; add if missing.

**Status: ✅ FIXED.** [version-history.schema.ts:41](../../apps/api/src/version-history/schemas/version-history.schema.ts#L41) declares `VersionHistorySchema.index({ entityType: 1, entityId: 1, version: -1 })`. The added `version: -1` key also supports version-listing reads.

---

### 12. `deleteMessagesByConversationIds` does an unnecessary `distinct` round-trip

**Where:** `conversations.service.ts:deleteMessagesByConversationIds`

**Why this matters:**
1. Materializes all message IDs client-side via `findMessageIdsByConversationIds`.
2. Ships them in an `$in` to `mediaService.markPendingDeleteByMessageIds`.
3. Calls `markDeletedMessagesByConversationIds` (which re-resolves conversations server-side).

For large conversation sets this wastes a round-trip and inflates payload size.

**Fix direction:**
Denormalize `conversationId` onto media, OR add `markPendingDeleteByConversationIds` on the media repo that resolves server-side in a single update.

**Status: ❌ NOT FIXED.** [conversations.service.ts:763-782](../../apps/api/src/conversations/conversations.service.ts#L763) still calls `findMessageIdsByConversationIds` (which runs `distinct('_id')` per [conversations.repository.ts:468-483](../../apps/api/src/conversations/conversations.repository.ts#L468)) before invoking `markPendingDeleteByMessageIds`. The media schema was not extended with `conversationId`, so the extra round-trip is structurally required.

---

## LOW severity

### 13. `VersionHistoryEntity` enum is in `packages/shared` but only consumed by API

**Where:** `packages/shared/src/enums/version-history-entity.enum.ts`

**Why this matters:**
One-member enum (`ARTEFACT: 'artefact'`), only used by the backend `version-history` module. Placing it in `packages/shared` triggers a cross-package rebuild every time it changes.

**Fix direction:**
Move to `apps/api/src/version-history/version-history.types.ts` until a second consumer materializes.

**Status: ❌ NOT FIXED.** Still lives at `packages/shared/src/enums/version-history-entity.enum.ts` and is exported from [packages/shared/src/enums/index.ts:23](../../packages/shared/src/enums/index.ts#L23). Only API consumers use it (`artefacts.service.ts`, `version-history.service.ts`).

---

### 14. New `deletedAt` field is written but never read — schema bloat

**Where:** previously across `artefact.schema.ts`, `conversation.schema.ts`, `message.schema.ts`, `pdp-goal.schema.ts`, `analysis-run.schema.ts`.

**Why this matters:**
Every hot-path filter uses `status: { $ne: DELETED }` — `deletedAt` was never read in a query. Redundant with `status === DELETED`. Two pieces of state representing the same fact is a future drift risk.

**Fix direction:**
Drop the field; or switch reads to `deletedAt: null` and add partial indexes. Don't keep both.

**Status: ✅ FIXED.** Repo-wide grep finds no `deletedAt` references in `apps/api/src`. The field has been removed from all five schemas. `status === DELETED` is now the single source of truth.

---

### 15. `analysis-runs` schema pre-declares an index for a query pattern that doesn't exist yet

**Where:** `analysis-run.schema.ts:107-110`

**Why this matters:**
- Filter is `{artefactId: {$in: ids}, status: {$ne: DELETED}}` — `$ne` can't use index bounds anyway.
- Runs only on user-triggered cascades (small N per call). Speculative.

**Fix direction:**
Drop the index, or correct the misleading comment.

**Status: ⚠️ PARTIALLY FIXED.** The index at [analysis-run.schema.ts:110](../../apps/api/src/analysis-runs/schemas/analysis-run.schema.ts#L110) is still declared. The comment above it (lines 105-109) was rewritten to honestly state that `$ne` cannot use index bounds and the second key only earns its keep on exact-status reads — so the comment is now accurate. If the goal was honesty: done. If the goal was to remove speculative infrastructure: the index itself remains.

---

### 16. Duplicated "Cascade primitives" banner comments

**Where:** `artefacts.service.ts:788-799` and `conversations.service.ts:736-747`

**Why this matters:**
Identical 11-line banner comment in two files. "Intentionally sequential — Mongo forbids concurrent ops on a single session" repeated three times across the same comments.

**Fix direction:**
Delete the banners. Keep one short comment where the Mongo session constraint actually applies.

**Status: ❌ NOT FIXED.** The 11-line banner still appears identically in [artefacts.service.ts:788-799](../../apps/api/src/artefacts/artefacts.service.ts#L788) and [conversations.service.ts:736-747](../../apps/api/src/conversations/conversations.service.ts#L736) (only the "used both by..." sentence differs; body bullets are byte-identical).

---

### 17. `media.service.markPendingDeleteByMessageIds` is a pure pass-through wrapper

**Where:** `media/media.service.ts:230-242`

**Why this matters:**
The new service method does nothing the repository wasn't already doing — forwards args and unwraps `Result`. `ConversationsService` already injects `mediaRepository` and previously called it directly.

**Fix direction:**
Drop the wrapper and call the repo directly, OR absorb meaningful logic (count logging, batching).

**Status: ⚠️ PARTIALLY FIXED.** A justifying JSDoc was added explaining it's the "cascade entry point: flip media attached to the given messages into PENDING_DELETE for async S3 cleanup by the sweeper." The method body at [media.service.ts:235-240](../../apps/api/src/media/media.service.ts#L235) is still a pure pass-through (`unwrapVoid(await this.mediaRepository.markPendingDeleteByMessageIds(messageIds, session))`). Only a doc change, no behavior change. Whether this counts as "fixed" depends on whether the JSDoc justifies its existence as a documented cascade hook.

---

### 18. `outbox.repository.cancelByUser` lost its `session` parameter

**Where:** `outbox.repository.ts:214-231`

**Why this matters:**
Sibling methods in the file forward `session?: ClientSession`. `cancelByUser` was added without one — account cleanup can't run it inside a transaction.

**Fix direction:**
Add `session?: ClientSession` and forward to `updateMany`.

**Status: ❌ NOT FIXED.** Both the interface ([outbox.repository.interface.ts:73-76](../../apps/api/src/outbox/outbox.repository.interface.ts#L73)) and the implementation ([outbox.repository.ts:214-217](../../apps/api/src/outbox/outbox.repository.ts#L214)) still take only `(userId, conversationIds)` with no `session` parameter. The `updateMany` at line 219 runs outside any caller session.

---

### 19. Account cleanup runs 10 independent steps serially

**Where:** `account-cleanup.service.ts:101-123`

**Why this matters:**
Steps (`outbox`, `analysisRuns`, `media`, `conversations`, `artefacts`, `pdpGoals`, `reviewPeriods`, `items`, `versionHistory`, `user`) are independent bulk writes that currently run sequentially. Per-user latency stacks.

**Fix direction:**
`Promise.all` the independent steps; keep the `user` step last (gates retry idempotency).

**Status: ❌ NOT FIXED.** `anonymizeUser` in [account-cleanup.service.ts:93-131](../../apps/api/src/account-cleanup/account-cleanup.service.ts#L93) was refactored into a named-step array, but still iterates serially via `for (const step of steps) { await step.fn(); }` (line 116-118). The refactor improved error reporting/logging but kept the same serial latency profile.

---

### 20. Tombstone re-cascade reprocesses already-deleted artefacts

**Where:** `conversations.repository.ts:findIdsByArtefactIds` (tombstone-inclusive by design) + the cascade flow.

**Why this matters:**
Each duplicate delete re-walks all historical conversations and re-issues idempotent `updateMany`s. Safe but wasted work.

**Fix direction:**
Short-circuit at the top of the artefact-delete cascade: if `markDeleted(artefactId)` returned 0 modified, skip child cascades.

**Status: ❌ NOT FIXED.** `artefactsRepository.markDeleted` does return `modifiedCount` ([artefacts.repository.ts:214](../../apps/api/src/artefacts/artefacts.repository.ts#L214)), but [artefacts.service.ts:805-818](../../apps/api/src/artefacts/artefacts.service.ts#L805) (`deleteByIds`) discards the result value and unconditionally invokes all four child cascade methods (`conversationsService.deleteByArtefactIds`, `pdpGoalsService.deleteByArtefactIds`, `analysisRunsService.deleteByArtefactIds`, `versionHistoryService.anonymizeByEntity`). No `if (modifiedCount === 0) return` guard.

---

## TRIVIAL / Commit hygiene

### 21. Stray blank line in `conversations/__tests__/helpers/test-setup.ts`

**Status: ❌ NOT FIXED.** Blank line still present (shifted to line 206 by adjacent edits) between the closing `},` of the `MEDIA_REPOSITORY` provider and the `],` closing the providers array.

### 22. Files that probably don't belong in this commit

- `docs/review/audio-del-branch-simplification.md` (untracked) — personal review note from a previous branch.
- `prompts/simplification.md` — unrelated typo fix.

**Status: ❌ NOT FIXED, and expanded.** `git status` shows `prompts/simplification.md` still modified, `audio-del-branch-simplification.md` still untracked, and a new sibling `docs/review/delete-rearch-simplification.md` (this file) has been added. Decide intentionally whether the review docs belong on this feature branch or in a separate commit.

---

## Remaining priorities (post-verification)

Of the 12 items not yet fixed, these are the highest leverage:

1. **#7** — `Types.ObjectId[]` in cascade service signatures: a CLAUDE.md violation that's been freshly added by this branch (not pre-existing drift). Cheapest to fix now while the API is still mid-flight.
2. **#4** — Finish the live-filter centralization for `pdp-goals` and `analysis-runs`. Switching from `$ne` to `$in` would unlock real index seeks on the existing compound indexes.
3. **#8** — Rename `anonymize*` survivors to `markDeleted*` (or vice versa). The dual vocabulary is a continuous source of reader confusion.
4. **#1 / #2** — Either collapse the tombstone tests to a parametric `describe.each` or replace them with one integration test per repo. The current tests are tautological and add maintenance cost without behavioral signal.
5. **#10** — Update the interface JSDoc for `findIdsByArtefactIds` to match the implementation. One-line fix, prevents misuse.
6. **#18** — Add `session?: ClientSession` to `outbox.cancelByUser`. One-line fix, future-proofs transactions.

Items #16 (banner duplication), #17 (pure pass-through wrapper), #19 (serial cleanup), #20 (short-circuit), #21 (blank line), #22 (meta files): low individual cost — sweep in one cleanup commit if convenient.

The core refactor — cascade primitives + named live filters + new indexes — is in good shape. Most outstanding items are leftover edges, not architectural problems.
