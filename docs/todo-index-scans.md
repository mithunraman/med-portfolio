# TODO — MongoDB index scans to investigate

Follow-ups from repository index audits. Runtime-dependent items cannot be
confirmed from code alone and need `$indexStats` / `explain()` output from a
real MongoDB instance before acting.

- [`artefacts`](#artefacts-collection) — from `ArtefactsRepository`
- [`conversations` / `messages`](#conversations--messages-collections) — from `ConversationsRepository`
- [`media`](#media-collection) — from `MediaRepository`
- [`analysis_runs`](#analysis_runs-collection) — from `AnalysisRunsRepository`
- [`review_periods`](#review_periods-collection) — from `ReviewPeriodsRepository`
- [`version_history`](#version_history-collection) — from `VersionHistoryRepository`
- [`sessions`](#sessions-collection) — from `SessionsRepository`
- [`outbox`](#outbox-collection) — from `OutboxRepository`

---

## `artefacts` collection

Schema: [apps/api/src/artefacts/schemas/artefact.schema.ts](../apps/api/src/artefacts/schemas/artefact.schema.ts)

## Already resolved (code-only, no runtime needed)

- ✅ Removed redundant `index: true` on `xid` (`unique: true` already builds the index).
- ✅ Added `{ userId: 1, _id: -1 }` to serve the **default (no-status)** `listArtefacts`
  cursor pagination (userId scope + `_id`-desc sort + `_id`-range cursor, no blocking SORT).
- ✅ **Replaced `{ userId: 1, status: 1 }` with `{ userId: 1, status: 1, _id: -1 }`** —
  serves **status-filtered** keyset pagination (`GET /artefacts?status=X&cursor=Y`, a real
  path via `ListArtefactsDto`): userId+status eq bounds + `_id:-1` for sort *and* cursor
  range, so a page examines ~`limit` docs instead of residual-over-scanning `{userId,_id:-1}`.
  Net-zero index count — the `{ userId, status }` prefix still covers `countByUser`'s status
  branch and `markDeletedByUserId`, so the old 2-field index was redundant once this landed.
  Kept `{ userId, _id: -1 }` (the no-status branch filters `status` as a range and can't
  stream `_id`-sorted across the compound). Confirm the plan with `explain()` once there's
  data — expected: IXSCAN on `{userId,status,_id:-1}`, no SORT stage, `totalKeysExamined ≈ limit`.
- ✅ **Dropped `{ userId: 1, createdAt: -1 }` — unused.** Its only distinguishing query
  is `countByUser`'s `since` branch (`createdAt: {$gte}`), which is **never reached**:
  both callers pass no `since` ([artefacts.service.ts:382](../apps/api/src/artefacts/artefacts.service.ts#L382)
  → `undefined`, [init.service.ts:119](../apps/api/src/init/init.service.ts#L119) → omitted).
  `listArtefacts` sorts on `_id`, not `createdAt`, so nothing else uses it. Static-analysis
  call (pre-launch → no `$indexStats` data); no query regresses (userId prefix covered by
  other compounds).
- ✅ **Dropped `{ userId: 1, status: 1, completedAt: 1 }` — unused + redundant.**
  `completedAt` is never a query predicate — only written
  ([artefacts.service.ts:293](../apps/api/src/artefacts/artefacts.service.ts#L293)),
  DTO-mapped ([artefact.mapper.ts:48](../apps/api/src/artefacts/mappers/artefact.mapper.ts#L48)),
  and filtered **in-memory** ([review-periods.service.ts:302-305](../apps/api/src/review-periods/review-periods.service.ts#L302),
  which loads `{userId, status: COMPLETED}` then `.filter()`s the date range in JS). With
  `completedAt` never queried, the `{userId, status}` prefix just duplicated
  `{ userId: 1, status: 1 }` (L166). The `completedAt` **field** is kept (written + in DTO).

## Pending investigation

### 1. Confirm & consider dropping redundant index C — `{ userId: 1 }`
- **Why suspect:** every `userId`-only query (`countByUser` base case) is already
  served by the **prefix** of `{ userId: 1, status: 1 }` and the newly added
  `{ userId: 1, _id: -1 }`. A standalone single-field index on `userId` adds write
  cost with no read benefit the compounds don't already cover.
- **Action:** confirm it's cold via `$indexStats`, then drop if unused.
- **Risk:** low — purely redundant if `$indexStats` shows near-zero `ops`.

### 2. If review-period coverage grows: push the `completedAt` filter into the query
- **Why:** [review-periods.service.ts:291](../apps/api/src/review-periods/review-periods.service.ts#L291)
  loads up to 1000 completed artefacts and date-range-filters `completedAt` in memory.
  Fine while a trainee's completed set is small; a smell if it grows large.
- **Action:** if it becomes hot, push the range into `listArtefacts`
  (`{ userId, status: COMPLETED, completedAt: {$gte, $lte} }`) **and re-add**
  `{ userId: 1, status: 1, completedAt: 1 }` — which would then be genuinely used.
  **Not recommended pre-launch** (single-user + single-status scope keeps the set small).

### 3. `countByUser` combined `status + since` — not covered (and `since` is currently dead)
- **Why:** the `since` branch is unreached today (see resolved item above). *If* a caller
  starts passing `since`, no index covers `userId(eq) + status(eq) + createdAt(range)`.
- **Action:** when/if `since` is wired up, add `{ userId: 1, status: 1, createdAt: -1 }`
  and confirm with `explain("executionStats")`. Until then, consider removing the dead
  `since` branch + `CountByUserFilter.since` field for leanness. **Not needed pre-launch.**

## Verification commands

```js
// Index usage counters since last mongod restart — drives item 1 (is { userId:1 } cold?)
db.artefacts.aggregate([{ $indexStats: {} }])

// Current live indexes
db.artefacts.getIndexes()

// Confirm listArtefacts plan uses { userId:1, _id:-1 } with no SORT stage
db.artefacts.find({ userId: ObjectId("..."), status: { $ne: 3 } })
  .sort({ _id: -1 }).limit(20)
  .explain("executionStats")
// Expect: IXSCAN on { userId:1, _id:-1 }, no SORT stage,
//         totalKeysExamined ≈ nReturned.

// Item 3: inspect combined status + since count plan
db.artefacts.find({ userId: ObjectId("..."), status: 1, createdAt: { $gte: ISODate("...") } })
  .explain("executionStats")
```

---

## `conversations` / `messages` collections

Schemas:
[conversation.schema.ts](../apps/api/src/conversations/schemas/conversation.schema.ts),
[message.schema.ts](../apps/api/src/conversations/schemas/message.schema.ts)

### Already resolved (code-only, no runtime needed)

- ✅ Removed redundant `index: true` on both `xid` props (`unique: true` already
  builds the index).
- ✅ Dropped redundant single-field indexes — each was the left-most **prefix** of
  an existing compound, so the planner already substitutes the compound:
  - `conversations.{ userId: 1 }` → covered by `{ userId: 1, _id: -1 }`.
  - `conversations.{ artefact: 1 }` → covered by `{ artefact: 1, status: 1 }`.
  - `messages.{ conversation: 1 }` → covered by `{ conversation: 1, _id: -1 }`.

### Pending investigation

#### 1. Confirm the dropped indexes had no external consumer
- **Why:** the three single-field indexes above are provably redundant for query
  coverage *within* `ConversationsRepository`, but a query **outside** this repo
  could theoretically rely on one. The compound prefix still serves it — this is a
  belt-and-braces check, not a blocker.
- **Action:** run `$indexStats` on both collections and confirm the dropped
  indexes showed no unexpected direct-query traffic before this change ships.

#### 2. `hasCompleteMessages` / `hasProcessingMessages` — partial index coverage
- **Why:** both filter `{ conversation, role, status }` but only `conversation` is
  indexed (via `{ conversation: 1, _id: -1 }` prefix); `role` + `status` are
  residual filters. Bounded by `limit(1)`/existence semantics, so cheap today — the
  worst case (no matching message) scans all of a conversation's messages.
- **Action:** only add `{ conversation: 1, role: 1, status: 1 }` if `explain()`
  shows `totalDocsExamined >> nReturned` on the no-match path under real load.
  `status` goes last (it's a range in `hasProcessingMessages`). **Not recommended
  pre-launch.** This compound could also absorb the old `{ conversation: 1 }` role.

### Verification commands

```js
db.conversations.getIndexes(); db.messages.getIndexes()
db.conversations.aggregate([{ $indexStats: {} }])   // item 1: confirm dropped conv indexes were cold
db.messages.aggregate([{ $indexStats: {} }])         // item 1: confirm dropped msg index was cold

// Item 2: does the existence check residual-scan a conversation's messages?
db.messages.find({ conversation: ObjectId("..."), role: 0, status: 4 })
  .limit(1).explain("executionStats")
// If totalDocsExamined >> nReturned on the no-match path → justify the compound.
```

---

## `media` collection

Schema: [media.schema.ts](../apps/api/src/media/schemas/media.schema.ts)

### Already resolved (code-only, no runtime needed)

- ✅ Removed redundant `index: true` on `xid` (`unique: true` already builds the index).
- ✅ Dropped redundant `{ userId: 1 }` — served by the `{ userId: 1, status: 1 }` prefix.
- ✅ **Sweeper fix:** replaced `{ status: 1 }` with `{ status: 1, deleteAttempts: 1 }`.
  The sweeper (`findPendingDeleteBatch`) polls for `PENDING_DELETE` rows below the
  dead-letter threshold; dead-lettered rows (`deleteAttempts >= 24`) stay
  `PENDING_DELETE` forever, so the old `{ status: 1 }` index made every poll
  re-scan and residual-discard the whole dead-letter backlog. The compound bounds
  `deleteAttempts` in the index scan; its `{ status: 1 }` prefix also serves
  `countDeadLettered` and any status-only scan.

### Pending investigation

#### 1. Confirm the dropped indexes had no external consumer
- **Why:** `{ userId: 1 }` and `{ status: 1 }` are provably redundant for query
  coverage *within* `MediaRepository` (compound-prefix rule), but confirm no query
  **outside** this repo depended on them directly.
- **Action:** `$indexStats` on `media`; verify the dropped indexes were cold before
  this change ships.

#### 2. Validate the sweeper fix under load
- **Why:** confirm the new compound eliminates the dead-letter residual scan and
  that the backlog no longer inflates `totalDocsExamined` per poll.
- **Action:** `explain("executionStats")` on the sweeper query (below) with a
  non-trivial dead-letter backlog present.

#### 3. Optional — partial index if the dead-letter backlog grows large
- **Why:** a partial `{ status: 1 }` with
  `partialFilterExpression: { deleteAttempts: { $lt: 24 } }` physically excludes
  dead-letters from the index (smaller, faster sweeper seeks).
- **Trade-off:** the query's `$lt: 24` must exactly match the partial filter, and it
  would **not** serve `countDeadLettered`. The plain compound (already applied) is
  the simpler, more general choice — only revisit if backlog size becomes a problem.

### Verification commands

```js
db.media.getIndexes()
db.media.aggregate([{ $indexStats: {} }])   // item 1: confirm { userId:1 }, { status:1 } were cold

// Item 2: prove the sweeper no longer residual-scans dead-letters
db.media.find({ status: 3 /* PENDING_DELETE */, deleteAttempts: { $lt: 24 } })
  .limit(50).explain("executionStats")
// Expect IXSCAN on { status:1, deleteAttempts:1 }, range as index bounds,
// totalKeysExamined ≈ nReturned, no FETCH-and-discard of dead-lettered rows.
```

---

## `analysis_runs` collection

Schema: [analysis-run.schema.ts](../apps/api/src/analysis-runs/schemas/analysis-run.schema.ts)

**Audit outcome: no missing indexes, no changes applied.** This collection is
well-indexed — every method is served by one of the existing compound/unique/partial
indexes. Two notes for the record:

- ❗ **`{ xid: 1 }` is NOT unused — do not remove.** An initial audit flagged it as
  a candidate (a too-narrow grep found no consumer), but `xid` **is** exposed
  externally as `analysisRun.id` in the conversation-context response
  ([conversation-context.service.ts:124](../apps/api/src/conversations/conversation-context.service.ts#L124))
  and used in a debug log
  ([:75](../apps/api/src/conversations/conversation-context.service.ts#L75)). The
  unique index backs that external-id contract. Keep it.
  - Minor: `xid` still carries the redundant `unique: true, index: true` combo (the
    same cosmetic cleanup applied to the other schemas this session). Harmless — left
    as-is; drop the `index: true` if consistency is wanted.

### Pending investigation

#### 1. Optional — `{ conversationId: 1, createdAt: -1 }` for latest/active-run sorts
- **Which methods:** `findLatestRun` (`{ conversationId }` sort `createdAt:-1`),
  and to a lesser extent `findActiveRun` / `updateCurrentStep`
  (`{ conversationId, status:$nin }` sort `createdAt:-1`).
- **Why it might help:** the existing `{ conversationId:1, status:1, createdAt:-1 }`
  (IB) has prefix `{ conversationId, status }`, **not** `{ conversationId, createdAt }`.
  So a `conversationId`-only query sorting by `createdAt` (or one with a `$nin` on
  `status`, which can't use index bounds) falls back to a **blocking in-memory SORT**
  over the conversation's runs. A dedicated `{ conversationId:1, createdAt:-1 }` would
  stream them in order. It is **not redundant** with IB.
- **Why deferred:** per-conversation run cardinality is small (a run is a full analysis
  of a conversation; `runNumber` increments per conversation), so sorting a handful of
  docs in memory is negligible today. `findExecutingRun` already avoids the issue (its
  `$in` on `status` lets IB SORT_MERGE on `createdAt`).
- **Action:** add `{ conversationId: 1, createdAt: -1 }` **only if** `explain()` shows
  a SORT stage with a non-trivial `totalDocsExamined` under real load. **Not
  recommended pre-launch.**

### Verification commands

```js
db.analysis_runs.getIndexes()
db.analysis_runs.aggregate([{ $indexStats: {} }])

// Is the findLatestRun sort actually cheap (few runs per conversation)?
db.analysis_runs.find({ conversationId: ObjectId("...") })
  .sort({ createdAt: -1 }).limit(1).explain("executionStats")
// A SORT stage is fine IF totalDocsExamined is small. If it grows large under real
// usage → add { conversationId: 1, createdAt: -1 }.
```

---

## `review_periods` collection

Schema: [review-period.schema.ts](../apps/api/src/review-periods/schemas/review-period.schema.ts)

### Already resolved (code-only, no runtime needed)

- ✅ Removed redundant `index: true` on `xid` (`unique: true` already builds the index).
- ✅ Dropped redundant `{ userId: 1 }` — served by the `{ userId: 1, status: 1 }` prefix.

### Pending investigation

#### 1. Confirm the dropped `{ userId: 1 }` had no external consumer
- **Why:** provably redundant for query coverage *within* `ReviewPeriodsRepository`
  (compound-prefix rule), but confirm nothing outside this repo queried it directly.
- **Action:** `$indexStats` on `review_periods`; verify it was cold before shipping.

#### 2. Optional — `{ userId: 1, createdAt: -1 }` for `findByUserId` sort
- **Which method:** `findByUserId` — `{ userId, status:$in? }` sorted `createdAt:-1`.
- **Why it might help:** no existing index covers `createdAt`, so the no-status branch
  falls back to a **blocking in-memory SORT** over the user's review periods. A
  `{ userId:1, createdAt:-1 }` would stream them in order. **Not redundant** with
  `{ userId:1, status:1 }` (prefix is `{userId,status}`, not `{userId,createdAt}`).
- **Why deferred:** review periods per user are few (coarse-grained windows, like
  training years), so sorting a handful of docs is negligible today. Note the
  **status-filtered** branch would still sort in memory even with this index (status
  is a range before the sort key); only `{ userId:1, status:1, createdAt:-1 }` fully
  covers it — not worth it for so few docs.
- **Action:** add `{ userId: 1, createdAt: -1 }` **only if** `explain()` shows a SORT
  stage with a non-trivial `totalDocsExamined` under real load. **Not recommended
  pre-launch.**

### Verification commands

```js
db.review_periods.getIndexes()
db.review_periods.aggregate([{ $indexStats: {} }])   // item 1: confirm { userId: 1 } was cold

// Item 2: is the findByUserId sort actually cheap (few periods per user)?
db.review_periods.find({ userId: ObjectId("...") })
  .sort({ createdAt: -1 }).explain("executionStats")
// A SORT stage is fine IF totalDocsExamined is small. If large under real usage →
// add { userId: 1, createdAt: -1 }.
```

---

## `version_history` collection

Schema: [version-history.schema.ts](../apps/api/src/version-history/schemas/version-history.schema.ts)

### Already resolved (code-only, no runtime needed)

- ✅ **Added `{ userId: 1 }`** to serve `deleteByUserId` (account erasure). Without it
  the `deleteMany({ userId })` full-scans this large, append-heavy collection (one
  snapshot doc per artefact edit/restore) — no other method filters by `userId` alone.
  - **Write-cost trade-off accepted:** every `createVersion` insert (frequent) now
    maintains this extra index to serve a rare-but-compliance-critical erasure. Judged
    worth it: bounded, predictable GDPR erasure > marginal insert cost. Revisit only if
    insert throughput becomes a measured bottleneck.

### Pending investigation

#### 1. `{ xid: 1 }` — potentially unused index AND vestigial field (do NOT drop yet)
- **Evidence it's unused:** traced end-to-end — no repo method queries `xid`; the
  version-history DTO identifies versions by the **`version` integer**, not `xid`
  ([artefacts.service.ts:604-618](../apps/api/src/artefacts/artefacts.service.ts#L604));
  `restoreVersion` looks up by `version`. `xid` appears only at
  [schema:13](../apps/api/src/version-history/schemas/version-history.schema.ts#L13)
  and a test mock (`vh_${version}`). The field looks vestigial — added by the
  external-id convention but never wired, because versions are addressed by
  `(entityType, entityId, version)`.
- **Why not dropped:** "unused in `src`" ≠ "unused at runtime" (see the `analysis_runs`
  false-positive lesson — there `xid` *was* exposed as `analysisRun.id`). Here the DTO
  trace is conclusive, but a migration/script outside `src` could still reference it.
- **Action:** confirm `{ xid: 1 }` is cold via `$indexStats`; grep migrations/ops
  scripts. If clean, drop **both** the index and the field (and its `nanoidAlphanumeric`
  default). Decision, not an auto-drop.

#### 2. Confirm the `{ userId: 1 }` write-cost trade-off against real collection size
- **Why:** the value of the new index scales with collection size; the cost scales with
  insert rate. Both are assumptions until measured.
- **Action:** `db.version_history.stats()` for count/size, and confirm the erasure delete
  now uses the index (below). If the collection turns out small, the index is cheap
  insurance regardless; if huge, it's clearly justified.

### Verification commands

```js
db.version_history.getIndexes()
db.version_history.aggregate([{ $indexStats: {} }])   // item 1: confirm { xid: 1 } is cold
db.version_history.stats()                            // item 2: count & size inform the trade-off

// Item 2: prove deleteByUserId now uses { userId: 1 } instead of a full scan
db.version_history.find({ userId: ObjectId("...") }).explain("executionStats")
// Before: COLLSCAN, totalDocsExamined == collection size.
// After:  IXSCAN on { userId: 1 }, totalDocsExamined ≈ nReturned.
```

---

## `sessions` collection

Schema: [session.schema.ts](../apps/api/src/auth/schemas/session.schema.ts)

### Already resolved (code-only, no runtime needed)

- ✅ Removed redundant `index: true` on `xid` and `refreshTokenHash` (`unique: true`
  already builds each index).
- ✅ Dropped redundant `{ refreshTokenFamily: 1 }` — served by the
  `{ refreshTokenFamily: 1, revokedAt: 1 }` compound prefix (`revokeFamily` always
  filters `revokedAt` too; no `refreshTokenFamily`-only query exists).

### Pending investigation

#### 1. Confirm the dropped `{ refreshTokenFamily: 1 }` had no external consumer
- **Why:** provably redundant for query coverage *within* `SessionsRepository`
  (compound-prefix rule), but confirm nothing outside this repo queried it directly.
- **Action:** `$indexStats` on `sessions`; verify it was cold before shipping.

#### 2. Optional — `{ userId: 1, revokedAt: 1, lastUsedAt: -1 }` for `listActiveByUser`
- **Which method:** `listActiveByUser` — `{ userId, revokedAt:null, expiresAt:{$gt} }`
  sorted `{ lastUsedAt: -1 }`, limit 50.
- **Why it might help:** the existing `{ userId, deviceId, revokedAt }` (SD) has
  `deviceId` as its 2nd key, which this query omits — so only the `userId` prefix
  bounds the scan, `revokedAt`/`expiresAt` filter as residuals, and `lastUsedAt` sort
  falls back to a **blocking in-memory SORT**. A `{ userId:1, revokedAt:1, lastUsedAt:-1 }`
  (ESR order) streams them sorted; `expiresAt:{$gt}` stays a residual range. **Not
  redundant** with SD.
- **Why deferred:** active sessions per user are few (a handful of devices), so sorting
  <50 docs is negligible. `sessions` is also write-heavy (login/rotate churn), so a
  net-new index has real insert cost — only worth it if the sort actually shows up.
- **Action:** add **only if** `explain()` shows a SORT stage with non-trivial
  `totalDocsExamined` under real load. **Not recommended pre-launch.**

#### 3. Do NOT touch the TTL index `{ expiresAt: 1 }` (expireAfterSeconds: 0)
- **Note for future audits:** this is the session reaper, not a query-serving index. It
  will always look "cold" in `$indexStats` (no queries use it) but is load-bearing —
  removing it lets expired sessions accumulate unbounded. Revoked-but-unexpired rows are
  deliberately retained during their TTL window for replay detection. Leave it alone.

### Verification commands

```js
db.sessions.getIndexes()
db.sessions.aggregate([{ $indexStats: {} }])   // item 1: confirm { refreshTokenFamily:1 } was cold
                                                // (note: { expiresAt:1 } TTL always cold — expected, keep it)

// Item 2: is the listActiveByUser sort actually cheap (few sessions per user)?
db.sessions.find({ userId: ObjectId("..."), revokedAt: null, expiresAt: { $gt: new Date() } })
  .sort({ lastUsedAt: -1 }).limit(50).explain("executionStats")
// A SORT stage is fine IF totalDocsExamined is small. If large under real usage →
// add { userId: 1, revokedAt: 1, lastUsedAt: -1 }.
```

---

## `outbox` collection

Schema: [outbox.schema.ts](../apps/api/src/outbox/schemas/outbox.schema.ts)

### Already resolved (code-only, no runtime needed)

- ✅ **Dropped `{ type: 1, status: 1 }` — unused.** No query leads with `type`. The only
  query filtering `type` is `hasPendingByConversationId`
  ([outbox.repository.ts:204-211](../apps/api/src/outbox/outbox.repository.ts#L204)),
  which leads with a `payload.conversationId` **equality** — served by
  `{ 'payload.conversationId': 1, status: 1 }` — with `type` as a residual. `type` is also
  very low cardinality (~3 job types), so a `type`-leading index would be weakly selective
  even if some query used it. Static-analysis call (pre-launch → no `$indexStats`); no query
  regresses.

### Pending investigation

#### 1. `cleanupOldEntries` — `{ status:$in, updatedAt:{$lte} }` not covered by `updatedAt`
- **Why:** the cleanup delete filters `status` ($in) + `updatedAt` (range), but no index
  has `updatedAt`. It uses the `{ status, processAfter }` (OA) `status` prefix and
  residual-filters `updatedAt`. Fine while the outbox is small (completed/failed rows are
  purged regularly); a scan risk only if cleanup lags and the backlog grows.
- **Action:** if the outbox grows large, consider `{ status: 1, updatedAt: 1 }` — confirm
  with `explain()`. **Not recommended pre-launch.**

#### 2. Re-add a `type` index only if an ops "jobs by type" query appears
- **Why:** nothing queries by `type` today. If an admin/metrics view ("pending count per
  type") lands, it would need indexing — but only if `type` leads or is combined with a
  selective key.
- **Action:** revisit `{ type: 1, status: 1 }` (or a better shape) when such a query exists.

### Verification commands

```js
db.outbox.getIndexes()
db.outbox.aggregate([{ $indexStats: {} }])   // confirm the remaining 3 indexes carry the load

// Confirm hasPendingByConversationId uses the conversationId index, not a type scan
db.outbox.find({ "payload.conversationId": "abc", type: { $in: ["analysis.start","analysis.resume"] },
  status: { $in: [0, 1] } }).limit(1).explain("executionStats")
// Expect IXSCAN on { 'payload.conversationId': 1, status: 1 }, type applied as a residual filter.

// Item 1: does cleanupOldEntries residual-scan on updatedAt?
db.outbox.find({ status: { $in: [2, 3] }, updatedAt: { $lte: new Date() } }).explain("executionStats")
```
