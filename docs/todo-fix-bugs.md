# Artefacts Module — Security Review Fixes (To Do)

> Source: end-to-end security review of the `artefacts` module (controller → service →
> repository → schema) and its direct dependencies. The module is **low overall risk** —
> no cross-user IDOR/BOLA, no NoSQL injection, no mass-assignment, no trust of
> client-supplied identity. The items below are scoping/validation/integrity gaps.
>
> Greenfield context (per CLAUDE.md): backend is **not deployed**, no prod data, no
> users. Breaking changes / schema changes are fine; no backfill or migration needed.

Priority order: **1 (Medium) → 2, 3, 4 (Low)**.

---

## 1. [Medium] `finalise` mutates PDP goals without checking they belong to the artefact

**Affected API:** `POST /artefacts/:id/finalise`

**Files:**
- `apps/api/src/artefacts/artefacts.service.ts` (`finaliseArtefact`, ~L301–L349)
- `apps/api/src/pdp-goals/pdp-goals.repository.ts` (`updateGoal`, ~L292)

**Problem:**
`finaliseArtefact` loops over `dto.pdpGoalSelections` and calls
`pdpGoalsRepository.updateGoal(selection.goalId, userOid, …)`. `updateGoal` filters only
by `{ xid: goalXid, userId }` — it never verifies the goal's `artefactId` matches the
artefact being finalised. The `userId` predicate holds (so this is **not** a cross-user
breach), but a user finalising artefact A can pass `goalId`s belonging to their own
artefact B and flip those goals to `STARTED`/`ARCHIVED`, set arbitrary `reviewDate`s, and
cascade action status — from the wrong artefact's flow. This breaks the intended
parent→child ownership boundary and can desync review-period coverage.

**Attack scenario:**
User with two artefacts crafts a `finalise` request on artefact A whose
`pdpGoalSelections` reference artefact B's goal ids, prematurely activating/archiving B's
goals and corrupting B's review scheduling without ever finalising B. Damage confined to
the attacker's own tenant, but violates the per-artefact boundary.

**Fix (choose one):**
- Preferred: in `finaliseArtefact`, fetch the artefact's goals first
  (`pdpGoalsRepository.findByArtefactId(artefactDoc._id, userOid, session)`), build a Set
  of allowed `goalId`s, and reject any `selection.goalId` not in it
  (`BadRequestException` / `NotFoundException`).
- Or: add an `artefactId` predicate to the repo — e.g. a new
  `updateGoalForArtefact(goalXid, userId, artefactId, …)` whose filter is
  `{ xid, userId, artefactId }`, so a non-matching `(goal, artefact, user)` triple →
  `NOT_FOUND`. Keep the ownership-predicate-at-persistence-layer convention.

**Regression tests:**
- finalise artefact A with a goalId belonging to artefact B (same user) → 400/404; B's goal unchanged.
- finalise with a goalId from another user → 404 (assert existing user-scope behaviour).
- finalise with a valid in-artefact goal → succeeds and applies selection.

---

## 2. [Low] `upsertArtefact` filter omits `userId` + live filter — reused client id returns a tombstone

**Affected API:** `POST /artefacts`

**Files:**
- `apps/api/src/artefacts/artefacts.repository.ts` (`upsertArtefact`, ~L67–L93)
- `apps/api/src/artefacts/artefacts.service.ts` (`createArtefact`, ~L90–L159)
- `apps/api/src/artefacts/utils/artefact-id.util.ts` (`createInternalArtefactId`)

**Problem:**
`upsertArtefact` filters on `{ artefactId }` alone (no `userId`, no
`ARTEFACT_LIVE_FILTER`). Tenancy is enforced only *implicitly* because
`artefactId = ${userId}_${clientId}` is built from the JWT `userId`, and an ObjectId
prefix contains no `_`, so cross-user collision is impossible (**no cross-user impact**).
But the missing live filter means: if a user deletes an artefact (tombstoned,
`status = DELETED`, `title = '[deleted]'`) and re-creates with the **same** `clientId`,
`$setOnInsert` is skipped and the upsert returns the **tombstoned** doc. The service then
finds no active conversation and creates a fresh conversation pointing at a `DELETED`
artefact → orphaned conversation + a response showing a deleted entry.

This is a self-inflicted data-integrity bug, not externally exploitable. Flagged because
it removes a defence-in-depth layer (the documented "ownership predicate in every filter"
+ "live filter on reads" rule) and would become a real tenancy hole if the composite-id
scheme ever changes.

**Fix:**
- Add `userId` to the upsert filter (`{ artefactId, userId }`) to make tenancy explicit
  rather than implicit in the id format.
- Handle a tombstoned match: either exclude `DELETED` and mint a fresh `artefactId`
  (treat as create-new), or reject reuse of a client id that maps to a tombstone with a
  clear error.

**Regression tests:**
- create → delete → create with same `clientId`: assert a live artefact (not a
  `[deleted]` doc) and no orphaned conversation.
- create with a `clientId` already live: assert idempotent return of the same live artefact.

---

## 3. [Low] `ListArtefactsDto.status` is an unvalidated integer; `cursor` cast can 500

**Affected API:** `GET /artefacts`

**Files:**
- `apps/api/src/artefacts/dto/list-artefacts.dto.ts` (~L4–L8)
- `apps/api/src/artefacts/artefacts.service.ts` (`listArtefacts`, ~L863–L872)
- `apps/api/src/artefacts/artefacts.repository.ts` (`listArtefacts`, ~L108–L116)
- `packages/shared/src/enums/artefact-status.enum.ts` (`DELETED = -999`)

**Problem:**
`status` is `z.coerce.number().int().optional()` — any integer is accepted, not
constrained to `ArtefactStatus`. The repo applies `filter.status = query.status`
verbatim. Since `DELETED = -999` is a real enum value, `GET /artefacts?status=-999`
lists the caller's **own** tombstoned artefacts, bypassing the default
`status ≠ DELETED` live filter. Impact is minimal (tombstones are content-wiped and still
`userId`-scoped — no cross-user / sensitive leak), but it defeats the live-filter intent.

Separately, `cursor` is `z.string().optional()` and the service does
`new Types.ObjectId(query.cursor)` with no validation; a malformed cursor throws a
`BSONError` → `500` instead of `400`.

**Fix:**
- Constrain status, e.g. `status: z.coerce.number().pipe(z.nativeEnum(ArtefactStatus)).optional()`,
  and explicitly reject/ignore `DELETED` in the list path.
- Validate `cursor` as a 24-hex string (`z.string().regex(/^[a-f\d]{24}$/i)`) or guard the
  `ObjectId` construction and throw `BadRequestException` on failure.

**Regression tests:**
- `GET /artefacts?status=-999` → does not return tombstones (or 400).
- `GET /artefacts?status=999999` → 400 (invalid enum).
- `GET /artefacts?cursor=not-an-objectid` → 400, not 500.

---

## 4. [Low — verify product intent first] No state-machine validation on non-archive status transitions

**Affected API:** `PUT /artefacts/:id/status`

**Files:**
- `apps/api/src/artefacts/artefacts.service.ts` (`updateArtefactStatus`, ~L238–L273)

**Problem:**
For any `status` other than `ARCHIVED`, the service does a direct
`updateArtefactById(..., { status: dto.status })` with no check that the transition is
legal (e.g. `IN_CONVERSATION → COMPLETED` directly, or `COMPLETED → IN_REVIEW`).
Ownership is correctly enforced, so this is a lifecycle/integrity concern, not an
authorization one. Other endpoints assume the state machine: `finalise` requires
`IN_REVIEW`; `edit`/`restore` require `IN_REVIEW`. A client can skip those gates by
setting status directly.

**Attack scenario (own data):**
User jumps an entry straight to `COMPLETED` (bypassing the `IN_REVIEW`-gated finalise flow
and its PDP-goal application), or reopens a `COMPLETED` entry to `IN_REVIEW` to re-edit a
finalised artefact — undermining invariants other features rely on.

**Fix:**
- Confirm the intended artefact lifecycle, then enforce an allowed-transition map
  (current `status` → permitted next states) in `updateArtefactStatus`; reject illegal
  transitions with `BadRequestException`.

**Regression tests:**
- `IN_CONVERSATION → COMPLETED` directly → 400.
- `COMPLETED → IN_REVIEW` → 400 (or explicitly allowed, per product decision).
- Legal transitions succeed.

---

## Verified safe (no action needed — documented to avoid re-litigation)

- **Identity from input:** every endpoint derives `userId`/`role` from `@CurrentUser()`
  (JWT); Zod strips unknown body keys, so injected `userId`/`ownerId` fields are dropped.
- **NoSQL operator injection:** all DTO fields are Zod scalars/enums; no request object is
  spread into a filter; no `$where`/`$regex`/`$expr` from input.
- **Mass assignment on edit:** `editArtefact` merges only `title` / `composedDocument`
  (by `sectionId`) / `capabilities` (by `code`); `status`, `userId`, `readinessScore`,
  `evidence` stay server-owned.
- **Note id forgery:** `reconcileNotes` mints xids server-side; unknown client xids are
  treated as new — ids cannot be forged or hijacked.
- **Bulk mutations:** `markDeleted` / `markDeletedByUserId` (`updateMany`) are scoped to
  owner-derived ids or a single `userId`; never receive raw filters.
- **Per-`:id` cross-user access:** every read/mutate filters by `{ xid|_id, userId }`;
  foreign id → `NOT_FOUND`.

---

# Artefacts Module — Index Coverage Fixes (To Do)

> Source: MongoDB/Mongoose index review of the `artefacts` collection. Cross-module
> usage was checked: every consumer (`init`, `outbox/analysis-completion`, `processing`,
> `conversations`, `review-periods`, `account-cleanup`) calls the same repo methods, so the
> repo's methods are the complete query surface.
>
> Current indexes (`apps/api/src/artefacts/schemas/artefact.schema.ts`):
> `_id` (default), `xid` unique (L97), `artefactId` unique (L100), `userId` (L103),
> `{userId,status}` (L166), `{userId,createdAt:-1}` (L167), `{userId,status,completedAt}` (L168).
>
> Greenfield (no prod data, `autoIndex` on): index drops/adds rebuild on boot — no migration.

## 5. [Low-Moderate] List pagination sort `{_id:-1}` is not index-backed

**Affected:** `GET /artefacts` (`listArtefacts`), used by the artefacts controller and
`review-periods.service.ts:291`.

**Files:**
- `apps/api/src/artefacts/artefacts.repository.ts` (`listArtefacts`, ~L95–L130)
- `apps/api/src/artefacts/schemas/artefact.schema.ts` (~L166–L168)

**Problem:**
`listArtefacts` filters `{ userId, status?, _id: {$lt: cursor}? }` and sorts `{_id:-1}`
(keyset pagination). No existing index ends in `_id`, so:
- Status-filtered path: `{userId,status}` gives equality match, but the `_id` sort/range
  needs an in-memory SORT stage.
- Default path: `status:{$ne:DELETED}` is a range, which blocks any `_id` index suffix; the
  planner does an in-memory sort or scans the global `_id` index filtering userId as residual.

Per-user portfolios are small today, so impact is low-moderate, but this is the primary
list endpoint.

**Fix:** add `_id:-1` as the trailing key on the userId-prefixed indexes (see item 6 for
the consolidated set).

**Verify:** run `db.artefacts.find({userId, status}).sort({_id:-1}).explain()` and confirm
no `SORT` stage / `IXSCAN` over a single user's range.

## 6. [Low] Unused + redundant indexes on the artefacts collection

**Files:** `apps/api/src/artefacts/schemas/artefact.schema.ts` (~L103, L166–L168)

**Problem (all verified against the full repo query surface):**
- `{userId:1}` (L103, `@Prop({ index: true })`) — **redundant**: it's the prefix of
  `{userId,status}`, `{userId,createdAt}`, and `{userId,status,completedAt}`. Any
  userId-only query is served by those.
- `{userId:1, createdAt:-1}` (L167) — **unused**: nothing filters or sorts artefacts by
  `createdAt`. `countByUser`'s `since` branch (the only createdAt query) is never called
  (callers: `init.service.ts` and `artefacts.service.ts`, both pass no `since`); list sorts
  by `_id`.
- `{userId:1, status:1, completedAt:1}` (L168) — **unused suffix**: nothing filters/sorts
  by `completedAt` (only written in `finalise`, never queried). Its prefix duplicates
  `{userId,status}`.
- `xid` (L97) declares both `unique: true` and `index: true` — redundant declaration
  (Mongoose builds one unique index; can emit a duplicate-index warning). Keep `unique`,
  drop `index: true`.

**Fix — consolidated index set** (covers every query issued AND backs pagination):
```ts
// keep: xid unique (drop the extra `index: true`), artefactId unique, _id
ArtefactSchema.index({ userId: 1, _id: -1 });            // default list + pure-userId count
ArtefactSchema.index({ userId: 1, status: 1, _id: -1 }); // status list + countByUser(status) + markDeletedByUserId
// remove: { userId:1 }, { userId:1, createdAt:-1 }, { userId:1, status:1 }, { userId:1, status:1, completedAt:1 }
```
Net 6 → 5 indexes; removes 2 unused + 1 redundant and fixes the unindexed sort, reducing
write amplification.

**Caveat — confirm before dropping F/G:** the `createdAt` and `completedAt` indexes are
unused *by current code*. If the roadmap includes "entries completed in a date range"
(review-period coverage) or recent-by-date dashboards, they may be intentional
forward-looking indexes. Check with the team rather than dropping blindly.

**Regression/verification:**
- After change, `explain()` each repo query (`findByXid`, `upsertArtefact`,
  `updateArtefactById`, `listArtefacts` both paths, `countByUser`, `markDeletedByUserId`)
  and confirm `IXSCAN` (not `COLLSCAN`/`SORT`).
- Confirm `xid`/`artefactId` uniqueness still enforced (duplicate insert → E11000).

---

# Conversations Module — Security & Index Review Fixes (To Do)

> Source: end-to-end API, security, and database index review of the `conversations`
> module (controller → service → repository → schemas) and its direct dependencies. The
> module is **low overall risk** — every request-input-bearing read/mutate is `userId`-scoped
> at the persistence layer, identity is always taken from the JWT (`@CurrentUser()`), Zod
> DTOs strip unknown keys (no mass-assignment), and the resume `value` is validated against
> the question's own options (never spread into a query or graph payload). No IDOR/BOLA, no
> NoSQL operator injection, no unscoped/accidental-bulk mutations were found.
>
> Greenfield context (per CLAUDE.md): backend is **not deployed**, no prod data, no users.
> Breaking changes / schema changes are fine; no backfill or migration needed.
>
> Current indexes:
> - `conversations`: `xid` unique (+ redundant `index:true`), `userId` (single), `artefact`
>   (single), `{userId,_id:-1}`, `{artefact,status}`.
> - `messages`: `xid` unique (+ redundant `index:true`), `conversation` (single),
>   `{conversation,_id:-1}`, `{userId,idempotencyKey}` unique.

Priority order: all **Low**. Suggested: **7 (indexes) → 8 → 9**.

## 7. [Low] Redundant single-field indexes on `conversations` and `messages`

**Files:**
- `apps/api/src/conversations/schemas/conversation.schema.ts` (~L13–L19, L36–L38)
- `apps/api/src/conversations/schemas/message.schema.ts` (~L29–L32, L99–L103)

**Problem (verified against the full module query surface — these collections are
registered only in `conversations.module.ts`, so the module's repo methods are the complete
query surface):**
- `Conversation.userId` single index (`@Prop({ index: true })`, L16) — **redundant**: it's
  the prefix of `{userId,_id:-1}`, which serves every `{userId}` equality (incl.
  `findConversationIdsByUser` and `markDeletedByUserId`).
- `Conversation.artefact` single index (`@Prop({ index: true })`, L19) — **redundant**:
  prefix of `{artefact,status}`, which serves `findActiveConversationByArtefact(/ByArtefacts)`
  and `findIdsByArtefactIds`.
- `Message.conversation` single index (`@Prop({ index: true })`, L32) — **redundant**:
  prefix of `{conversation,_id:-1}`, which serves `listMessages`, `getLastMessageRole`,
  `hasLaterAssistantMessage`, and the conversation-id cascades.
- Both `xid` props declare `unique: true` **and** `index: true` — redundant declaration
  (Mongoose builds one unique index; can emit a duplicate-index warning). Keep `unique`,
  drop `index: true`.

These add 2–3 extra index trees to maintain on the hottest collection (messages) with no
read benefit — pure write amplification + storage.

**Fix — consolidated index set:**
```ts
// conversation.schema.ts — keep xid unique (drop extra `index:true`)
ConversationSchema.index({ userId: 1, _id: -1 });   // keep
ConversationSchema.index({ artefact: 1, status: 1 }); // keep
// remove @Prop index:true on userId and artefact

// message.schema.ts — keep xid unique (drop extra `index:true`)
MessageSchema.index({ conversation: 1, _id: -1 });          // keep
MessageSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true }); // keep
// remove @Prop index:true on conversation
```
Greenfield + `autoIndex` on → drops/adds rebuild on boot, no migration.

**Optional (only if count volume grows):** `hasCompleteMessages` / `hasProcessingMessages`
issue `countDocuments({ conversation, role, status })`, which uses the
`{conversation,_id:-1}` prefix for `conversation` equality but scans `role`+`status` as
residual filters. With < 50 messages/conversation this is negligible; if it ever matters,
add `{ conversation: 1, role: 1, status: 1 }`.

**Verify before dropping:** `db.conversations.aggregate([{$indexStats:{}}])` and
`db.messages.aggregate([{$indexStats:{}}])` to confirm the single-field indexes show no
independent usage; then `explain()` each repo query and confirm `IXSCAN` (no `COLLSCAN`/`SORT`).

**Regression test:** snapshot the expected index set per collection so accidental
re-introduction of the redundant indexes is caught.

## 8. [Low] `updateMessage` mutates by `_id` without a `userId` predicate

**Affected:** `updateMessage` (used by `editMessage` and `handleResume`).

**Files:**
- `apps/api/src/conversations/conversations.repository.ts` (`updateMessage`, ~L227–L248)
- `apps/api/src/conversations/conversations.repository.interface.ts` (~L112–L116)

**Problem:**
`findOneAndUpdate({ _id: messageId, ...MESSAGE_LIVE_FILTER }, { $set: data })` is scoped by
`_id` + live-status only, **not** by `userId`. All current callers pre-authorize the id
(`editMessage` via `assertModifiableUserMessage`; `handleResume` via
`findMessagesByXids({ userId })`), so there is **no cross-user breach today**. But per
CLAUDE.md the owner predicate is supposed to live in the filter as defence-in-depth, not
solely in caller discipline — a future caller that forgets the pre-check (e.g. wiring this
to a new request-fed route) would turn it into an IDOR with no compiler/test signal.

**Fix:** thread the owner through and add it to the filter, matching `updateArtefactById` /
`findConversationById`:
```ts
updateMessage(messageId, userId, data, session) =>
  findOneAndUpdate({ _id: messageId, userId, status: { $ne: MessageStatus.DELETED } }, { $set: data }, ...)
```
A non-matching `(id, userId)` → `null` (NOT_FOUND), as the convention requires.

**Regression test:** `updateMessage` with a foreign-but-valid `_id` + `userId` returns
`null` (no mutation).

## 9. [Low] Harden the two `userId`-unscoped SYSTEM READ methods

**Affected:** `findMessageById`, `findArtefactRefByConversationId`.

**Files:**
- `apps/api/src/conversations/conversations.repository.ts` (~L191, ~L379)
- `apps/api/src/conversations/conversations.repository.interface.ts` (~L89–L100, ~L171–L184)

**Problem:**
Both query by `_id` with **no `userId` predicate**. This is **intentional and documented**
(SYSTEM READ): current callers (`ConversationContextService.buildActiveQuestion` passing the
run's stored `currentQuestion.messageId`, and the outbox processor) only ever pass
server-derived ids, never request input. **No issue today.** Flagged as a latent boundary:
if a future controller route ever feeds a request-supplied id into either method, it becomes
a cross-user IDOR with no signal.

**Fix (no code change required now):** make the boundary enforceable rather than
convention-based — add a regression/architecture test asserting these methods are never
reached from a controller with raw request input, or rename to scream the hazard
(e.g. `findMessageByIdInternal`). Keep them off any request-fed path.

**Regression test:** assert `buildActiveQuestion` only passes the run's stored `messageId`;
optional lint/test that controllers don't import these methods.

---

## Conversations — Verified safe (no action needed — documented to avoid re-litigation)

- **Identity from input:** every endpoint derives `userId` from `@CurrentUser()` (JWT); no
  route trusts a `userId`/`ownerId` from body or query. Global `JwtAuthGuard` +
  `ZodValidationPipe` apply (no `@Public()` in this module).
- **Ownership scoping:** every request-input read/mutate is `userId`-scoped —
  `findConversationByXid`, `findMessagesByXids`, `findMessageByIdempotencyKey` all filter by
  `userId`; foreign xid/key → `NOT_FOUND`.
- **Cross-conversation routing:** `assertModifiableUserMessage` enforces membership
  (`objectIdsEqual(messageConvId, conversation._id)`) so a user can't route a modification of
  their own message through a different (idle) conversation to dodge the executing-run guard.
  Every non-editable rejection returns an opaque 404 (no xid enumeration).
- **Resume injection:** `handleResume` validates `selectedKey(s)` against `question.options`
  and forwards only a freshly-built domain object (`{entryType}`/`{selectedCodes}`/`true`) —
  the raw `value: z.record(z.unknown())` is never spread into a query or the graph payload.
- **Idempotency replay:** keys are `{userId}`-scoped; replaying a key against a *different*
  conversation → 409 (not a silent cross-conversation message return).
- **Bulk mutations:** all `updateMany` calls (`markDeleted*`, `markDeletedByUserId`) carry an
  explicit `{_id:$in}` / `{conversation:$in}` / `{userId}` predicate plus `status:$ne DELETED`
  — none can degrade to `{}`; ids are server-derived cascade inputs.
- **No dangerous ops:** no `deleteMany`, `findByIdAndUpdate`, `replaceOne`, `bulkWrite`,
  `$where`/`$regex`/`$expr` from input, or raw collection access anywhere in the module.

---

# Media Module — Security & Index Review Fixes (To Do)

> Source: end-to-end API, security, and database index review of the `media` module
> (controller → service → repository → schema + sweeper cron) and its direct dependencies.
> The module is **low overall risk** — both HTTP endpoints derive identity from the JWT,
> scope every request-input read/mutate by `userId` (`findByXid`/`updateStatus` → foreign
> id = NOT_FOUND), never spread request input into filters/updates, and issue presigned URLs
> (time-boxed bearer grants) only after owner verification and only for ATTACHED media.
> Uploads are constrained by an audio-only mimeType regex, positive-int size, a 100MB cap,
> signed content-type/length headers, and a post-upload S3 HEAD re-check. No IDOR/BOLA, no
> NoSQL injection, no ObjectId-cast gaps, no unscoped/accidental-bulk mutations found.
>
> Greenfield context (per CLAUDE.md): backend is **not deployed**, no prod data, no users.
> Breaking changes / schema changes are fine; no backfill or migration needed.
>
> Current indexes (`apps/api/src/media/schemas/media.schema.ts`):
> `_id` (default), `xid` unique (+ redundant `index:true`, L12), `userId` (single, L15),
> `{userId,status}` (L65), `{status}` (L67), `{refDocumentId,refCollection,status}` (L71).
>
> Cross-module query surface checked: the `media` collection is registered only in
> `MediaModule.forFeature`, so the repo methods are the complete query surface. Consumers:
> `conversations.service.ts` (`updateStatus`, `markPendingDeleteByMessageIds`),
> `account-cleanup.service.ts` (`markPendingDeleteByUser`).

Priority order: **10 (Low-Moderate) → 11, 12, 13, 14 (Low)**.

## 10. [Low-Moderate] Sweeper queries filter `deleteAttempts` but the index is `status`-only

**Affected:** `findPendingDeleteBatch`, `countDeadLettered` (the hourly media sweeper hot path).

**Files:**
- `apps/api/src/media/media.repository.ts` (`findPendingDeleteBatch` ~L151–165, `countDeadLettered` ~L167–178)
- `apps/api/src/media/media-sweeper.service.ts` (`sweep`, ~L45–95)
- `apps/api/src/media/schemas/media.schema.ts` (~L66–67)

**Problem:**
Both queries filter `{ status: PENDING_DELETE, deleteAttempts: <range> }`. The only matching
index is the single-field `{status:1}`, which serves the `status` equality but then scans
**every** `PENDING_DELETE` row to apply the `deleteAttempts` predicate. The sweeper runs
hourly and can iterate up to `MAX_BATCHES_PER_RUN (500) × BATCH_SIZE (10) = 5000` rows/run.
If S3 deletes fail and rows accumulate (or dead-lettered rows pile up at
`deleteAttempts ≥ 24`), each sweep re-scans the full `PENDING_DELETE` set — including
dead-letters it will never act on — growing sweep cost and lock time on the deletion path.

**Fix — replace the bare `{status:1}` with a compound:**
```ts
MediaSchema.index({ status: 1, deleteAttempts: 1 });
```
This fully covers `findPendingDeleteBatch` (`status` eq + `deleteAttempts < 24`) and
`countDeadLettered` (`status` eq + `deleteAttempts ≥ 24`), and still serves any status-only
query as a prefix. Greenfield + `autoIndex` on → rebuilds on boot, no migration.

**Regression/verification:**
- `explain()` `findPendingDeleteBatch` → `IXSCAN` over `{status,deleteAttempts}` with no
  residual `FILTER` on `deleteAttempts`.
- Sweeper test: dead-letter rows (`deleteAttempts ≥ 24`) are excluded from the batch and
  counted by `countDeadLettered`.

## 11. [Low] Redundant `userId` single-field index + duplicate `xid` index declaration

**Files:** `apps/api/src/media/schemas/media.schema.ts` (~L12, L15, L64–65)

**Problem (verified against the full module query surface):**
- `userId` single index (`@Prop({ index: true })`, L15) — **redundant**: it's the leading
  prefix of `{userId,status}` (L65), so any `{userId}` equality (`markPendingDeleteByUser`,
  and the dead `findByUser` — see item 14) is served by the compound.
- `xid` (L12) declares both `unique: true` and `index: true` — redundant declaration
  (Mongoose builds one unique index; can emit a duplicate-index warning). Keep `unique`,
  drop `index: true`.

Pure write amplification on a collection written on every upload, attach, and deletion
transition; no read benefit.

**Fix:** drop `@Prop({ index: true })` on `userId`; remove `index: true` from the `xid`
prop (keep `unique: true`). Do this alongside item 14 so the `userId`-index drop is
unambiguously safe.

**Verify before dropping:** `db.media.aggregate([{$indexStats:{}}])` to confirm the
single-field `userId` index shows no independent usage.

**Regression test:** index-set snapshot per collection to catch re-introduction.

## 12. [Low] `mediaType` and `mimeType` validated independently — no cross-consistency check

**Affected API:** `POST /media/initiate`

**Files:**
- `packages/shared/src/dto/media.dto.ts` (`InitiateUploadRequestSchema`, ~L6–12)
- `apps/api/src/media/media.service.ts` (`initiateUpload`, ~L59–103)
- consumer: `apps/api/src/conversations/conversations.service.ts` (~L357–361, derives
  `MessageType` from the stored `mediaType`)

**Problem:**
The schema validates `mediaType: z.nativeEnum(MediaType)` (accepts e.g. `IMAGE`) and
`mimeType` against an **audio-only** regex (`^audio/(webm|mp4|m4a|mpeg|wav)$`) independently.
A client can declare `mediaType: IMAGE` with `mimeType: audio/mp4`. The persisted
`mediaType` is later trusted by `conversations.sendMessage` to choose `MessageType.AUDIO`
vs `IMAGE`. No security boundary is crossed (file is owner-scoped, size-capped, content-type
pinned by the signed URL and re-verified on attach), but the `mediaType`/`mimeType` pair can
be internally inconsistent → a message typed `IMAGE` carrying audio.

**Fix:**
- Add a Zod `.refine()`/`superRefine` cross-checking `mimeType` matches `mediaType` (audio
  mimeTypes ⇒ `AUDIO`), **or**
- If only audio is supported today, narrow `mediaType` to `z.literal(MediaType.AUDIO)` to
  reject image declarations outright and make intent explicit.

**Regression tests:**
- `initiate` with `mediaType: IMAGE` + audio mimeType → 400.
- matching pair → 200.

## 13. [Low] `markPendingDeleteByMessageIds` is not `userId`-scoped (system cascade)

**Affected:** `markPendingDeleteByMessageIds` (sole caller: `conversations` deletion cascade).

**Files:** `apps/api/src/media/media.repository.ts` (~L109–129)

**Problem:**
The `updateMany` filters `{ refDocumentId: {$in}, refCollection: MESSAGES, status: ATTACHED }`
with no `userId` predicate. **No cross-user impact today** — `refDocumentId` (a message
`_id`) uniquely identifies the attached media, each message belongs to one user, and the
caller passes owner-verified message ids. The safety rests on caller discipline rather than
the filter (contrast the module's own `updateStatus`, which scopes by `userId`).

**Fix (optional hardening, no change required now):**
- If a `userId` is available at the call site, add it to the filter as defence-in-depth, **or**
- Document the SYSTEM-WRITE contract on the interface (as the `conversations` repo does for
  its SYSTEM READs) so a future caller can't quietly turn it into a cross-user write.

**Regression test:** cascade test asserting only the target message's media transitions to
`PENDING_DELETE`; media attached to a different message is untouched.

## 14. [Low] `findByUser` is dead code

**Files:**
- `apps/api/src/media/media.repository.ts` (`findByUser`, ~L99–107)
- `apps/api/src/media/media.repository.interface.ts` (~L38)

**Problem:**
`grep` across `apps/api/src` finds no production caller of `findByUser` (only the definition
and tests). It returns every media row's `bucket`/`key` for a user — storage internals — and
is the only userId-only query, so its presence makes the redundant `userId` index (item 11)
look "used."

**Fix:** remove `findByUser` from the repo + interface (greenfield — no compatibility
concern), or wire it to its intended consumer if one is planned. Removing it makes item 11's
`userId`-index drop unambiguously safe.

---

## Media — Verified safe (no action needed — documented to avoid re-litigation)

- **Identity from input:** both endpoints derive `userId` from `@CurrentUser()` (JWT); no
  route trusts a `userId`/`ownerId` from body or query. Global `JwtAuthGuard` +
  `ZodValidationPipe` apply (no `@Public()` in this module).
- **Ownership scoping:** `findByXid`/`updateStatus` filter `{xid, userId}` → foreign xid =
  NOT_FOUND. `validateMediaUpload` adds a redundant `objectIdsEqual` + `status===PENDING`
  check (harmless defence-in-depth).
- **Presign gating:** presigned download URLs (1h bearer grants) are issued only after owner
  verification and only for ATTACHED media; non-ATTACHED → `downloadUrl: null`.
- **Upload constraints:** audio-only mimeType regex, positive-int `sizeBytes`, 100MB cap,
  signed content-type + content-length headers (S3 rejects mismatches with 403), and a
  post-upload S3 HEAD re-check of content-type and actual size. S3 key namespaces objects by
  `userId` (`media/{userId}/{xid}.ext`).
- **No mass assignment:** `create`/`updateStatus` build explicit field lists; no request
  object is spread into a filter or `$set`.
- **ObjectId casts:** every `new Types.ObjectId(...)` takes a JWT `userId` or a DB-sourced
  `_id` string — never raw request input; `:mediaId` is an xid matched as a string (no cast).
- **Bulk mutations:** all `updateMany` calls carry an explicit `_id`/`userId`/`refDocumentId`
  predicate plus a `status` guard — none can degrade to `{}`. Sweeper queries are
  intentionally global (system cron, no user context).

---

# Dashboard Module — Security & Index Review Fixes (To Do)

Greenfield: backend not deployed, no prod data/users, `autoIndex` on (indexes rebuild on
boot) — so breaking schema/index changes are fine, no migration/backfill needed.

**Module shape (important context):** the `dashboard` module has **no controller, no routes,
no schema, and no repository of its own**. `DashboardService.getDashboard(userId)` is a
read-only aggregation surfaced only via `GET /init`
(`InitController.getInit` → `InitService.getInit` → `dashboardService.getDashboard`). It
accepts **no** client-supplied identifiers — `userId` comes from `@CurrentUser()` (JWT) — and
fans out to three other modules:

- `artefactsService.listArtefacts(userId, { limit: 5 })`
- `pdpGoalsRepository.findByUserId(userId, [NOT_STARTED, STARTED], { limit: 5, sortByReviewDate: true, dueBefore: now+30d })`
- `pdpGoalsRepository.countByUserId(userId, [NOT_STARTED, STARTED])`
- `reviewPeriodsService.getActiveCoverageSummary(userId)` → `findActiveByUserId({ userId, status: ACTIVE })` (+ cache-gated `computeCoverage`)

**Overall risk: LOW (effectively none).** Read-only, fully `userId`-scoped, no mutations, no
IDOR surface, no user-controlled query operators. No High/Medium/Critical items. The only
genuinely dashboard-owned action is the Low layering cleanup below (item 15); the index
observations (items 16–17) are on schemas owned by **other modules** and are recorded here
only because dashboard reads from them — fix them in those modules' reviews.

## 15. [Low] `DashboardService` constructs a Mongo driver type in the domain layer

**Files:**
- `apps/api/src/dashboard/dashboard.service.ts` (`getDashboard`, L23)
- `apps/api/src/pdp-goals/pdp-goals.repository.interface.ts` (`findByUserId` L84, `countByUserId` L102)

**Problem:**
`getDashboard` does `const userObjectId = new Types.ObjectId(userId)` and passes it to the
pdp-goals repo. CLAUDE.md prohibits Mongo driver vocabulary (`Types.ObjectId`) in the
service/domain layer — the string→ObjectId conversion belongs in the repository. The leak is
baked into the pdp-goals repo *interface*, which declares `userId: Types.ObjectId` for
`findByUserId`/`countByUserId`. No security or runtime impact; purely architectural drift that
matches existing drift elsewhere.

**Fix:** change `IPdpGoalsRepository.findByUserId`/`countByUserId` to accept `userId: string`
and convert internally (mirroring `replaceNotes`/`countByUser` on the artefacts repo), then
have `DashboardService` pass `userId` directly with no `Types.ObjectId` construction. Low
priority — bundle with a pdp-goals module pass.

**Suggested test:** none new (behaviour-preserving refactor); existing pdp-goals repo tests cover it.

## 16. [Low] Possible redundant indexes on PdpGoal (owned by pdp-goals module)

> **Superseded by item 31** — the full pdp-goals module review confirmed and expanded this analysis.

**Files:**
- `apps/api/src/pdp-goals/schemas/pdp-goal.schema.ts` (`xid` L33, `userId` L39, compound L69, `{artefactId:1}` L70)

**Problem (surfaced by dashboard queries, fix belongs to pdp-goals review):**
- `userId` single-field index (`@Prop({ index: true })`, L39) is redundant — it is the leading
  prefix of `{ userId: 1, status: 1, reviewDate: 1 }` (L69), which already serves dashboard's
  `findByUserId` (`{userId, status:$in, reviewDate:$lte}` sort `{reviewDate:1}`) and
  `countByUserId` (`{userId, status:$in}`).
- `xid` is declared `unique: true` **and** `index: true` (L33) — `unique` already builds the
  index, so `index: true` is a duplicate declaration.
- `{ artefactId: 1 }` (L70) is **not** used by any dashboard query → `Needs verification
  globally` (it likely serves `findByArtefactId` within pdp-goals; do not drop without
  checking that module).

**Fix (in the pdp-goals module review):** drop the single-field `userId` index and the
duplicate `index: true` on `xid`; keep `{userId:1,status:1,reviewDate:1}`. Verify
`{artefactId:1}` usage in pdp-goals before any change. Confirm with `$indexStats` /
`explain()` and add a schema-index snapshot regression test.

## 17. [Low] Possible redundant indexes on ReviewPeriod (owned by review-periods module)

> **Superseded by item 34** — the full review-periods module review confirmed and expanded this analysis.

**Files:**
- `apps/api/src/review-periods/schemas/review-period.schema.ts` (`xid` L13, `userId` L16, compound L40)

**Problem (surfaced by dashboard queries, fix belongs to review-periods review):**
- `userId` single-field index (L16) is redundant — leading prefix of `{ userId: 1, status: 1 }`
  (L40), which exactly serves dashboard's `findActiveByUserId` (`{userId, status:ACTIVE}`).
- `xid` is `unique: true` + `index: true` (L13) — duplicate declaration; drop `index: true`.

**Fix (in the review-periods module review):** drop the single-field `userId` index and the
duplicate `index: true` on `xid`; keep `{userId:1,status:1}`. Confirm with `$indexStats` and a
snapshot regression test.

**Index coverage note (no fix needed):** every dashboard-triggered query is served by an
existing compound-index prefix. The only in-memory sorts are (a) artefacts `listArtefacts`
sort `{_id:-1}` — limit-5 trivial, and already tracked under **Artefacts items 5–6**; and (b)
review-periods `computeCoverage` artefact scan (`{userId, status:COMPLETED}` limit 1000, sort
`{_id:-1}`) — cache-gated and miss-only, a review-periods concern. No dashboard-specific index
gap exists.

---

## Dashboard — Verified safe (no action needed — documented to avoid re-litigation)

- **No own surface:** dashboard exposes no endpoint, schema, or repository — its only entry is
  `GET /init`, protected by the global `JwtAuthGuard` (no `@Public()`).
- **Identity from token:** `getDashboard` receives `user.userId` from `@CurrentUser()` (JWT)
  and threads it to every downstream call. It reads no `userId`/`ownerId`/`tenantId` from body
  or query — in fact it accepts **no** client input at all (the `/init` headers
  `x-app-version`/`x-platform` feed only version-policy, not dashboard).
- **No IDOR/BOLA:** no resource identifier is ever accepted from the client, so there is
  nothing to enumerate or substitute.
- **Ownership scoping:** all four reads filter by `userId` —
  `listArtefacts({userId,...})`, `findByUserId({userId,status})`,
  `countByUserId({userId,status})`, `findActiveByUserId({userId,status:ACTIVE})`.
- **Read-only:** no `updateMany`/`deleteMany`/`findOneAndUpdate`/upsert/`bulkWrite`/raw
  collection ops in the dashboard path — zero mutations.
- **No injectable operators:** `$in`/`$ne`/`$lte` in the queries are all server-derived
  constants (status enums, `now+30d`), never user-controlled — no NoSQL-injection surface.
- **Cache isolation:** review-periods coverage cache key is namespaced by `userId`
  (`coverage:{userId}:{xid}`) — no cross-user cache bleed.
- **Resilience:** `InitService` wraps the dashboard fetch in `Promise.allSettled` and returns
  `dashboard: null` on failure rather than failing the whole `/init` response.

---

# LLM Module — Security & Index Review Fixes (To Do)

Greenfield: backend not deployed, no prod data/users.

**Module shape (important context):** the `llm` module is a **provider-only** module — no
controller, no routes, **no schema, no repository, no database access of any kind**
(`grep` for `InjectModel`/`mongoose`/`.find(`/`updateMany`/`ObjectId`/`$where`/`$regex` across
`apps/api/src/llm/` returns nothing). `LLMService` is a stateless integration wrapper with two
methods, consumed only internally by the processing pipeline and portfolio-graph nodes:

- `invokeStructured<T>(messages, schema, options)` — OpenAI structured output via LangChain
  (`withStructuredOutput(schema)`), output constrained to the Zod schema.
- `transcribeAudio(audioUrl)` — AssemblyAI transcription.

**Overall risk: LOW (no security or database risk).** No HTTP surface to attack, no datastore,
no resource ownership. The only server-side fetch (`audio_url` → AssemblyAI) uses a
server-minted, owner-scoped presigned URL
(`mediaService.getPresignedUrl(message.userId, media.xid)`,
`processing.service.ts:122`) — **not** raw client input, so there is no user-controlled SSRF.
No High/Medium/Critical items; the two fixes below are Low.

## 18. [Low] `invokeStructured` debug-logs full prompt content (potential pre-redaction PII in logs)

**Files:**
- `apps/api/src/llm/llm.service.ts` (`invokeStructured`, L95–97)

**Problem:**
`this.logger.debug(...messages.map(m => \`[${m.type}] ${m.content}\`)...)` logs every message's
full text. `invokeStructured` runs in the **cleaning stage** and graph nodes that operate on
transcribed/raw user content **before** the redaction stage
(`processing.service.ts`: cleaning L141 precedes redaction L210). In this medical-portfolio
context that content can contain patient/clinician PII. If `debug` level is ever enabled in a
deployed environment, unredacted PII lands in application logs (a UK GDPR exposure given the
data class). Low because debug is normally off in prod, but the blast radius is sensitive.

**Fix:** drop message `content` from the debug line (log only `m.type`, message count, model),
or route it through the redaction utility, or gate behind an explicit `LLM_DEBUG_PROMPTS` flag
that defaults off; ensure production log level is `info`+.

**Suggested tests:** spy on `logger.debug` in `invokeStructured` and assert the payload
contains no raw `content`; a config guard test that prod log level ≥ info.

## 19. [Low] Misleading "PII redaction" comment on `transcribeAudio`

**Files:**
- `apps/api/src/llm/llm.service.ts` (`transcribeAudio` JSDoc L150–156, transcribe call L165–171)

**Problem:**
The JSDoc says "AssemblyAI Universal-3 Pro **with UK-compliant PII redaction**," but the
`transcribe({...})` call passes **no** `redact_pii`/`redact_pii_policies`/`redact_pii_audio`
options. AssemblyAI returns raw transcript text; redaction actually happens downstream in the
regex + OpenAI `RedactionStage` (matches the documented post-transcription redaction
architecture). The **code is correct** — only the comment misattributes where redaction
occurs. A maintainer could wrongly assume the transcript is already redacted here and
skip/relocate the downstream redaction stage, creating a real PII leak.

**Fix:** reword the comment to state transcription returns **raw** text and that PII redaction
is applied later by `RedactionStage`. No code change.

**Suggested tests:** none new (comment fix); optionally an integration assertion that the
pipeline always runs `RedactionStage` after transcription.

## Possible unused or redundant indexes — N/A

The `llm` module defines **no Mongoose schema and owns no collection**, so there are no index
declarations to review and nothing to mark redundant or unused. Objectives for index coverage
and unused indexes are not applicable to this module.

**Non-security observations (optional, not bugs):** `tokensUsed` is hard-coded `null` in both
`invokeStructured` and the structured response (cost/observability gap); `isRetryableApiError`
relies on substring matching of error messages (brittle but functional).

---

## LLM — Verified safe (no action needed — documented to avoid re-litigation)

- **No own surface:** no controller, routes, schema, repository, or DB access — nothing to
  attack via HTTP and no datastore to scope. AuthN/AuthZ are enforced upstream on the entry
  points that eventually reach the processing pipeline / graph; `LLMService` only runs in
  already-authorized contexts.
- **No resource identity:** the module reads no `userId`/`ownerId`/`tenantId` from anywhere —
  it operates on opaque `messages`/`audioUrl` handed in by trusted internal callers. No
  IDOR/BOLA surface.
- **SSRF boundary safe:** `transcribeAudio`'s `audio_url` is a server-generated, owner-scoped
  presigned URL (`getPresignedUrl(message.userId, media.xid)`), never a raw client-supplied
  URL — a user cannot redirect the server-side fetch to an internal/arbitrary host.
- **No dangerous queries / no mutations:** zero MongoDB operations of any kind.
- **Secret handling:** OpenAI/AssemblyAI keys come from `ConfigService` (Zod-validated at
  startup), are never logged, and are not echoed in errors (Sentry captures carry only
  `operation`/`model` tags and counts).
- **Structured-output safety:** OpenAI output is constrained to the caller's Zod schema via
  `withStructuredOutput` — no string/markdown parsing, so no injection via model output shape.

---

# Processing Module — Security & Index Review Fixes (To Do)

Greenfield: backend not deployed, no prod data/users — safe to clear/restructure fields.

**Module shape (important context):** the `processing` module is a **provider-only**
async orchestrator — **no controller, no routes, no schema, no repository, no index footprint**
(`grep` for `InjectModel`/`Schema.index`/`@Prop`/`new Types.ObjectId` in
`apps/api/src/processing/` returns nothing). `ProcessingService.processMessage(messageId)` is
triggered **only** by the outbox consumer (`outbox/handlers/message-processing.handler.ts:20`)
with a server-minted `messageId` — never from an HTTP request. It runs the message pipeline:

- Audio: Transcribe (AssemblyAI) → Clean (LLM) → Redact PII (regex + LLM)
- Text: Clean (LLM) → Redact PII (regex + LLM)

writing `rawContent` → `cleanedContent` → `content` across the stages (CLAUDE.md three-field
pipeline). Identity is derived from the message doc (`message.userId`), all downstream queries
are owner-scoped or server-derived-id point reads, no bulk ops, and the pipeline is
**fail-closed** (a redaction error marks the message `FAILED`; `content` is never set to
un-redacted text).

**Overall risk: LOW–MEDIUM.** API-auth / dangerous-query / index objectives are N/A (no HTTP
surface, no datastore). The one notable item is the redaction-contract leak below (item 20).

## 20. [Medium] Content fallback chain can serve un-redacted PII for in-progress / failed messages

**Files:**
- `apps/api/src/conversations/mappers/message.mapper.ts` (`toMessageDto`, L17)
- `apps/api/src/processing/processing.service.ts` (pipeline writes, L131–160, L183–187)

**Problem:**
The pipeline writes the **redacted** text only to `doc.content`, and only at the final
`COMPLETE` step. Before that it persists `rawContent` (raw transcript) and `cleanedContent`
(cleaned but **un-redacted**) at `TRANSCRIBING`/`CLEANING`/`DEIDENTIFYING`. The mapper resolves:

```ts
content: doc.content ?? doc.cleanedContent ?? doc.rawContent ?? null
```

So whenever `content` is null — a message still mid-pipeline, **or one that `FAILED` before the
redaction step** — `GET /conversations/:conversationId/messages` returns
`cleanedContent`/`rawContent`, i.e. exactly the text redaction was meant to strip. A
FAILED-before-redaction message serves un-redacted content via the API indefinitely.

**Impact:** **Owner-scoped** (the requester sees their own input echoed back — not an IDOR;
ownership is correctly enforced). The risk is compliance/data-handling: the redaction guarantee
("patient/third-party PII is stripped before stored text is surfaced or propagated") is silently
bypassed for any non-`COMPLETE` message, and that DTO could be read by other consumers.

**Fix (in `message.mapper.ts`, driven by the processing redaction contract):** don't fall back
past `content` for user-role messages whose pipeline hasn't completed. Options: (a) for
`role: user`, return `content` only (null while processing) and let the UI show a "processing…"
state; (b) gate the fallback on `status === COMPLETE`; (c) keep the fallback only for assistant
messages (which set `content` directly, no redaction stage). Confirm with product whether
showing the user their own pre-redaction text mid-pipeline is intended.

**Suggested tests:** a `user` message with `content:null, cleanedContent:'…NHS 943…'` returns
`content:null` (or placeholder), **not** the un-redacted text; a `FAILED` user message does not
surface `rawContent`/`cleanedContent`; a `COMPLETE` message returns redacted `content`;
assistant messages still resolve normally.

## 21. [Low] Un-redacted PII retained at rest in `rawContent` / `cleanedContent`

**Files:**
- `apps/api/src/processing/processing.service.ts` (L132–148 audio, L183–187 text)

**Problem:**
By design (three-field pipeline) `rawContent` and `cleanedContent` hold un-redacted text and are
never cleared after `content` is produced. Acceptable **iff** nothing other than the redacted
`content` is ever read downstream (portfolio graph, artefact composition, exports). Item 20
shows at least one consumer (the mapper) reads them.

**Fix:** confirm the portfolio-graph and artefact-composition paths read `content` (redacted),
not the raw fields. Consider clearing/overwriting `rawContent`/`cleanedContent` once `content`
is set (greenfield — safe), or document why they're retained. Cross-ref redaction architecture.

**Suggested tests:** integration assertion that, after `COMPLETE`, any graph/export input
derives from `content`; (if adopted) that raw fields are cleared post-redaction.

## Possible unused or redundant indexes — N/A

The `processing` module defines **no Mongoose schema and owns no collection**, so there are no
index declarations to review and nothing to mark redundant or unused. Every query it triggers is
a by-`_id`/`xid` point lookup or an already-covered owner-scoped read handled by the owning
module (conversations / artefacts / media) — index coverage and unused-index objectives are not
applicable to this module.

---

## Processing — Verified safe (no action needed — documented to avoid re-litigation)

- **No own surface:** no controller, routes, schema, repository, or DB footprint. Invoked only
  by the outbox consumer with a server-minted `messageId` — no HTTP attack surface, no
  client-supplied id reaches processing.
- **Identity from the message, not a request:** `processMessage` derives `userId` from the
  persisted message doc; `findConversationById` is scoped by `message.userId`, presign by
  `getPresignedUrl(message.userId, media.xid)`. The two unscoped SYSTEM reads
  (`findMessageById`, artefact `findById`) are fed only server-derived ids (documented
  system-read exceptions; artefact loaded from an already-owner-verified conversation).
- **No dangerous queries / mutations:** no `updateMany`/`deleteMany`/`bulkWrite`/upserts/raw
  collection ops. Every `updateMessage` `$set` is server-generated pipeline output (transcript,
  LLM result, status, error) — no request body is spread into a filter or update.
- **Anti-resurrection:** `applyUpdate` filters `{_id, status:$ne DELETED}`; a mid-pipeline
  delete returns null and halts processing rather than re-writing a tombstoned message.
- **Fail-closed redaction:** if `RedactionStage` throws, `processMessage`'s catch marks the
  message `FAILED`; `content` is never set to un-redacted text (the only leak path is the mapper
  fallback in item 20, not the pipeline writing bad data).
- **No ReDoS:** `redactStructuredPii` patterns use only bounded quantifiers (`\d{3}`, `\s?`,
  `{2,}`) with no nested/overlapping quantifiers — no catastrophic backtracking; the email
  pattern's char-class/`\.` overlap is at most quadratic and input is size-bounded.
- **Log hygiene:** stages log entity **types** (e.g. `person_name`) and message ids, never PII
  values; `processingError` is **not** included in `toMessageDto`, so internal error strings are
  not exposed to clients.

---

# Analysis-Runs Module — Security & Index Review Fixes (To Do)

Greenfield: backend not deployed, no prod data/users, `autoIndex` on (indexes rebuild on
boot) — breaking schema/index/enum changes are fine.

**Module shape (important context):** the `analysis-runs` module owns its own schema
(`analysis_runs` collection), repository, service, and an event listener — but has **no
controller and no HTTP routes**. It is **system-context** code: every caller is an outbox
handler (`analysis-start`/`analysis-resume`/`analysis-completion`), a graph progress event, or
an **owner-verified** conversation/artefact service. `AnalysisRun` has **no `userId`** — it is
owned transitively via `conversationId` (a run belongs to a conversation, which belongs to a
user); reads/mutations scope by `conversationId`/`runId` (both server-derived), which is the
documented system/no-user carve-out in CLAUDE.md's ownership rule.

**Client exposure is safe:** run data reaches clients only via `ConversationContext` as
`{ id: xid, status, thinkingReason: currentStep }` (`conversation-context.service.ts:122`). The
server-only fields (`reflectTrace`, `refineTrace` — which embed trainee clinical content —
plus `langGraphThreadId`, `idempotencyKey`, `error`) are **never** projected to a DTO.

**Overall risk: LOW.** No HTTP surface, identity/ownership handled upstream, typed update
allow-lists (no body spread), bulk tombstones guarded. Two items below: one correctness bug
(item 22), one index cleanup (item 23).

## 22. [Low-Medium] "Active run" filters don't exclude DELETED tombstones

**Files:**
- `apps/api/src/analysis-runs/analysis-runs.repository.ts` (`findActiveRun` L134–152, `updateCurrentStep` L227–244; `TERMINAL_STATUSES` L14)
- `packages/shared/src/enums/analysis-run-status.enum.ts` (`DELETED = -999`)

**Problem:**
`TERMINAL_STATUSES = [COMPLETED (400), FAILED (500)]`, and `findActiveRun` /
`updateCurrentStep` filter with `status: { $nin: TERMINAL_STATUSES }`. But `DELETED = -999`,
which is **not** in `[400, 500]`, so a tombstoned run **matches** `$nin` and is treated as
"active". This contradicts the tombstone contract (everywhere else, DELETED rows are excluded
from live reads) and is inconsistent with the partial-unique index's own definition of active —
`{ conversationId: 1 }` partialFilterExpression `status ∈ [PENDING, RUNNING, AWAITING_INPUT]`
(schema L109), which correctly excludes DELETED.

**Impact:**
- `findActiveRun` can return a DELETED run as if live — e.g. `conversations.service.ts:526`
  (pre-`createRun` guard) and `:593` would see a stale tombstoned run as an "active analysis",
  blocking a new run or surfacing a dead run.
- `updateCurrentStep` can write `currentStep` onto a DELETED run (a minor tombstone
  resurrection).
- `findExecutingRun` is **not** affected — it uses a positive `$in: [PENDING, RUNNING]`, which
  already excludes DELETED.
- Reachability of a DELETED run on a still-live conversation (via the artefact-scoped cascade
  `markDeletedByArtefactIds` while the conversation survives) is **Needs verification** — but
  the filter is incorrect by the tombstone contract regardless.

**Fix:** switch these "active" reads to a **positive** set that mirrors the partial-unique
index: `status: { $in: [PENDING, RUNNING, AWAITING_INPUT] }`. This (a) excludes DELETED (and
COMPLETED/FAILED) correctly, (b) exactly matches the one-active-run uniqueness constraint, and
(c) is **index-friendly** — a positive `$in` uses tight index bounds on
`{ conversationId: 1, status: 1, createdAt: -1 }`, whereas `$nin` cannot. Alternatively, add
`DELETED` to a dedicated `NON_ACTIVE` constant — but the positive `$in` is cleaner and faster.

**Suggested tests:** a conversation whose only run is `DELETED` → `findActiveRun` returns null;
`updateCurrentStep` is a no-op (returns null) on a DELETED run; a `PENDING`/`RUNNING`/
`AWAITING_INPUT` run is still found; regression test that `findActiveRun`'s status set equals
the partial-index `partialFilterExpression` set.

## 23. [Low] Redundant `index: true` on the unique `xid` prop

**Files:**
- `apps/api/src/analysis-runs/schemas/analysis-run.schema.ts` (`xid`, L42)

**Problem:**
`@Prop({ required: true, unique: true, index: true, ... })` — `unique: true` already builds an
index, so `index: true` is a duplicate declaration (same recurring pattern as the other
modules). Note also that `xid` is **never used in a query filter by this module** — the repo
has no `findByXid`; `xid` is only projected to the client. The unique index must therefore
**stay** (to enforce the uniqueness constraint), but the redundant `index: true` flag should be
dropped.

**Fix:** drop `index: true` from the `xid` `@Prop`, keep `unique: true`. Confirm with
`$indexStats` that only one `xid` index exists; add a schema-index snapshot regression test.

## Possible unused or redundant indexes

All five explicit indexes on `analysis_runs` were checked against this module's full query
surface (the repository is the only query site — no other module queries this collection):

| Index | Defined in (schema line) | Serves (target-module queries) | Verdict |
| ----- | ------------------------ | ------------------------------ | ------- |
| `xid` (`unique` + `index:true`) | L42 | none — `xid` is only projected, never filtered | **Redundant `index:true`** (item 23); keep the unique index for the constraint |
| `{ conversationId, status, createdAt:-1 }` | L99 | `findActiveRun`, `findExecutingRun`, `updateCurrentStep`, and `findLatestRun` (via `{conversationId}` prefix + `createdAt` sort) | **Keep** — well-covered (and serves the item-22 `$in` fix even better) |
| `{ conversationId, idempotencyKey }` `unique` | L102 | `findRunByIdempotencyKey`; enforces idempotent trigger | **Keep** |
| `{ conversationId, runNumber }` `unique` | L105 | `getMaxRunNumber` (`{conversationId}` sort `runNumber:-1`), `listRuns` (same); enforces unique run number | **Keep** |
| `{ conversationId }` partial-`unique` (status ∈ PENDING/RUNNING/AWAITING_INPUT) | L109 | concurrency guard — at most one active run per conversation | **Keep** — NOT redundant despite being a `conversationId` prefix: it is a *partial unique* constraint, a different purpose from the read indexes |
| `{ artefactId, status }` | L126 | `markDeletedByArtefactIds` (`{artefactId:$in, status:$ne}`) | **Keep** — `artefactId` leads (selective); `$ne` can't use the second key but it earns its keep on exact-status reads |

No genuinely unused index (every compound index maps to a real query or constraint), and no
harmful overlap — notably the module correctly avoids a standalone non-partial `{conversationId}`
index. The only redundancy is the duplicate `index:true` flag on `xid` (item 23).

---

## Analysis-Runs — Verified safe (no action needed — documented to avoid re-litigation)

- **No own HTTP surface:** no controller or routes. Driven only by outbox handlers, graph
  events, and owner-verified conversation/artefact services — no client-supplied id reaches the
  repository.
- **Transitive ownership is correct:** `AnalysisRun` has no `userId` by design; all reads/
  mutations scope by `conversationId`/`runId` (server-derived from job state / LangGraph
  checkpoint / owner-verified conversation lookups). Documented CLAUDE.md system-context
  carve-out — do **not** plumb `userId` through the outbox/graph pipeline to "scope" these.
- **No server-only field leakage:** `reflectTrace`/`refineTrace` (embed trainee clinical
  content), `langGraphThreadId`, `idempotencyKey`, and `error` are never projected to a client
  DTO; only `{ xid, status, currentStep }` is exposed via `ConversationContext`.
- **No mass assignment:** `createRun` writes an explicit field list; `UpdateAnalysisRunData` is
  a typed allow-list and every value is server-computed (status, currentQuestion, artefactId,
  traces, error) — no request body is spread into a filter or `$set`.
- **Optimistic locking:** `updateRunStatus` filters `{ _id: runId, status: expectedStatus }`;
  a mismatch returns null (caller throws), preventing lost-update races.
- **Safe bulk tombstones:** `markDeletedByConversationIds` / `markDeletedByArtefactIds` use an
  explicit `{ <field>: { $in }, status: { $ne: DELETED } }` predicate, short-circuit on an
  empty id array, and route through the single `analysisRunTombstoneUpdate()` payload (which
  clears the clinical traces) — no filter can degrade to `{}`.
- **No NoSQL-injection surface:** `idempotencyKey` (the only value that could originate from a
  request) is used solely in a string-equality filter scoped by a server-derived
  `conversationId`, and Mongoose casts it to a string — no operator injection.
- **Concurrency-safe creation:** the partial-unique `{conversationId}` index enforces
  at-most-one-active-run at the DB level, closing the race where two requests both pass the
  application-level `findActiveRun` check (duplicate-key → `DUPLICATE_ACTIVE_RUN`).

---

# Portfolio-Graph Module — Security & Index Review Fixes (To Do)

**Module shape:** No controller / no HTTP surface / owns no Mongoose schema. `PortfolioGraphService`
is a provider invoked only by server-side callers (outbox `analysis-start` / `analysis-resume`
handlers, `analysis-completion.service`, and `conversations.service`); all auth + ownership are
enforced upstream before a run is enqueued, off server-derived `userId`/`conversationId` carried on
the outbox payload (never request input). The 14 graph nodes are plain LangGraph functions. The
**only repository read in the entire module** is `gather-context.node` → `listMessages`; the nodes
perform **no artefact/PDP/message writes** (`save.node` is a pure validation gate — artefact + PDP
persistence happens in the outbox completion handler, outside this module). The service manages a
LangGraph `MongoDBSaver` checkpointer over the `checkpoints` / `checkpoint_writes` collections and
creates two compound indexes in `onModuleInit`. Overall module risk: **LOW**, with one **Medium**
data-retention issue to prioritise.

## 24. [Medium] LangGraph checkpoints retain clinical content indefinitely with no erasure path

**Files:**
- `apps/api/src/portfolio-graph/portfolio-graph.service.ts` (`onModuleInit`, L147-167)
- `apps/api/src/portfolio-graph/portfolio-graph.state.ts` (`fullTranscript` L96-100, `reflectTrace`/`refineTrace` L226-261)

**Problem:**
The `MongoDBSaver` serialises the **entire `PortfolioState`** at every super-step into the
`checkpoints` / `checkpoint_writes` collections, keyed only by `thread_id`
(`${conversationId}:${runNumber}`). That state includes `fullTranscript` (concatenated user
messages) and `reflectTrace`/`refineTrace` (model narratives derived from trainee clinical prose).
A repo-wide grep confirms these two collections are referenced **nowhere except this service** —
so when a conversation / artefact / analysis-run is deleted (those modules tombstone and scrub
their own sensitive fields, incl. `analysisRunTombstoneUpdate()` which clears the trace fields on
the run record), the **checkpoint copy of the same clinical content survives untouched**. There is
no TTL index and no deletion cascade into these collections.

**Impact:** Right-to-erasure / data-minimisation gap. Given the medical-content lawful-basis /
consent documentation, clinical PII persists in `checkpoints` after the user-facing records are
erased, with no expiry — the strongest issue in this module.

**Fix (greenfield — safe to add now):**
- Add a TTL index on a checkpoint timestamp (or a periodic sweeper) to bound retention; **and/or**
- Extend the artefact/conversation deletion cascade to purge by thread — e.g.
  `deleteMany({ thread_id: { $regex: \`^${conversationId}:\` } })` on both `checkpoints` and
  `checkpoint_writes`, or store an indexed `conversationId` alongside and delete by it.
- Confirm with the data-protection owner which trace fields count as personal data.

**Tests:** integration test that deleting a conversation removes its checkpoint documents; TTL-index
presence assertion in the `onModuleInit` index suite.

## 25. [Low] `gatherContextNode` reads messages unscoped by `userId` (defence-in-depth)

**Files:**
- `apps/api/src/portfolio-graph/nodes/gather-context.node.ts` (L50-59)

**Problem:**
`listMessages` is called with `{ conversation }` only. The SYSTEM READ carve-out comment is correct
(server-set id, owner verified upstream), but `state.userId` is already in scope here — so the
extra owner predicate is free defence-in-depth. Mirrors the conversations-module Finding 9.

**Fix:** pass `userId: new Types.ObjectId(state.userId)` into the `listMessages` filter so a future
caller that mis-sets `conversationId` cannot cross-read. Requires `listMessages` to accept an
optional `userId` predicate — verify/extend the interface + impl together.

## 26. [Low] Unused injected dependencies widen the graph's write surface

**Files:**
- `apps/api/src/portfolio-graph/portfolio-graph.service.ts` (constructor L134-145, `deps` L169-176)
- `apps/api/src/portfolio-graph/graph-deps.ts` (`GraphDeps` L24-31)
- `apps/api/src/portfolio-graph/portfolio-graph.module.ts` (imports L10-16)

**Problem:**
`artefactsRepository`, `pdpGoalsRepository`, and `transactionService` are injected, packed into
`GraphDeps`, and handed to every node — but a grep confirms **no node and the service itself ever
use them** (only `llmService` and `conversationsRepository.listMessages` are touched). The
`forwardRef(() => ArtefactsModule)` + `PdpGoalsModule` imports exist solely to feed these unused
deps. Artefact/PDP persistence lives in the outbox completion handler, not the graph.

**Impact:** Hands every LLM-driven node repo-level write access it neither needs nor uses —
unnecessary blast radius, module coupling, and two `forwardRef` cycles. Code-health, not an active
vuln.

**Fix:** drop the three unused deps from `GraphDeps`, the service constructor/`deps` object, and the
corresponding module imports — keeping the graph's privileges to exactly what it uses (LLM + message
read).

## 27. [Low] Service constructs Mongo driver types in the domain layer

**Files:**
- `apps/api/src/portfolio-graph/portfolio-graph.service.ts` (`getInterruptPayload`, `new Types.ObjectId(...)` L331-332)

**Problem:**
CLAUDE.md forbids `Types.ObjectId` in services (a persistence concern). `getInterruptPayload`
builds `conversationOid`/`userOid` from checkpoint state to populate `CreateMessageData`. Same
documented drift as artefacts / pdp-goals services.

**Fix:** return domain-typed ids from `getInterruptPayload` and let the conversations repo convert,
or accept as documented drift. Low priority.

## Possible unused or redundant indexes

The module owns **no Mongoose schema**, so there are no `@Prop` / `Schema.index` redundancies to
assess. It manages two raw collections via the `MongoDBSaver` and creates their indexes itself
(the JS saver — unlike the Python version — does not self-index, so this is required, not optional):

| Collection | Index | Defined in | Serves | Verdict |
| ---------- | ----- | ---------- | ------ | ------- |
| `checkpoints` | `{ thread_id:1, checkpoint_ns:1, checkpoint_id:-1 }` | service:162 | `getTuple()` filter `(thread_id, checkpoint_ns)` + sort `checkpoint_id` desc | **Keep** — matches the saver's filter+sort exactly |
| `checkpoint_writes` | `{ thread_id:1, checkpoint_ns:1, checkpoint_id:1 }` | service:165 | `putWrites` / `getTuple` write lookups | **Keep** — covers the saver's query prefix |

No redundant index. Two notes:
- **`background: true`** (L163/166) is a deprecated no-op on MongoDB ≥4.2 — harmless; optional
  cleanup.
- A **TTL index** on these collections is *missing* and worth adding — see item 24 (retention).

## Portfolio-Graph — Verified safe (no action needed — documented to avoid re-litigation)

- **No HTTP surface / no IDOR-BOLA:** no controller, route, or DTO; no client-supplied id reaches a
  query. The service is reachable only via server-side callers that have already authenticated and
  authorised the run.
- **Trust boundary is upstream and server-derived:** `startGraph`/`resumeGraph` receive
  `userId`/`conversationId`/`artefactId` from the outbox payload (minted server-side at enqueue),
  not request body/query. `thread_id` is server-minted (`${conversationId}:${runNumber}`).
- **Checkpoint collections are internal:** `checkpoints`/`checkpoint_writes` are never projected to
  any client DTO; their lack of a `userId` field is acceptable (queried only by the saver with a
  server-minted `thread_id`) — the only concern is retention (item 24), not access control.
- **`save.node` performs no writes:** it is a pure validation gate; all artefact/PDP persistence is
  done by the outbox completion handler in a single transaction, outside this module.
- **No mass assignment / NoSQL-injection surface:** nodes build `CreateMessageData` from explicit,
  server-computed fields; no request object is spread into a filter or `$set`. The single read
  filters on a server-set `ObjectId`.
- **Index compensation is correct:** the service rightly creates the two compound indexes the JS
  `MongoDBSaver` omits, matching its documented query shapes.

---

# Pdp-Goals Module — Security & Index Review Fixes (To Do)

**Module shape:** Full CRUD module — controller (`/pdp-goals`: DELETE `/:xid`, GET `/`, GET `/:xid`,
PATCH `/:xid`, POST `/:xid/actions`, PATCH `/:xid/actions/:actionXid`) + service + repository +
schema (`pdp_goals`, embeds `PdpGoalAction`). **This is the codebase's reference implementation for
persistence-layer ownership scoping** (CLAUDE.md cites `saveGoal`/`updateGoal`). Security posture is
**LOW risk**: every client-facing path takes `userId` from `@CurrentUser()` (never body/query) and
double-scopes the DB filter by `{ xid, userId }`; a foreign id degrades to NOT_FOUND; no
mass-assignment (typed DTOs + allow-listed `$set`); no injection surface; cascade methods unscoped by
`userId` are a documented system carve-out fed server-derived `artefactId`s. The substantive issue is
a **Medium reliability bug** in pagination, plus a paired index tweak and Low cleanup.

> These items **supersede the placeholder item 16** (raised during the dashboard review) — the
> redundant-index analysis is now folded into item 31 below.

## 28. [Medium] `findPaginated` throws a 500 when a page-boundary goal has a null `reviewDate`

**Files:**
- `apps/api/src/pdp-goals/pdp-goals.repository.ts` (`findPaginated`, L189-225)
- `apps/api/src/pdp-goals/cursor.util.ts` (`buildPdpGoalCursor`, L35-40)
- `apps/api/src/pdp-goals/schemas/pdp-goal.schema.ts` (`reviewDate` default `null`, L48)

**Problem:**
`findPaginated` sorts `{ reviewDate: 1, _id: 1 }` and, when `hasMore`, builds the next cursor from
the boundary goal via `buildPdpGoalCursor`, which **throws** `Error('Cannot build cursor: … has no
reviewDate')` when `reviewDate` is not a `Date`. But `reviewDate` **defaults to `null`** (schema:48)
and is never set at creation (`CreatePdpGoalData` carries no `reviewDate`). In an ascending sort,
null-`reviewDate` goals sort **first** — straight into the first page. A user with more than `limit`
goals whose boundary goal (#20) has `reviewDate === null` gets a **500** on `GET /pdp-goals`. The
keyset `$or` (`{ reviewDate: { $gt: sortDate } }`) is also logically broken for null reviewDates
(they never satisfy `> aRealDate`), so pagination cannot traverse them at all.

**Impact:** The module's highest-traffic route 500s for any user whose goal set crosses a page
boundary on a null-`reviewDate` goal — readily reached once a STARTED goal without a review date
exists. Own-data only (not a security issue), but a real reliability bug.

**Fix:** Make the sort + cursor null-safe. Either (a) key the cursor on a guaranteed-present field
pair (`createdAt, _id`), or (b) keep `reviewDate` but coalesce nulls in **both** the sort and the
cursor — e.g. a computed sort field matching the aggregation's existing `_sortDate` sentinel
(`9999-12-31`), and store that sentinel in the cursor rather than throwing. Add `_id` as the final
tiebreak in both sort and index (pairs with item 29).

**Tests:** list with >limit goals where the boundary goal has `reviewDate:null` returns a usable
`nextCursor` and the next page continues; all-null-`reviewDate` set paginates without throwing.

## 29. [Low-Moderate] Keyset pagination index omits `_id` and is sub-optimal under `status: $in`

**Files:**
- `apps/api/src/pdp-goals/schemas/pdp-goal.schema.ts` (L69)
- `apps/api/src/pdp-goals/pdp-goals.repository.ts` (`findPaginated`, L207-211)

**Problem:**
The query equality-matches `userId`, `$in`-matches `status`, ranges/sorts on `reviewDate`, and
tiebreaks on `_id`. The existing index `{ userId, status, reviewDate }` stops at `reviewDate`, so the
`_id` tiebreak falls to an in-memory sort and the `$in` on `status` forces a merge of multiple index
ranges.

**Fix:** replace with `PdpGoalSchema.index({ userId: 1, status: 1, reviewDate: 1, _id: 1 })`. Apply
together with the item-28 cursor fix.

## 30. [Low — verify product intent] Update DTOs accept any `PdpGoalStatus` incl. `DELETED` — no state-machine validation

**Files:**
- `apps/api/src/pdp-goals/dto/update-pdp-goal.dto.ts` (`status`, L7)
- `apps/api/src/pdp-goals/dto/update-pdp-goal-action.dto.ts` (`status`, L6)
- `apps/api/src/pdp-goals/pdp-goals.service.ts` (`updateGoal` L132, `updateAction` L219)

**Problem:**
Both DTOs use `z.nativeEnum(PdpGoalStatus)`, which includes `DELETED (-999)`, `ARCHIVED`,
`NOT_STARTED`, etc. `updateGoal`/`updateAction` write the status verbatim with no transition guard. A
client can `PATCH status: -999`, setting the tombstone **status** without going through
`anonymizeGoal` — so the goal is flagged DELETED while its `goal` / `completionReview` / action text
stay **un-scrubbed**, and it then drops out of default lists. Arbitrary status regression/resurrection
is likewise possible. Mirrors the artefacts module's "no state-machine validation" finding (item 4).

**Impact:** Owner-only (no cross-user exposure) → Low. But it lets the soft-delete content-scrub
contract be bypassed and breaks the status lifecycle.

**Fix:** restrict API-writable statuses to the legal set (e.g. `NOT_STARTED`, `STARTED`, `COMPLETED`,
`ARCHIVED`) and keep deletion solely on `DELETE /:xid` (the scrub path); optionally validate
transitions. Confirm the intended lifecycle first.

**Tests:** `PATCH status:DELETED` is rejected (400) or scrubs content; illegal transitions rejected.

## 31. [Low] Redundant index declarations on `PdpGoal` (supersedes item 16)

**Files:**
- `apps/api/src/pdp-goals/schemas/pdp-goal.schema.ts` (`xid` L33, `userId` L39, compound L69)

**Problem / fixes (greenfield — safe to drop now):**
- **`xid`** declares `unique: true` **and** `index: true` — `unique` already builds the index, so
  `index: true` is a duplicate declaration. Drop `index: true`, keep `unique`.
- **`userId`** has a standalone single-field `index: true` that is **redundant**: it is the leading
  prefix of the compound `{ userId, status, reviewDate }` (schema:69), which already serves any
  `userId`-only or `userId`-prefixed query. Drop the single-field index.
- The compound `{ userId, status, reviewDate }` should additionally carry `_id` (item 29).

**Test:** schema-index snapshot regression test asserting the final index set.

## Possible unused or redundant indexes

All indexes on `pdp_goals` were checked against the **full** query surface (the repo is the only
query site; cross-module callers — artefacts, outbox, dashboard, account-cleanup — go through these
same methods):

| Index | Defined in | Used by module? | Concern | Recommendation |
| ----- | ---------- | --------------- | ------- | -------------- |
| `xid` (`unique` + `index:true`) | schema:33 | Yes — `findOneWithArtefact`, `saveGoal`, `updateGoal`, `anonymizeGoal` filter `{xid,…}` | **Duplicate `index:true`** | Drop `index:true`, keep `unique` (item 31) |
| `userId` single-field (`index:true`) | schema:39 | Yes, but only as a prefix | **Redundant** — leading prefix of the `{userId,status,reviewDate}` compound | Drop the single-field index (item 31) |
| `{ userId, status, reviewDate }` | schema:69 | Yes — `findPaginated`, `findByUserId`, `countByUserId`, `markDeletedByUserId` (prefix) | Missing `_id` tiebreak for keyset | Extend to `{userId,status,reviewDate,_id}` (items 28/29) |
| `{ artefactId }` | schema:70 | Yes — `findByArtefactId(s)`, `updateManyByArtefactId`, `deleteByArtefactId`, `markDeletedByArtefactIds`, and dashboard | None — `artefactId` is selective | **Keep** |

No genuinely unused index (every index maps to a real query/constraint). The only redundancies are
the duplicate `xid index:true` and the single-field `userId` index (item 31).

## Pdp-Goals — Verified safe (no action needed — documented to avoid re-litigation)

- **Reference ownership scoping:** every client route derives `userId` from `@CurrentUser()` and
  double-scopes the DB filter (`findOneWithArtefact` read **and** `saveGoal`/`anonymizeGoal` write
  both filter `{xid,userId}`); a foreign id → `matchedCount===0`/null → NOT_FOUND. No IDOR/BOLA.
- **Nested action ownership:** `PATCH /:xid/actions/:actionXid` resolves the action **inside** the
  owner-scoped goal (in-memory `find` on `goal.actions`) — a foreign `actionXid` can't be reached.
- **No mass assignment:** all four DTOs are typed Zod schemas (unknown keys stripped); the repo
  `$set`s an explicit allow-list (`status`, `reviewDate`, `completedAt`, `completionReview`,
  `actions`) — no request object is spread into a filter or update.
- **No NoSQL-injection surface:** the only externally-influenced filter values (`xid`, `actionXid`,
  `status`, `cursor`) are string/enum-cast by Zod and used in equality predicates; `cursor` is
  parsed by `parsePdpGoalCursor` with `ObjectId.isValid` + date validation (→ 400 on malformed).
- **Cascade methods are a documented system carve-out:** `updateManyByArtefactId`,
  `deleteByArtefactId`, `markDeletedByArtefactIds`, `markDeletedByUserId` filter by
  `artefactId`/`userId` without an extra owner predicate — but they are fed **server-derived** ids
  from owner-verified artefact/outbox/account-cleanup flows, never request input. The `find*` and
  `create` cross-module methods (artefacts, dashboard, outbox completion) all pass an explicit
  `userId` predicate where they touch user data.
- **`deleteByArtefactId` hard delete is intentional:** it is the delete-then-create idempotent replay
  step in `analysis-completion.service` (freshly-generated goals regenerated in the same transaction),
  not a user-facing deletion — so the `deleteMany` (vs the tombstone pattern) is correct here.
- **Tombstone scrub is centralised:** `pdpGoalTombstoneUpdate()` is the single source of truth and
  clears goal + all embedded action text (`actions.$[].*`); all soft-delete paths route through it.

---

# Review-Periods Module — Security & Index Review Fixes (To Do)

**Module shape:** Full CRUD module — controller (`/review-periods`: POST `/`, GET `/`, GET `/:xid`,
PATCH `/:xid`, DELETE `/:xid` = archive, GET `/:xid/coverage`) + service + repository + schema
(`review_periods`). Security posture is **LOW risk**: every client path takes `userId` from
`@CurrentUser()` (never body/query) and scopes the DB filter by `{xid,userId}` / `{userId}`; a
foreign id degrades to NOT_FOUND; the update DTO **does not expose `status`** so lifecycle
transitions are service-controlled (no mass-assignment, unlike pdp-goals); coverage reads only the
caller's own `User` doc + own artefacts. The substantive issue is a **Medium concurrency gap**
(no DB-level single-ACTIVE constraint), plus Low cleanup.

> These items **supersede the placeholder item 17** (raised during the dashboard review) — the
> redundant-index analysis is now folded into item 34 below.

## 32. [Medium] No DB-level "one ACTIVE review period per user" constraint — concurrent creates can duplicate active periods

**Files:**
- `apps/api/src/review-periods/review-periods.service.ts` (`createReviewPeriod`, L72-102)
- `apps/api/src/review-periods/schemas/review-period.schema.ts` (L40)

**Problem:**
`createReviewPeriod` enforces single-active via an application-level read-then-write inside a
transaction: `findActiveByUserId` → archive it → `create` the new ACTIVE one. There is **no unique
index** guaranteeing at most one ACTIVE per user. MongoDB transactions give snapshot isolation but
**do not prevent two concurrent transactions from both inserting** a new ACTIVE doc (no write-write
conflict on an insert without a unique key). Two near-simultaneous POSTs can both find no/the-same
active period and both create ACTIVE periods.

**Impact:** Duplicate active periods leave the module inconsistent: `findActiveByUserId` (used by
`getActiveCoverageSummary` / dashboard) returns an arbitrary one, and the next `createReviewPeriod`
archives only one of them. This is the exact failure mode the **analysis-runs** module already
guards against with a partial-unique index (item 22 context).

**Fix (greenfield — safe now):**
```ts
ReviewPeriodSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { status: ReviewPeriodStatus.ACTIVE } },
);
```
Then handle the duplicate-key error in `create` as a domain conflict (409 / retry) rather than a
500. Makes the invariant DB-enforced instead of timing-dependent.

**Tests:** two concurrent `createReviewPeriod` for the same user → exactly one ACTIVE remains;
duplicate-key path returns a clean conflict.

## 33. [Low] `listReviewPeriods` returns DELETED tombstones (no live filter)

**Files:**
- `apps/api/src/review-periods/review-periods.service.ts` (`listReviewPeriods`, L110-120)
- `apps/api/src/review-periods/review-periods.repository.ts` (`findByUserId`, L48-63)

**Problem:**
`listReviewPeriods` calls `findByUserId(userId)` with no `statuses`, so the filter is just
`{ userId }` and includes `status: DELETED` (-999) tombstones (`name: '[deleted]'`). DELETED is only
set by `markDeletedByUserId` (account anonymization), so it's rarely reachable for a live user — but
the read path should still exclude tombstones for consistency with the rest of the codebase
(`ARTEFACT_LIVE_FILTER` etc.).

**Fix:** exclude tombstones at the read path — pass the live statuses, or default
`status: { $ne: ReviewPeriodStatus.DELETED }` in `findByUserId` (keep ARCHIVED visible — those are
intentionally listed).

**Tests:** a user with a DELETED tombstone gets a list excluding it; ARCHIVED still returned.

## 34. [Low] Redundant index declarations on `ReviewPeriod` (supersedes item 17)

**Files:**
- `apps/api/src/review-periods/schemas/review-period.schema.ts` (`xid` L13, `userId` L16, compound L40)

**Problem / fixes (greenfield — safe to drop now):**
- **`xid`** declares `unique: true` **and** `index: true` — `unique` already builds the index, so
  `index: true` is a duplicate declaration. Drop `index: true`, keep `unique`.
- **`userId`** has a standalone single-field `index: true` that is **redundant**: it is the leading
  prefix of the compound `{ userId, status }` (schema:40), which serves any `userId`-only or
  `userId`-prefixed query. Drop the single-field index.

**Test:** schema-index snapshot regression test asserting the final index set.

## 35. [Low] `findByUserId` sort `{createdAt:-1}` is not index-covered

**Files:**
- `apps/api/src/review-periods/review-periods.repository.ts` (`findByUserId`, L57)
- `apps/api/src/review-periods/schemas/review-period.schema.ts` (L40)

**Problem:**
`find({userId}).sort({createdAt:-1})` uses `{userId,status}`, which doesn't cover the `createdAt`
sort → in-memory sort. Volume is low (a handful of periods per user), so impact is negligible today.

**Fix (optional):** `{ userId: 1, createdAt: -1 }`, or fold into `{userId, status, createdAt:-1}` if
the list is ever status-filtered. Low priority.

## 36. [Low] Coverage silently caps at 1000 artefacts and date-filters in memory

**Files:**
- `apps/api/src/review-periods/review-periods.service.ts` (`computeCoverage`, L291-305)

**Problem:**
`computeCoverage` fetches `listArtefacts({ userId, status: COMPLETED, limit: 1000 })` then filters
`completedAt ∈ [start,end]` in memory. A user with >1000 completed artefacts would have coverage
**silently undercounted** (the cap isn't surfaced). The date-range filter also runs client-side
rather than as an indexed query.

**Fix:** push the date range into the query (`completedAt: { $gte: start, $lte: end }`) backed by an
artefacts index `{userId, status, completedAt}` (artefacts-module change), removing the cap; or at
minimum `log()` when the cap is hit. Low priority at current volumes — note the cap so it isn't
mistaken for "all completed artefacts".

## 37. [Low] Service reaches into the auth `User` model directly + Mongo types in domain layer; auto-archive skips cache invalidation

**Files:**
- `apps/api/src/review-periods/review-periods.service.ts` (`userModel.findById(new Types.ObjectId(userId))` L47-48/284; `createReviewPeriod` missing `invalidateCoverageCache` L72-102)

**Problem:**
- (a) The service injects and queries another module's `User` Mongoose model directly and constructs
  `Types.ObjectId` in the domain layer — CLAUDE.md says services shouldn't use driver types or own
  persistence concerns (should go through an auth repository).
- (b) `createReviewPeriod` auto-archives the previous ACTIVE period but never calls
  `invalidateCoverageCache`, so a cached `CoverageResponse` for the just-archived period keeps
  `period.status: ACTIVE` until another event invalidates it.

**Fix:** read specialty via an auth repository method (e.g. `findUserById`) returning a domain type;
call `invalidateCoverageCache(userId)` in the create path's archive branch. Both Low.

## Possible unused or redundant indexes

All indexes on `review_periods` were checked against the **full** query surface (the repo is the
only query site; cross-module callers — dashboard `getActiveCoverageSummary`, account-cleanup
`markDeletedByUserId` — go through these same methods):

| Index | Defined in | Used by module? | Concern | Recommendation |
| ----- | ---------- | --------------- | ------- | -------------- |
| `xid` (`unique` + `index:true`) | schema:13 | Yes — `findByXid`, `updateByXid` filter `{xid,…}` | **Duplicate `index:true`** | Drop `index:true`, keep `unique` (item 34) |
| `userId` single-field (`index:true`) | schema:16 | Yes, but only as a prefix | **Redundant** — leading prefix of `{userId,status}` | Drop the single-field index (item 34) |
| `{ userId, status }` | schema:40 | Yes — `findActiveByUserId`, `findByUserId`, `markDeletedByUserId` (prefix) | Doesn't cover the `findByUserId` `createdAt` sort | **Keep**; optionally add `createdAt` (item 35) and a partial-unique ACTIVE variant (item 32) |

No genuinely unused index. The only redundancies are the duplicate `xid index:true` and the
single-field `userId` index (item 34). The notable **missing** index is the partial-unique ACTIVE
constraint (item 32).

## Review-Periods — Verified safe (no action needed — documented to avoid re-litigation)

- **Ownership scoping throughout:** every client route derives `userId` from `@CurrentUser()` and
  filters `{xid,userId}` (read) / `{xid,userId}` (`findOneAndUpdate`); a foreign id → null → 404. No
  IDOR/BOLA. `GET /:xid/coverage` reads only the caller's own `User` doc and own artefacts (same
  `userId`); the coverage cache key is namespaced `coverage:${userId}:${xid}`.
- **No status mass-assignment:** `UpdateReviewPeriodRequestSchema` exposes only `name`/`startDate`/
  `endDate` — **not `status`** — and `updateByXid` `$set`s an explicit allow-list, so lifecycle
  transitions (ACTIVE→ARCHIVED→DELETED) are entirely service-controlled. Contrast pdp-goals item 30.
- **No NoSQL-injection surface:** the only externally-influenced filter value (`xid`) is a string
  used in an equality predicate scoped by `userId`; dates are Zod `.datetime()`-validated and `new
  Date()`-cast; `name` is length-bounded (≤100).
- **Date validation:** create/update enforce `endDate > startDate` (and create enforces future
  `endDate`) before persisting.
- **Transactional create/update/archive:** mutations run in `withTransaction` with `session` threaded
  through the guard read and the writes — the only gap is the missing DB uniqueness (item 32), not
  the transaction wiring.
- **Archive is a soft transition, not a destructive op:** `DELETE /:xid` sets `status: ARCHIVED`
  (reversible visibility), and full anonymization (`markDeletedByUserId`) is the own-data
  account-cleanup bulk path scoped by `userId`.

---

# Version-History Module — Security & Index Review Fixes (To Do)

**Module shape:** Provider-only / no HTTP surface / no controller. An entity-agnostic shared service
(`VersionHistoryService` + repo + schema `version_history`) consumed only by server-side callers —
`artefacts.service` (snapshot-before-edit, restore, list/get/count, anonymize cascade) and
`account-cleanup.service` (`deleteByUserId`). Auth/ownership are enforced upstream (artefacts'
`@CurrentUser` + `findOrThrow`), and the read/count methods **redundantly** scope by `userId` at the
persistence layer (defence-in-depth). Snapshots store artefact clinical content but are **scrubbed on
artefact deletion** (`anonymizeByEntity` → `snapshot:{}`) and **hard-deleted on account deletion**
(`deleteByUserId`) — no retention gap (contrast portfolio-graph item 24). Overall risk: **LOW**; the
actionable items are correctness/perf, not security.

## 38. [Low-Medium] Version sequence has no DB uniqueness — `count()+1` numbering can collide

**Files:**
- `apps/api/src/version-history/version-history.service.ts` (`createVersion`, L25-48)
- `apps/api/src/version-history/version-history.repository.ts` (`createVersion` L21-44, `countByEntity` L88-104)
- `apps/api/src/version-history/schemas/version-history.schema.ts` (L41)

**Problem:**
`createVersion` computes the next version as `countByEntity(...) + 1` then inserts — a read-then-write.
The supporting index `{ entityType, entityId, version: -1 }` is **not unique**, so nothing at the DB
level prevents two concurrent inserts from both reading `count = N` and both writing `version = N+1`.

**Impact:** Today's callers (artefacts edit + restore) run inside a transaction that **also writes the
parent artefact `_id`** (`updateArtefactById`), so two concurrent edits to the same artefact collide
on that document write (write-write conflict → one aborts), incidentally serializing version creation.
But `version-history` is an explicitly **entity-agnostic shared service** — a future caller that
snapshots without also writing the parent entity in the same transaction would silently produce
**duplicate version numbers**, breaking `findVersion` (arbitrary row) and restore semantics, with no
compiler/test signal.

**Fix (greenfield — safe now):** make the existing compound index unique —
```ts
VersionHistorySchema.index({ entityType: 1, entityId: 1, version: -1 }, { unique: true });
```
Serves all current queries **and** DB-enforces the monotonic sequence (mirrors analysis-runs
`{conversationId, runNumber}` unique). Handle the duplicate-key error in `createVersion` as a
retry/conflict.

**Tests:** parallel `createVersion` for the same `(entityType, entityId)` → distinct version numbers
or clean retry, never a duplicate; `findVersion` always resolves a single row.

## 39. [Low-Moderate] `deleteByUserId` runs an unindexed `deleteMany` over a growing collection

**Files:**
- `apps/api/src/version-history/version-history.repository.ts` (`deleteByUserId`, L106-114)
- `apps/api/src/version-history/schemas/version-history.schema.ts` (L41)

**Problem:**
`deleteMany({ userId })` has no supporting index — `userId` is not a prefix of
`{entityType,entityId,version}` nor of the `xid` unique index → **COLLSCAN**. `version_history` grows
by one row per artefact edit/restore, so it can become large, and the GDPR account-erasure path scans
the whole collection.

**Impact:** Slow/expensive erasure as the collection grows; account deletion is infrequent but is a
compliance operation that should complete reliably. (Own data — not a security issue.)

**Fix:** add `VersionHistorySchema.index({ userId: 1 })` (or `{ userId: 1, entityType: 1 }`). Weigh
the extra per-insert write cost against erasure reliability — given unbounded growth, the index is
justified.

**Tests:** `explain()` on the `deleteByUserId` filter shows an `IXSCAN`, not a `COLLSCAN`.

## 40. [Low] Redundant `xid index:true`; `xid` is never queried by this module

**Files:**
- `apps/api/src/version-history/schemas/version-history.schema.ts` (`xid`, L12)

**Problem:**
`xid` declares `unique: true` **and** `index: true` — `unique` already builds the index, so
`index: true` is a duplicate declaration. Additionally, **no method in this module filters, sorts, or
looks up by `xid`** — the unique index is maintained purely as a constraint on a never-queried field.

**Fix:** drop `index: true` (keep `unique`). Separately verify **globally** whether `xid` is projected
to any client response; if it is never surfaced, consider removing the field (and its index) entirely.
The field-removal part is `Needs verification globally`.

**Test:** schema-index snapshot regression test asserting the final index set.

## Possible unused or redundant indexes

All indexes on `version_history` were checked against the **full** query surface (the repo is the only
query site; callers — artefacts, account-cleanup — go through these same methods):

| Index | Defined in | Used by module? | Concern | Recommendation |
| ----- | ---------- | --------------- | ------- | -------------- |
| `xid` (`unique` + `index:true`) | schema:12 | **No** — never filtered/sorted/looked up | **Duplicate `index:true`** + the field itself is never queried | Drop `index:true`; verify globally whether `xid` is even needed (item 40) |
| `{ entityType, entityId, version:-1 }` | schema:41 | Yes — `findByEntity` (filter+sort), `findVersion`, `countByEntity`, `anonymizeByEntity` (prefix) | Non-unique → doesn't enforce the version sequence | **Keep**, but make **unique** (item 38) |
| *(missing)* `{ userId }` | — | `deleteByUserId` | No index → COLLSCAN on a growing collection | **Add** for erasure reliability (item 39) |

The `{entityType,entityId,version}` compound is the workhorse and is well-matched to every read (the
`userId` residual filter is cheap because the prefix already narrows to one entity's handful of
versions). The only redundancy is the `xid index:true` flag (item 40); the notable **missing** index
is `{userId}` (item 39).

## Version-History — Verified safe (no action needed — documented to avoid re-litigation)

- **No HTTP surface / no IDOR-BOLA:** no controller, route, or DTO; no client-supplied id reaches a
  query. Reachable only via server-side callers that have already authenticated and authorised the
  parent artefact.
- **Defence-in-depth ownership on reads:** `findByEntity`, `findVersion`, and `countByEntity` all
  redundantly scope by `userId` even though the artefacts caller pre-verifies ownership — a future
  caller that forgets the pre-check cannot leak another user's snapshots.
- **No mass assignment:** `createVersion` writes an explicit field list and the `snapshot` is built
  **server-side** from the current artefact document (`{title, composedDocument, capabilities}`), not
  from request input.
- **No retention gap:** version snapshots embed clinical content but are scrubbed to `{}` on artefact
  deletion (`anonymizeByEntity`, idempotent, empty-array short-circuit) and hard-deleted on account
  deletion (`deleteByUserId`) — the erasure paths exist (the only gap is that one of them is
  unindexed, item 39).
- **`anonymizeByEntity` unscoped-by-`userId` is a documented system-cascade carve-out:** it filters
  `{entityType, entityId:$in}` with **server-derived** artefact ids from the owner-verified artefact
  deletion cascade, and `entityId` already implies a single owner — adding `userId` would change
  nothing. No filter can degrade to `{}` (empty-array short-circuit).
- **No NoSQL-injection surface:** the only externally-originated value (`version`) is a number used in
  an equality predicate scoped by `userId`/`entityId`; all ids are server-minted `Types.ObjectId`.

---

# Version-Policy Module — Security & Index Review Fixes (To Do)

**Module shape:** Admin-only config module — controller (`@Controller('admin/version-policy')` with
class-level `@Roles(UserRole.ADMIN)`: GET `/`, PUT `/:platform`) + service + repository + schema
(`version_policies`). Plus an internal `evaluate(platform, clientVersion)` consumed by `init.service`
(`GET /init`). `version_policies` is a **global system-config table** — one row per `Platform`, **no
user data and no ownership dimension** — so there is no IDOR/BOLA surface; authorization is by ADMIN
role, not ownership. Inputs are Zod + `semver`-validated; the upsert uses an explicit `$set` (no
mass-assignment) on a unique `platform` key; the one queried index (`platform` unique) is
well-matched. **This is the lowest-risk module reviewed so far — no security findings**, only Low
hardening.

## 41. [Low] No semver-ordering validation on upsert — an admin can force-lock the entire user base

**Files:**
- `apps/api/src/version-policy/version-policy.service.ts` (`upsert`, L74-87)
- `packages/shared/src/dto/version-policy.dto.ts` (`UpsertVersionPolicySchema`, L23-30)

**Problem:**
`UpsertVersionPolicySchema` validates each of `minimumVersion`/`recommendedVersion`/`latestVersion`
is valid semver **but not their relative ordering**. An admin can set `minimumVersion` above any
shipped build (e.g. `99.0.0`), or `minimum > recommended > latest`. `evaluate` checks
`semver.lt(client, minimum)` first, so every client would be flagged `MANDATORY` with no satisfiable
target version.

**Impact:** Operational self-DoS via a single fat-fingered admin upsert — every app session gets a
hard "mandatory update" gate with no available version, locking the whole user base out. Admin-gated
(not externally exploitable) but high blast radius and easy to trigger by mistake.

**Fix:** add a cross-field `.refine` enforcing `minimumVersion <= recommendedVersion <= latestVersion`
(via `semver.lte`) in the shared schema or the service before persisting; reject with 400 otherwise.

**Tests:** upsert with `minimum > latest` → 400; valid ordering → 200; `evaluate` returns the expected
status across the ordered thresholds.

## 42. [Low — verify client handling] `storeUrl` is an admin-controlled redirect target delivered to every client

**Files:**
- `apps/api/src/version-policy/version-policy.service.ts` (`evaluate`, L48-52)
- `packages/shared/src/dto/version-policy.dto.ts` (`storeUrl`, L28)

**Problem:**
`evaluate` returns `policy.storeUrl` to the mobile client, which presumably opens it to send users to
update. It is `z.string().url()`-validated on upsert but **not host-restricted**. Only an ADMIN can
set it, so the risk is a compromised/rogue admin pushing a phishing/malware URL to the entire user
base — a high-blast-radius redirect.

**Fix:** restrict `storeUrl` to known app-store hosts (e.g. `apps.apple.com`, `play.google.com`) at
upsert via a `.refine` host allow-list; and verify the client validates the scheme/host before
opening (out of module scope — flag to the mobile team). Defence-in-depth against admin compromise.

**Tests:** upsert with a non-allow-listed host → 400; allow-listed store URLs accepted.

## 43. [Low] Redundant `xid index:true`; `xid` is never queried by this module

**Files:**
- `apps/api/src/version-policy/schemas/version-policy.schema.ts` (`xid`, L13)

**Problem:**
`xid` declares `unique: true` **and** `index: true` — `unique` already builds the index, so
`index: true` is a duplicate declaration. No method filters/sorts/looks up by `xid` (it's only echoed
in `toResponse`), so the unique index is a constraint on a never-queried field. Identical to
version-history item 40.

**Fix:** drop `index: true` (keep `unique`). Verify **globally** whether `xid` is consumed by any
client; if not, the field/index may be removable entirely (`Needs verification globally`).

**Test:** schema-index snapshot regression test asserting the final index set.

## Possible unused or redundant indexes

All indexes on `version_policies` were checked against the **full** query surface (the repo is the
only query site; `evaluate`→`findByPlatform` and `init.service` go through these same methods):

| Index | Defined in | Used by module? | Concern | Recommendation |
| ----- | ---------- | --------------- | ------- | -------------- |
| `xid` (`unique` + `index:true`) | schema:13 | **No** — never filtered/sorted/looked up (only projected) | **Duplicate `index:true`** + the field is never queried | Drop `index:true`; verify globally whether `xid` is needed (item 43) |
| `platform` `unique` | schema:16 | Yes — `findByPlatform` (`findOne`), `upsert` (`findOneAndUpdate`) | None — serves both the query **and** the one-row-per-platform constraint | **Keep** |

`findAll` runs an unfiltered `find()` but the collection holds ~1 row per platform, so the scan is
trivial — no index needed. The only redundancy is the `xid index:true` flag (item 43); no missing
index.

## Version-Policy — Verified safe (no action needed — documented to avoid re-litigation)

- **No user data / no IDOR-BOLA:** `version_policies` is global config keyed by the `Platform` enum —
  there is no `userId` dimension, so cross-user access is structurally impossible.
- **Correct authorization (not just authentication):** the controller carries a **class-level**
  `@Roles(UserRole.ADMIN)`, so both `getAll` and `upsert` require ADMIN via the global RolesGuard
  (ordinal `role >= ADMIN`); the global JwtAuthGuard handles authentication separately.
- **No mass assignment:** `service.upsert` builds the `$set` object field-by-field from the
  Zod-validated DTO (platform, the three versions, storeUrl, message) — the raw body is never spread
  into the filter or update. The controller also guards `URL platform === body platform`.
- **No NoSQL-injection surface:** the only externally-influenced filter value (`platform`) is
  enum-cast (`platformSchema.safeParse` in `evaluate`, `z.nativeEnum` in the DTO) and used in an
  equality predicate; `clientVersion` is passed only to `semver.valid`/`semver.lt`, never into a
  query.
- **Upsert can't create under the wrong key:** `findOneAndUpdate({platform}, …, {upsert:true})` uses
  the unique `platform` as both filter and key; `$setOnInsert:{xid}` mints the id only on insert.
- **`evaluate` fails open safely:** missing/invalid platform, invalid semver, or an unconfigured
  policy all return `null` (no forced update) rather than locking users out — the right default for
  availability; DB errors surface as a rejected `Promise.allSettled` branch handled by `init`.
- **No CLAUDE.md driver-type drift:** service/repo use no `Types.ObjectId`/`isValidObjectId`.

---

# Specialties Module — Security & Index Review Fixes (To Do)

**Module shape:** Static, developer-authored **configuration registry** + one `@Public()` read-only
endpoint (`GET /specialties`). **No database, no schema, no repository, no Mongoose model, no
mutation, no user data.** `getAllSpecialtyOptions()` returns only `{specialty, name, trainingStages}`
for `isActive` specialties (currently GP only — Internal Medicine / Psychiatry are registered but
`isActive:false` and never leak). The registry's other functions (`getSpecialtyConfig`,
`isValidTrainingStage`, `getTemplateForEntryType`, `getStageContext`) are pure in-process lookups
consumed by artefacts, auth, review-periods, and portfolio-graph nodes. Overall risk: **VERY LOW —
effectively zero attack surface. No security or index findings.**

## 44. [Low — verify auth write-path] Registry helpers throw raw `Error` on inactive/unknown specialty → potential 500s if persisted `specialty`/`trainingStage` aren't constrained

> **PARTIALLY RESOLVED by the auth review:** `AuthService.updateProfile` (auth.service.ts:303-308)
> validates `isValidTrainingStage(dto.specialty, dto.trainingStage)` — which returns `false` for any
> inactive specialty — and throws 400 before persisting. So the primary write path is guarded and a
> live user cannot acquire an inactive specialty via `PATCH /auth/me`. Residual: the registry helpers
> still throw a raw `Error` (not a domain exception), so any *other* future write path (or a directly
> seeded/legacy doc) would still surface a 500. Lower priority now; the defensive-error-mapping part
> of the fix remains optional.

**Files:**
- `apps/api/src/specialties/specialty.registry.ts` (`getSpecialtyConfig` L12-18, `getTemplateForEntryType` L36-46)
- (write-path to verify) `apps/api/src/auth/*` signup / profile-update

**Problem:**
`getSpecialtyConfig(specialty)` throws a **raw `Error`** (`No active configuration found…`) for any
specialty that is missing or `isActive:false`; `getTemplateForEntryType` throws for an unknown
entry-type/template. These are called downstream with a user's **persisted** `specialty` (review-
periods `computeCoverage`, dashboard, portfolio-graph nodes). If a `User` could ever hold an
**inactive** specialty (IM/Psychiatry) or an invalid `trainingStage`, those paths throw an unmapped
`Error` → **HTTP 500 on core operations for that user, persistently**.

**Impact:** Not externally exploitable on its own, but a gap in signup/profile validation turns into
a hard 500 surface here. The registry already ships the right guards
(`getAllSpecialtyOptions`/`isValidTrainingStage`) — the question is whether the write paths use them.

**Fix:** verify the auth signup/profile-update path validates `specialty` against
`getAllSpecialtyOptions()` (active only) and `trainingStage` against `isValidTrainingStage()` before
persisting. Optionally translate the registry throws into a domain error (`BadRequestException`) at
the consumers rather than letting a raw `Error` become a 500. Low — defence-in-depth around an
in-process invariant, not a vulnerability. (Re-check when the **auth** module is reviewed.)

**Tests:** signup with an inactive specialty or invalid stage → 400 (not persisted); unit test that
`getSpecialtyConfig` throws for `INTERNAL_MEDICINE`/`PSYCHIATRY` while inactive (documents the
contract).

## Possible unused or redundant indexes — N/A

This module owns **no collection or schema**, so there are no indexes to assess. (The
`specialty`/`trainingStage` *values* are persisted on the `User` document — that schema and its
indexes belong to the **auth** module, out of scope here.)

## Specialties — Verified safe (no action needed — documented to avoid re-litigation)

- **No database / no query surface:** no `find`/`update`/`delete`/`aggregate`/upsert, no filters —
  structurally no NoSQL-injection, mass-assignment, or unscoped-mutation surface.
- **No IDOR/BOLA:** no ids, no per-user resources; `GET /specialties` returns the same global,
  non-sensitive curriculum metadata to everyone.
- **`@Public()` is appropriate and minimal:** the endpoint is intentionally unauthenticated (needed
  at signup before a token exists) and exposes only `{specialty, name, trainingStages}` for **active**
  specialties; inactive WIP specialties are filtered out and never leak.
- **`getAllRegisteredConfigs()` (returns inactive configs too) is `@internal`** and wired to no route
  — used only by test data-integrity checks. Confirmed no controller exposes it.
- **Response is cacheable and side-effect-free:** `Cache-Control: public, max-age=3600`; the handler
  is a pure in-memory map over static constants.

---

# Auth Module — Security & Index Review Fixes (To Do)

**Module shape:** The security-critical module — controller (`/auth`: otp/send, otp/verify, claim,
refresh, logout, logout-all, sessions list/revoke, guest, me request/cancel-deletion, me GET/PATCH)
+ service + `SessionsRepository` + `TokenService` + `JwtStrategy` + User/Session schemas; direct
dependency `otp` (OtpService + EmailLockoutService + Otp schema). **Overall LOW–MEDIUM and notably
well-engineered:** HS256 pinned on both sign and verify, session-authoritative request validation
with a `sub`/session-owner cross-check, refresh-token rotation + family replay detection, hashed
refresh tokens & OTP codes with timing-safe compare, layered OTP brute-force defences, atomic
owner-scoped session revocation, TTL cleanup. Authn/authz are cleanly separated; no IDOR/BOLA or
injection surface. One Medium to fix before launch; the rest is Low.

## 45. [Medium] `POST /auth/guest` is unauthenticated **and** unthrottled — unbounded account/session creation

**Files:**
- `apps/api/src/auth/auth.controller.ts` (`registerGuest`, L104-108; class-level `@SkipThrottle()` L26)
- `apps/api/src/auth/auth.service.ts` (`registerGuest`, L155-168)

**Problem:**
The controller is `@SkipThrottle()` at class level and only `otp/send`, `otp/verify`, `refresh`
re-enable `@Throttle`. `registerGuest` is `@Public()` with **no `@Throttle`**, and each call
unconditionally `users.create()`s a guest + `sessions.create()`s a session — no rate limit, captcha,
or device gate.

**Impact:** An unauthenticated attacker scripts `POST /auth/guest` in a loop to mint unlimited guest
users + sessions → DB/collection bloat, index write amplification, inflated metrics, cheap
DoS/cost-amplification. Unlike the OTP routes, nothing bounds it. **The one substantive issue in the
module; fix before launch.**

**Fix:** add a per-IP `@Throttle` to `registerGuest` (e.g. `{ limit: 5, ttl: 60000 }`), consistent
with the other public routes; consider also keying on `X-Device-Id`. Pairs with item 47 (shared-store
the throttler for multi-instance).

**Tests:** N rapid `POST /auth/guest` from one IP → 429 after the limit; a single guest registration
still succeeds.

## 46. [Low-Medium — verify product intent] `otp/send` discloses account existence (`isNewUser`) — user-enumeration oracle

**Files:**
- `apps/api/src/auth/auth.controller.ts` (`otpSend`, L31-37)
- `apps/api/src/auth/auth.service.ts` (`otpSend`, L58-67)

**Problem:**
`otpSend` returns `{ message, isNewUser: !existingUser }` on a `@Public()` endpoint, so any
unauthenticated caller can probe an email and learn whether it has an account. For a medical-training
app, account existence is itself sensitive. The per-IP throttle (10/60s) slows but doesn't prevent
enumeration (useful for targeted phishing).

**Fix:** prefer a uniform, existence-agnostic response; if the signup UX needs the "new vs returning"
branch, defer that signal to **after** OTP verification (where the user has proven inbox control), or
gate it behind a verified step. Confirm the product requirement before changing; if kept, document as
an accepted risk.

**Tests:** `otp/send` returns an identical body shape for registered vs unregistered emails (if
adopted).

## 47. [Low — verify deployment] `EmailLockoutService` (and likely `ThrottlerGuard`) is in-process — limits not shared across instances

**Files:**
- `apps/api/src/otp/email-lockout.service.ts` (per-process `LRUCache`, L19-24)
- `apps/api/src/auth/auth.controller.ts` (`@Throttle` routes L33/41/69)

**Problem:**
`EmailLockoutService` stores failure counts in a per-process `LRUCache`, so the 3-failures→10-min
lockout is enforced **per instance**; an attacker spreading verify attempts across instances
multiplies the attempt budget. Same caveat for `@Throttle`/`ThrottlerGuard` unless backed by a shared
store.

**Mitigation already present:** the **DB-level** `otp.attempts >= maxAttempts (3)` check in
`verifyOtp` *is* cross-instance and caps guesses per code; with the 6-digit space + send rate-limit,
brute-force probability stays negligible. So this is defence-in-depth degradation, not a break.

**Fix:** for production multi-instance, back both the throttler and lockout with Redis. At minimum
document that the DB `attempts` cap is the authoritative cross-instance backstop.

**Tests:** integration test that `otp.attempts` reaching `maxAttempts` blocks verification regardless
of lockout-cache state.

## 48. [Low] `logout` / `logout-all` fail open — return success even when revoke errors

**Files:**
- `apps/api/src/auth/auth.service.ts` (`logout` L251-259, `logoutAll` L261-269)

**Problem:**
Both methods log the repo error but return a success message regardless. On a transient DB error the
session is **not** revoked yet the client is told it logged out; the session/refresh token stays valid
until its TTL. Low impact (tokens usually discarded client-side, session expires at TTL), but a user
logging out of a shared/compromised device may believe the session is dead when it isn't.

**Fix:** surface a failure (5xx or `{ success: false }`) when `revoke`/`revokeAllByUser` returns
`isErr`, so the client can retry; or make logout idempotently retry. Low priority.

**Tests:** simulate a repo error → logout does not report unconditional success.

## 49. [Low] Redundant index declarations across `users`, `sessions`, `otps`

**Files:**
- `apps/api/src/auth/schemas/user.schema.ts` (`email` L15)
- `apps/api/src/auth/schemas/session.schema.ts` (`xid` L13, `refreshTokenHash` L25, `refreshTokenFamily` L28)
- `apps/api/src/otp/schemas/otp.schema.ts` (`email` L11)

**Problem / fixes (greenfield — safe to drop now):**
- **Duplicate `index:true` alongside `unique:true`** — `User.email`, `Session.xid`,
  `Session.refreshTokenHash`. `unique` already builds the index; drop `index:true`, keep `unique`.
- **`Session.refreshTokenFamily`** single-field `index:true` is **redundant** — leading prefix of the
  compound `{refreshTokenFamily, revokedAt}` (session.schema:97) that serves `revokeFamily`. Drop it.
- **`Otp.email`** single-field `index:true` is **redundant** — leading prefix of `{email, createdAt:-1}`
  (otp.schema:35) that serves `findLatestByEmail`/`countRecentByEmail`/`deleteByEmail`. Drop it.

**Test:** schema-index snapshot regression test asserting the final index sets.

## 50. [Low] `listActiveByUser` / `revokeAllByUser` don't fully use the session compound (deviceId gap)

**Files:**
- `apps/api/src/auth/schemas/session.schema.ts` (compound L96)
- `apps/api/src/auth/sessions.repository.ts` (`listActiveByUser` L131-147, `revokeAllByUser` L253-267)

**Problem:**
The compound is `{userId, deviceId, revokedAt}`. Queries filtering `{userId, revokedAt}` (no
`deviceId`) can only use the `userId` prefix, and `listActiveByUser` sorts by `lastUsedAt` (not
indexed) → in-memory sort. Sessions-per-user is small (capped at 50), so impact is negligible today.

**Fix (optional):** add `{ userId: 1, revokedAt: 1, lastUsedAt: -1 }` to fully serve the list path; or
accept given the low cardinality.

## Possible unused or redundant indexes

All indexes on `users` / `sessions` / `otps` were checked against the **full** query surface of the
auth + otp modules (and the cross-module reader of `deletionScheduledFor`):

| Model | Index | Defined in | Used by module? | Concern | Recommendation |
| ----- | ----- | ---------- | --------------- | ------- | -------------- |
| User | `email` (`unique` + `index:true`) | user.schema:15 | Yes — `findOne({email})` | **Duplicate `index:true`** | Drop `index:true`, keep `unique` (item 49) |
| User | `{deletionScheduledFor}` sparse | user.schema:45 | **No (auth writes it)** — swept by account-cleanup | `Used outside target module — verify` | **Keep** |
| Session | `xid` (`unique` + `index:true`) | session.schema:13 | Yes — `revokeOwnedByUserXid`, `findByXid` | **Duplicate `index:true`** | Drop `index:true`, keep `unique` (item 49) |
| Session | `refreshTokenHash` (`unique` + `index:true`) | session.schema:25 | Yes — `findActiveByRefreshHash` | **Duplicate `index:true`** | Drop `index:true`, keep `unique` (item 49) |
| Session | `refreshTokenFamily` single-field | session.schema:28 | Yes (prefix only) | **Redundant** — prefix of `{refreshTokenFamily, revokedAt}` | Drop single-field (item 49) |
| Session | `{userId, deviceId, revokedAt}` | session.schema:96 | Yes — find/revoke by user+device | `deviceId` gap weakens `{userId,revokedAt}` queries | **Keep**; optional `{userId,revokedAt,lastUsedAt:-1}` (item 50) |
| Session | `{refreshTokenFamily, revokedAt}` | session.schema:97 | Yes — `revokeFamily` | None | **Keep** |
| Session | `{previousHashes}` multikey | session.schema:99 | Yes — `findByPreviousHash` (replay) | None | **Keep** |
| Session | `{expiresAt}` TTL | session.schema:102 | Yes — auto-expiry | None | **Keep** |
| Otp | `email` single-field | otp.schema:11 | Yes (prefix only) | **Redundant** — prefix of `{email, createdAt:-1}` | Drop single-field (item 49) |
| Otp | `{email, createdAt:-1}` | otp.schema:35 | Yes — rate-limit + latest lookup | None | **Keep** |
| Otp | `{expiresAt}` TTL | otp.schema:32 | Yes — auto-expiry | None | **Keep** |

Redundancies = the duplicate `index:true` flags + two single-field indexes superseded by compound
prefixes (item 49). No genuinely unused index (`deletionScheduledFor` serves the account-cleanup
sweep — keep). No missing index except the optional list-path one (item 50).

## Auth — Verified safe (no action needed — documented to avoid re-litigation)

- **JWT hardening:** HS256 pinned on **both** sign (`auth.module.ts`) and verify
  (`jwt.strategy.ts` `algorithms:['HS256']`) — algorithm-confusion/downgrade defence.
- **Session is authoritative per request:** `JwtStrategy.validate` re-checks the session for
  revocation/expiry on every request, so logout/revoke/anonymization take effect immediately despite
  `role` riding in the JWT (role changes require re-auth → new token).
- **Secret-compromise defence:** `session.userId !== payload.sub` → the token is refused **and** the
  session revoked (`SUSPICIOUS`) — a forged-but-validly-signed token can't impersonate against a live
  session.
- **Refresh-token security:** raw tokens are `sha256`-hashed at rest (only the hash is stored/queried);
  rotation is an atomic CAS on the current hash; replaying a rotated token revokes the entire
  `refreshTokenFamily` (REFRESH_REPLAY); `previousHashes` capped at 10.
- **OTP brute-force is layered:** per-IP `@Throttle` (send 10/60s, verify 10/60s) + per-email send
  rate-limit (3/10min, with attempt carry-over so re-requesting doesn't reset the counter) + DB
  `attempts >= maxAttempts (3)` per code + in-memory email lockout; codes are `sha256`-hashed and
  compared with `crypto.timingSafeEqual`; codes are cryptographically random.
- **Ownership at the persistence layer:** `revokeSession` → `updateOne({xid, userId, revokedAt:null})`
  (atomic owner check; all miss-cases collapse to 400, no existence disclosure); every authenticated
  route derives `userId`/`sessionId` from the JWT, never the body.
- **Claim race handled:** email pre-check + `save()` with E11000 translation → 409; guest-role guard
  prevents re-claiming a registered account.
- **ObjectId validation in the right layer:** `toObjectIdOrNull` casts/validates ids in the
  repository (malformed id → NOT_FOUND, never a thrown 500); the service stays driver-type-free.
- **TTL hygiene:** `sessions.expiresAt` and `otps.expiresAt` TTL indexes auto-drop expired rows;
  revoked-but-unexpired sessions are intentionally retained for the replay-detection window.

---

# OTP Module — Security & Index Review Fixes (To Do)

**Module shape:** Provider-only / no HTTP surface — `OtpService` + `OtpRepository` +
`EmailLockoutService` + Otp schema. Consumed only by `AuthService` behind the `@Public()` + per-IP
`@Throttle` routes `POST /auth/otp/send` and `/auth/otp/verify`. The **email is the authorization
principal** (OTP is pre-auth — no `userId` exists yet for new signups), so there is no IDOR/ownership
surface and none is applicable. Cryptographic core is sound (crypto-random codes, `sha256`-hashed,
`timingSafeEqual` compare, TTL expiry, verify selects the latest code). Overall **LOW–MEDIUM**: the
brute-force defences are weaker than they look — two should be fixed so the layered model actually
holds.

> Cross-references already logged from the auth review: **item 45** (`/auth/guest` unthrottled),
> **item 47** (in-process lockout/throttle not shared across instances), **item 49** (redundant
> `Otp.email` single-field index — folded in below as item 54).

## 51. [Medium] Per-email OTP send rate-limit is silently defeated by `deleteByEmail` on every send

**Files:**
- `apps/api/src/otp/otp.service.ts` (`sendOtp` — `checkRateLimit` L59 + `deleteByEmail` L72)
- `apps/api/src/otp/otp.repository.ts` (`countRecentByEmail` L62-73, `deleteByEmail` L52-60)

**Problem:**
`sendOtp` runs `checkRateLimit` (→ `countRecentByEmail(email, now-10min)`) at step 1, then
**`deleteByEmail(email)` at step 3 wipes all of that email's OTPs** before creating the new one. So
the collection holds **at most one** OTP per email at any time, and `countRecentByEmail` can never
return more than 1. With `rateLimitMax = 3`, the check `count >= 3` is **never true** — the
"3 sends / 10 min / email" limit never fires.

**Impact:** The only remaining send-throttle is the per-IP `@Throttle` (10/60s). A single IP can mint
far more than 3 codes per 10 min for a given email → **email-bombing** a victim's inbox and minting
more guessable codes over the OTP lifetime. The intended per-identity backstop is inert.

**Fix:** stop destroying the rate-limit window. `verifyOtp` already selects the newest code via
`findLatestByEmail`, so older un-deleted codes are inert anyway — therefore **remove `deleteByEmail`
from `sendOtp`** and let the TTL index reap old rows; `countRecentByEmail` then reflects real send
volume. (Keep `deleteByEmail` on verify-success.) Alternatively track send count in a separate
TTL/Redis counter keyed by email. Confirm carry-over-attempts still reads the latest live code.

**Tests:** 4 sends to the same email within 10 min → the 4th returns the rate-limit error; verify
still accepts only the latest code after multiple sends.

## 52. [Low-Medium] Attempt cap is non-atomic (read-then-`$inc`) — concurrent verifies bypass `maxAttempts`

**Files:**
- `apps/api/src/otp/otp.service.ts` (`verifyOtp` — cap read L118, increment L123)
- `apps/api/src/otp/otp.repository.ts` (`incrementAttempts` L40-50)

**Problem:**
`verifyOtp` reads `otp.attempts >= maxAttempts` (L118) and, on a wrong code, calls `incrementAttempts`
as a **separate** `$inc` (L123). Check and increment aren't atomic, so N concurrent verify requests
for the same code can all read `attempts < 3`, all run the comparison, and all increment afterwards —
getting **N guesses against a cap of 3**.

**Impact:** An attacker fires concurrent verify requests (up to the per-IP throttle, ~10/min) with
different guesses before any increment lands, multiplying the per-code guess budget. Bounded by
throttle + the 6-digit space, so probability stays low — but the cap is the core per-code defence and
it's bypassable under concurrency.

**Fix:** make the attempt claim atomic — e.g.
`findOneAndUpdate({ _id, attempts: { $lt: maxAttempts }, expiresAt: { $gt: now } }, { $inc: { attempts: 1 } }, { new: true })`
to reserve a slot in one round-trip; a null result means "no attempts left / expired"; compare the
code only when a slot was claimed.

**Tests:** fire `maxAttempts+5` concurrent wrong-code verifies → at most `maxAttempts` honoured;
a correct code within budget still succeeds.

## 53. [Low-Medium — verify prod config] Test-OTP backdoor (`@logdit.app` → `112233`) gated only by `isDevelopment`

**Files:**
- `apps/api/src/otp/otp.service.ts` (`TEST_OTP_DOMAIN`/`TEST_OTP_CODE` L15-16, `isTestEmail` L52-54, `sendOtp` L74-91)

**Problem:**
When `app.isDevelopment` is true and the email ends with `@logdit.app`, the service issues a **fixed
code `112233`** (and logs it). It's a deliberate test affordance gated by a single boolean — if
`isDevelopment` ever leaks to production (misconfig), **any `@logdit.app` address could authenticate
with the known code `112233`** without inbox access → latent auth bypass for the company domain.

**Fix (defence-in-depth):** assert `app.isDevelopment === false` in the production config schema (fail
startup otherwise); additionally gate the test branch on `NODE_ENV !== 'production'` directly so it
can't be re-enabled by config alone; consider an explicit test-address allow-list. Confirm prod config
validation already forces this off.

**Tests:** with `isDevelopment=false`, a `@logdit.app` email gets a random code (not `112233`); config
validation rejects `isDevelopment=true` under a production profile.

## 54. [Low] `sendOtp` reports success even when the email send fails + redundant `Otp.email` index

**Files:**
- `apps/api/src/otp/otp.service.ts` (`sendOtp` fire-and-forget send L93-99)
- `apps/api/src/otp/schemas/otp.schema.ts` (`email` single-field `index:true` L11)

**Problem:**
- (a) The email is sent fire-and-forget (`.catch` logs and swallows) and `sendOtp` returns
  `{ message: 'OTP sent successfully' }` regardless. On an SMTP failure the user never receives a code
  but is told it was sent. Acceptable as a latency choice — consider a queued/retried send or a soft
  failure signal. Low.
- (b) `Otp.email`'s standalone `index:true` is the leading prefix of `{email, createdAt:-1}`
  (otp.schema:35) → **redundant**. Drop the single-field index. (Same item as **49**.)

**Tests:** simulate an `EmailService` rejection → error logged (and, if changed, caller can
distinguish delivery failure); schema-index snapshot asserts the de-duplicated set.

## Possible unused or redundant indexes

All indexes on `otps` were checked against the **full** query surface (the repo is the only query
site; `OtpService` is the only consumer):

| Index | Defined in | Used by module? | Concern | Recommendation |
| ----- | ---------- | --------------- | ------- | -------------- |
| `email` single-field (`index:true`) | otp.schema:11 | Yes (prefix only) | **Redundant** — leading prefix of `{email, createdAt:-1}` | Drop the single-field index (items 49 / 54) |
| `{ email, createdAt:-1 }` | otp.schema:35 | Yes — `findLatestByEmail` (filter+sort), `countRecentByEmail` (rate-limit), `deleteByEmail` (prefix) | None — well-matched | **Keep** |
| `{ expiresAt }` TTL (`expireAfterSeconds:0`) | otp.schema:32 | Yes — auto-expiry | None | **Keep** |

`incrementAttempts` queries by `_id` (default index). No genuinely unused index; the only redundancy
is the single-field `email` (item 54). No missing index — the rate-limit count is well-served by
`{email, createdAt:-1}` (its *logic* is the problem, item 51, not its index).

## OTP — Verified safe (no action needed — documented to avoid re-litigation)

- **No HTTP surface / no IDOR-BOLA:** provider-only; reachable only via auth's `@Public()`+`@Throttle`
  routes. The email is the verification principal — no `userId` scoping is applicable pre-auth, and
  there is no cross-user resource.
- **Cryptographic core is sound:** codes are `crypto.randomBytes`-derived 6-digit, `sha256`-hashed at
  rest, and compared with `crypto.timingSafeEqual`; the raw code is never stored.
- **No NoSQL-injection surface:** the only externally-influenced filter value (`email`) is Zod
  `.email()`-validated and lowercased, used in equality predicates; no request object spread into a
  filter; `deleteMany`/`countDocuments` always carry a present `email` (no `{}`-degradation).
- **Verify-time invariants:** expiry, attempt-cap, and lockout are all checked before the timing-safe
  compare; on success all of the email's OTPs are deleted; `verifyOtp` selects the **latest** code, so
  stale codes can't be used (which is also why removing the send-time delete in item 51 is safe).
- **TTL cleanup:** `{expiresAt}` TTL index auto-reaps expired OTPs.
- **No driver-type drift:** service/repo use no `Types.ObjectId`/`isValidObjectId`; ids cross the
  boundary as strings.

---

# Acknowledgements Module — Security & Index Review Fixes (To Do)

**Module shape:** Controller (`POST /acknowledgements`) + service + repository + schema — records
**consent / lawful-basis evidence** per user per notice version, idempotent by `{userId,
noticeVersion}`; also exposes `findAcknowledgedVersions` to `init.service`. Security posture is
**LOW**: `userId` comes only from `@CurrentUser()` (never the body), reads/idempotency are
owner-scoped (no IDOR), inputs are tightly Zod-validated (enum ack ids, unique, ≤20) with
**server-side enforcement of required consents**, no mass-assignment / NoSQL-injection surface, and
the unique `{userId, noticeVersion}` index both serves the queries and enforces idempotency (with a
correct E11000 race fallback). **No security findings** — the actionable items are governance /
operational.

## 55. [Low — verify retention policy with counsel] No erasure/anonymization path for acknowledgement records (incl. `ip`/`userAgent` PII)

**Files:**
- `apps/api/src/acknowledgements/schemas/acknowledgement.schema.ts` (`ip` L36, `userAgent` L39)
- `apps/api/src/acknowledgements/acknowledgements.repository.ts` (no delete/anonymize method)
- `apps/api/src/acknowledgements/acknowledgements.module.ts` (exports only the repository)

**Problem:**
Each record stores `ip` + `userAgent` (PII) for consent audit. The repository exposes **no**
`deleteByUserId`/`anonymize` method, and `account-cleanup` does not touch this collection (the only
external consumer is `init.service.findAcknowledgedVersions`). On account deletion/anonymization,
acknowledgement rows — including IP/UA — **persist indefinitely** with no erasure path.

**Nuance:** This may be **intentional and correct** — consent records are often deliberately retained
after account deletion as legal evidence (legal-obligation / legitimate-interest basis). The concern
is that the decision should be **explicit**, not incidental to a missing method. Contrast
portfolio-graph item 24 (genuine retention *gap*); here retention is plausibly *desired*.

**Fix:** confirm the retention policy with counsel (ties to the project's consent documentation). If
retained → document it and deliberately exclude the collection from cleanup. If it must be erased/
anonymized → add a repo method (anonymize `ip`/`userAgent` to null, or `deleteByUserId`) and wire it
into `account-cleanup`.

**Tests:** per the chosen policy, a test asserting acknowledgements are retained (or
anonymized/deleted) after account deletion so the decision can't silently regress.

## 56. [Low — verify deployment config] Audit IP accuracy depends on `TRUST_PROXY_HOPS`

**Files:**
- `apps/api/src/acknowledgements/acknowledgements.controller.ts` (`req.ip` L18-23; see `main.ts` proxy config)

**Problem:**
The controller captures `req.ip` and notes (in-code) that its correctness depends on
`TRUST_PROXY_HOPS` matching the proxy topology. If misconfigured, the stored IP is the proxy's, not
the client's — devaluing the consent record as evidence and logging a misleading address. Matters
more here than for ordinary logging because these rows are **legal evidence**.

**Fix:** verify `TRUST_PROXY_HOPS` matches the production proxy chain; add a deployment check/test.

**Tests:** behind the configured proxy count, a request with a known `X-Forwarded-For` chain records
the client IP, not the proxy's.

## 57. [Low] Redundant `xid index:true`; `xid` is never queried by this module

**Files:**
- `apps/api/src/acknowledgements/schemas/acknowledgement.schema.ts` (`xid`, L24)

**Problem:**
`xid` declares `unique: true` **and** `index: true` — `unique` already builds the index, so
`index: true` is a duplicate. No method filters/sorts/looks up by `xid` (only echoed in
`toResponse`). Same recurring pattern (items 40, 43, 49).

**Fix:** drop `index: true` (keep `unique`); verify **globally** whether `xid` is consumed by any
client (the response includes it). Greenfield-safe.

**Test:** schema-index snapshot regression test asserting the final index set.

## 58. [Low — future-proofing, already documented in code] Idempotency contract silently drops input if a future notice adds *optional* ack ids

**Files:**
- `apps/api/src/acknowledgements/acknowledgements.service.ts` (`create`, L43-52)

**Problem:**
Idempotency is first-write-wins by `{userId, noticeVersion}` — a second POST returns the persisted
row, not the caller's body. The code comment correctly notes this is safe **today** (all ack ids are
required and must be `given: true`, so every valid body is equivalent up to order), but a future
notice version with *optional* ack ids would make a later POST whose optional booleans differ
**silently lose its input**.

**Fix:** none now (documented + currently safe). When optional ack ids are introduced, revisit: either
make later writes update the optional fields, or reject conflicting re-submissions explicitly. Logged
so it isn't forgotten at that point.

## Possible unused or redundant indexes

All indexes on `acknowledgements` were checked against the **full** query surface (the repo is the
only query site; `init.service` calls `findAcknowledgedVersions`):

| Index | Defined in | Used by module? | Concern | Recommendation |
| ----- | ---------- | --------------- | ------- | -------------- |
| `xid` (`unique` + `index:true`) | schema:24 | **No** — never filtered/sorted/looked up (only projected) | **Duplicate `index:true`** + the field is never queried | Drop `index:true`; verify globally whether `xid` is needed (item 57) |
| `{ userId, noticeVersion }` `unique` | schema:50 | Yes — `findByUserAndVersion` (exact match), `findAcknowledgedVersions` (`distinct` on `userId` prefix), idempotency constraint | None — well-matched (schema comment documents the `distinct` coverage) | **Keep** |

No genuinely unused index; the only redundancy is the `xid index:true` flag (item 57). No missing
index — the unique compound covers both queries and the idempotency constraint.

## Acknowledgements — Verified safe (no action needed — documented to avoid re-litigation)

- **Ownership scoping:** `userId` comes only from `@CurrentUser()` and is written/queried as the
  scope on every path (`create`, `findByUserAndVersion`, `findAcknowledgedVersions`) — no body-supplied
  identity, no IDOR/BOLA.
- **Server-side consent enforcement:** the service derives `requiredIds` from `NOTICE_REGISTRY` and
  rejects (400) unless every required id is present with `given: true` — a client cannot bypass
  mandatory consents by omitting/falsifying them.
- **No mass assignment:** the `create` payload is built field-by-field from the Zod-validated DTO
  (enum ack ids, unique, 1–20 entries); unknown keys stripped; no request object spread into a filter
  or document.
- **No NoSQL-injection surface:** `noticeVersion` is a `z.string()` used in an equality predicate
  (Mongoose casts to string) **and** is rejected with 400 before any DB access if it isn't in the
  registry; `userId` is cast to `ObjectId` in the repository (correct layer).
- **Idempotency is robust:** check-before-create **plus** the unique `{userId, noticeVersion}` index
  with an E11000 re-read fallback (first-write-wins); the response always reflects persisted state.
- **No dangerous mutations:** only `create` + scoped `findOne`/`distinct`; no
  `updateMany`/`deleteMany`/upsert/raw ops; no filter can degrade to `{}`.

---

# Notices Module — Security & Index Review Fixes (To Do)

**Module shape:** Two collections — `notices` (global, admin-managed announcements) + `notice_dismissals`
(per-user state). User-facing controller (`POST /notices/:id/dismiss`, authenticated) + admin
controller (`/admin/notices` GET/POST/PATCH/DELETE, class-level `@Roles(ADMIN)`); plus
`getNoticesForUser` consumed by `init.service`. Security posture is **LOW**: admin routes are
correctly authz-gated; the only user-writable resource is the per-user dismissal keyed to the JWT user
(unique `{userId, noticeId}` index → idempotent, no IDOR); audience targeting is evaluated against
JWT-derived identity (no cross-audience leak); inputs are Zod-validated with no mass-assignment (the
`...rest` spread is over a validated DTO) and no NoSQL-injection surface. **No security findings** —
items are Low hygiene.

## 59. [Low] Admin-list pagination params are unvalidated — negative/huge `page` → 500 or slow scan

**Files:**
- `apps/api/src/notices/notices.admin.controller.ts` (`list`, L24-35)
- `apps/api/src/notices/notices.service.ts` (`adminList`, L109-122)

**Problem:**
`page`/`limit`/`active` arrive as raw `@Query` strings with no DTO. `limit` is capped
(`Math.min(Number(limit)||20, 100)`), but `page` is `Number(page)||1` — a negative value (`?page=-5`)
passes through, making `skip = (page-1)*limit` negative → MongoDB rejects → 500; a huge value
(`?page=1e9`) produces a massive `skip` → slow scan. Neither is integer-validated.

**Impact:** Admin-only → low; a malformed admin request 500s or runs slowly, not externally reachable.

**Fix:** validate the query with a Zod DTO (coerced `page`/`limit` as positive ints, `active` optional
boolean), mirroring other list endpoints; floor `page` at 1.

**Tests:** `?page=-1` / `?page=abc` → 400 (or safely defaults to page 1), not 500.

## 60. [Low] `adminDelete` hard-deletes a notice but orphans its `notice_dismissals` rows

**Files:**
- `apps/api/src/notices/notices.repository.ts` (`delete`, L97-105)
- `apps/api/src/notices/schemas/notice-dismissal.schema.ts`

**Problem:**
`delete` does `deleteOne({xid})` on the notice but nothing removes the `notice_dismissals` rows
referencing its `noticeId` → orphaned rows.

**Impact:** Harmless to correctness (`findDismissals` only queries by *current* notice ids, so orphans
are never read) but they accumulate as dead rows. Low.

**Fix:** cascade-delete dismissals on notice delete (`dismissalModel.deleteMany({ noticeId })` in the
same flow), or accept given the tiny volume and document it (optionally a periodic prune).

**Tests:** deleting a notice also removes its dismissal rows (if cascade adopted).

## 61. [Low — verify client handling] `actionUrl` is an admin-controlled link delivered to users — not host-restricted

**Files:**
- `apps/api/src/notices/notices.service.ts` (`toAppNotice`, L17-29)
- `packages/shared/src/dto/notice.dto.ts` (`actionUrl`, L28)

**Problem:**
`actionUrl` is shown to users (rendered as a tappable action) and is `z.string().url()`-validated on
create/update but **not host-restricted**. Only an ADMIN can set it, so the risk is a compromised/rogue
admin pushing a phishing/malware URL to targeted or all users — high blast radius. Same shape as
**version-policy item 42**.

**Fix:** consider an allow-list / scheme check on `actionUrl` at upsert if notices link off-platform,
and ensure the client validates the scheme/host before opening. Defence-in-depth against admin
compromise; verify client link-handling.

**Tests:** (if adopted) upsert with a disallowed scheme/host → 400.

## 62. [Low] Redundant `xid index:true` on `Notice`

**Files:**
- `apps/api/src/notices/schemas/notice.schema.ts` (`xid`, L12)

**Problem:**
`xid` declares `unique: true` **and** `index: true` — `unique` already builds the index. `xid` is
queried (findByXid/update/delete) so the unique index stays, but the `index:true` flag is a duplicate.
Recurring pattern (items 40/43/49/57).

**Fix:** drop `index: true`, keep `unique`. **Test:** schema-index snapshot regression test.

## 63. [Low] Admin-list sort `{priority:-1, createdAt:-1}` is not index-covered

**Files:**
- `apps/api/src/notices/notices.repository.ts` (`findAll`, L57)
- `apps/api/src/notices/schemas/notice.schema.ts` (L65)

**Problem:**
`findAll` sorts `{priority:-1, createdAt:-1}`, not covered by `{active, startsAt, expiresAt}` →
in-memory sort. Negligible given the notices collection is small (admin announcements).

**Fix (optional):** add `{ priority:-1, createdAt:-1 }` if the list ever grows. Low priority.

## Possible unused or redundant indexes

All indexes on `notices` / `notice_dismissals` were checked against the **full** query surface (the
repo is the only query site; `init.service` calls `getNoticesForUser`):

| Index | Defined in | Used by module? | Concern | Recommendation |
| ----- | ---------- | --------------- | ------- | -------------- |
| Notice `xid` (`unique` + `index:true`) | notice.schema:12 | Yes — `findByXid`/`update`/`delete` | **Duplicate `index:true`** | Drop `index:true`, keep `unique` (item 62) |
| Notice `{ active, startsAt, expiresAt }` | notice.schema:65 | Yes — `findActive` (`active`+`startsAt` prefix) | Doesn't cover the admin-list sort | **Keep**; optional sort index (item 63) |
| NoticeDismissal `{ userId, noticeId }` `unique` | dismissal.schema:23 | Yes — `findDismissals` (`{userId, noticeId:$in}`), `upsertDismissal` (exact), idempotency | None — well-matched | **Keep** |

No genuinely unused index; the only redundancy is the `xid index:true` flag (item 62). The notices
collection is small enough that the uncovered admin-list sort (item 63) is negligible.

## Notices — Verified safe (no action needed — documented to avoid re-litigation)

- **Correct admin authorization:** `/admin/notices` carries a **class-level** `@Roles(UserRole.ADMIN)`
  so all four routes require ADMIN via the global RolesGuard (ordinal `role >= ADMIN`); authentication
  is handled separately by JwtAuthGuard.
- **User dismissal is owner-scoped:** `upsertDismissal({userId, noticeId})` keys on the JWT `userId`
  (cast to `ObjectId`) — a user can only dismiss for themselves; the unique `{userId, noticeId}` index
  makes it idempotent. No IDOR.
- **No cross-audience leakage:** `getNoticesForUser` filters ALL/ROLE/USERS audiences against the
  JWT-derived `userId`/`role` — a user can't receive notices targeted at other users/roles; result
  capped at 5 and dismissed notices excluded.
- **No mass assignment:** `adminCreate` enumerates fields; `adminUpdate` spreads `...rest` from the
  **Zod-validated `UpdateNoticeDto`** (global pipe strips unknown keys) into `$set` — only whitelisted
  notice fields reach the update. DTOs enforce length caps, `expiresAt > startsAt`, and
  audience-required fields.
- **No NoSQL-injection surface:** `xid` params and the `active` filter are string/boolean-cast and used
  in equality predicates; no request object spread into a filter; `audienceUserIds` entries are
  length-24-validated.
- **No dangerous bulk mutations:** admin writes are single-document (`create`, `findOneAndUpdate`,
  `deleteOne`) keyed by `xid`; the only `$in` is the read-side `findDismissals`. No `updateMany`/
  `deleteMany` over user input; no filter can degrade to `{}`.

---

# Account-Cleanup Module — Security & Index Review Fixes (To Do)

**Module shape:** Cross-module **account-deletion orchestrator** — a `@Cron` (daily 5 AM) + a
dev-only manual trigger controller + the service that cascades deletion across **10 repositories**
(artefacts, conversations, media, pdp-goals, review-periods, analysis-runs, items, version-history,
outbox, sessions) plus the User PII wipe. Owns **no schema**. Well-engineered: three-step flow
(lock → parallel purge → completion marker), a universal consent gate (`assertUserMarkedForDeletion`
requires `deletionRequestedAt` set & `anonymizedAt` null), throw-don't-no-op `resolveConversationIds`,
per-user isolation, idempotent/retry-safe. Overall **LOW-MEDIUM**; the two notable items are
verification, not confirmed breaks. **It is the legitimate consumer of the auth `{deletionScheduledFor}`
sparse index** — confirms that index is *not* unused (resolves the auth-review note).

## 64. [Low-Medium — verify env enforcement] Unauthenticated destructive endpoint gated solely by `NODE_ENV`

**Files:**
- `apps/api/src/account-cleanup/account-cleanup.controller.ts` (`@Public()` + `@DevOnly()`, L6-24)
- `apps/api/src/common/guards/dev-only.guard.ts` (L14-28)
- `apps/api/src/config/app.config.ts` (`isDevelopment = NODE_ENV === 'development'`, L168)

**Problem:**
`POST /dev/account-cleanup/:userId` is `@Public()` (bypasses JwtAuthGuard) **and** `@DevOnly()`. The
**entire** security boundary for a destructive cross-user account-deletion route is `DevOnlyGuard`,
which 404s unless `app.isDevelopment`. In correctly-configured prod the route is inert (404), but its
safety rests on a **single config flag** with no auth and no network/IP restriction.

**Impact:** If `NODE_ENV` is ever unset/`development` in an internet-reachable env with real data
(misconfigured staging/preview), this becomes an **unauthenticated** account-deletion endpoint. Blast
radius is **bounded** by the consent gate — an attacker can only delete/accelerate users who already
requested deletion (skipping their 48h grace/cancellation window), not arbitrary accounts. Still
removes the cancellation window without auth.

**Fix:** (a) assert `NODE_ENV !== 'development'` for all deployed environments in the config schema
(fail-fast); (b) defence-in-depth so one flag isn't the only guard — layer `@Roles(ADMIN)` (drop
`@Public()`) or bind dev routes to a non-exposed port/network; (c) keep the consent gate.

**Tests:** `NODE_ENV=production` → 404; in dev, deletion runs only when `deletionRequestedAt` set
(else 403).

## 65. [Low-Medium — verify erasure completeness] Cascade excludes `acknowledgements`; `messages` PII scrub is delegated/indirect

**Files:**
- `apps/api/src/account-cleanup/account-cleanup.service.ts` (cascade list, L140-153)
- `apps/api/src/account-cleanup/account-cleanup.module.ts` (imports, L18-30)

**Problem:**
The cascade covers 10 repos + the User PII wipe, but:
- **`acknowledgements` is not in the cascade** (not imported, not purged) — confirming **item 55**.
  Those rows hold `ip`/`userAgent` PII. May be **intentional** (consent records retained as legal
  evidence) but must be an explicit, documented decision.
- **`messages` PII** coverage depends on `conversations.markDeletedByUserId` *also* scrubbing/
  tombstoning the `messages` collection. Per **item 21**, `messages.rawContent`/`cleanedContent`
  retain **un-redacted** PII at rest — if the conversations cascade doesn't scrub them, account
  deletion leaves the most sensitive field behind.

**Fix:** (a) decide & document the acknowledgements retention policy (item 55); (b) **verify**
`conversations.markDeletedByUserId` scrubs `messages` (incl. `rawContent`/`cleanedContent`) and add a
test asserting no message PII survives deletion. This is the right-to-erasure backbone — completeness
should be explicitly tested, not assumed per-repo.

**Tests:** an end-to-end deletion test seeding data in **every** user-owned collection, asserting each
is tombstoned/scrubbed/deleted afterwards — a single fixture that fails if a new PII collection is
added without wiring it into the cascade.

## 66. [Low] `triggerDeletion` builds `new Types.ObjectId(userId)` on an unvalidated param → 500 on malformed id

**Files:**
- `apps/api/src/account-cleanup/account-cleanup.controller.ts` (`:userId` param, L18-23)
- `apps/api/src/account-cleanup/account-cleanup.service.ts` (`triggerDeletion`, L106-108)

**Problem:**
The raw `:userId` string is passed to `new Types.ObjectId(userId)`, which throws `BSONError` on a
non-24-hex value → unhandled 500. Dev-only → low impact, but it's an unvalidated id reaching a driver
constructor in the service layer (minor CLAUDE.md drift — id-shape handling in the service).

**Fix:** validate the param (a `MongoIdParam` pipe / `isValidObjectId` → 400/404) before constructing
the ObjectId, or push conversion down. Low priority.

## 67. [Low — verify deployment] Cron concurrency guard is in-process — not safe across instances

**Files:**
- `apps/api/src/account-cleanup/account-cleanup.service.ts` (`processing` flag L43; cron L60-100)

**Problem:**
The `processing` boolean prevents overlap within one process only. In a multi-instance deployment,
every instance runs the 5 AM cron → the batch can run concurrently across instances.

**Mitigation already present:** every step is idempotent and the `anonymizedAt`/gate checks prevent
double-anonymization — so overlap causes redundant work, not corruption.

**Fix:** for multi-instance, use a distributed lock (or run the scheduler on a single designated
instance / external scheduler). Low — safe today due to idempotency; document the assumption.

## Possible unused or redundant indexes — N/A (owns no schema)

This module owns **no collection or schema**, so there are no indexes to add/drop/consolidate within
it. The one index it depends on — `{deletionScheduledFor}` **sparse** on `users` (auth
user.schema:45) — is **correctly used** by `processExpiredDeletions`
(`{deletionScheduledFor:$lte, anonymizedAt:null}`); the sparse index serves the range and
`anonymizedAt` is a cheap residual (daily cron, tiny result set). This **resolves the auth-review
"used outside target module — verify" note**: the index is the cron's, keep it.

| Collection | Index | Defined in | Used by this module? | Verdict |
| ---------- | ----- | ---------- | -------------------- | ------- |
| `users` | `{ deletionScheduledFor }` sparse | auth user.schema:45 | **Yes** — `processExpiredDeletions` | **Keep** — this is its consumer (not unused) |

## Account-Cleanup — Verified safe (no action needed — documented to avoid re-litigation)

- **Universal consent gate:** every path (cron + manual) goes through `assertUserMarkedForDeletion`,
  which refuses unless the user previously called `POST /auth/me/request-deletion` and isn't already
  anonymized — consent + replay protection. Wrong/nonexistent/already-done users fail loudly (403).
- **Owner-scoped mutations only:** lock/mark write `{_id: userId}`; the 10 cascade calls each scope by
  `userId` or by **server-resolved** `conversationIds` (`resolveConversationIds` throws rather than
  returning `[]`, so the userId-less `analysis_runs` step can't silently no-op and orphan rows).
- **Idempotent, retry-safe three-step flow:** lock (revoke sessions + PII wipe, no `anonymizedAt`) →
  parallel purge (`Promise.allSettled`, per-step failures logged) → `anonymizedAt` marker written
  **only on full success**; partial failure leaves the user in the cron's retry set.
- **No `{}`-degradation / no injection:** no request object spread into a filter; the cron query is a
  fixed server-side filter; cascade bulk ops are the *intended* delete-all-by-owner.
- **Hard-delete of version-history is intentional:** `deleteByUserId` (not a tombstone) because
  snapshots contain PII with no recovery value once the parent entity is gone (explicit code comment).
- **Batch isolation:** a `ForbiddenException` (inconsistent state) halts the batch deliberately; all
  other per-user errors are logged and skipped, leaving that user for the next tick.

---

# Email Module — Security & Index Review Fixes (To Do)

**Module shape:** Infrastructure-only `@Global()` wrapper around `nodemailer` + one OTP HTML/text
template. **No controller, no DB, no schema, no repository, no Mongoose model.** Single entry point
`EmailService.sendOtp(to, code, expiryMinutes)`, called only by `OtpService` (fire-and-forget). The
template interpolates only server-generated **numeric** values (6-digit code, integer minutes) and the
recipient is passed via nodemailer's structured `{to,subject,html,text}` API — **no email-header
injection / XSS surface**; cert validation is on by default. Overall **VERY LOW**; the whole
data-access/injection/index portion is N/A. One worthwhile transport-hardening item.

## 68. [Low-Medium] STARTTLS not enforced — OTP codes + SMTP credentials may transit in cleartext on port 587

**Files:**
- `apps/api/src/email/email.service.ts` (transporter config, L22-28)

**Problem:**
The transport sets `secure: port === 465`, so for the common submission port **587** (or any non-465
port) `secure` is `false` and `requireTLS` is **not** set. With `secure:false`, nodemailer *attempts*
STARTTLS but does **not require** it — if the server doesn't advertise STARTTLS, or a MITM strips the
capability (downgrade), it falls back to a **plaintext** connection and sends the SMTP `AUTH`
credentials and the OTP code in the clear.

**Impact:** A MITM performing a STARTTLS-stripping downgrade captures the SMTP username/password (full
mail-relay compromise) and every OTP code in flight (account-takeover capability). Cert validation
itself is fine (`tls.rejectUnauthorized:false` is *not* set); the gap is the missing TLS *requirement*.

**Fix:** set `requireTLS: true` on the transport for non-465 ports so it **fails closed** rather than
sending cleartext:
```ts
nodemailer.createTransport({
  host, port: port ?? 587,
  secure: port === 465,
  requireTLS: true,            // fail rather than fall back to plaintext on 587
  auth: { user, pass },
});
```
Keep default cert validation on; verify the production relay supports STARTTLS (or use 465/implicit TLS).

**Tests:** transport config asserts `requireTLS` (or `secure`); sending over a non-TLS server fails
rather than transmitting.

## 69. [Low] Recipient email address logged on every send (PII in application logs)

**Files:**
- `apps/api/src/email/email.service.ts` (`OTP email sent to ${to}` L62; disabled-path warn L48)

**Problem:**
`logger.log(\`OTP email sent to ${to}\`)` (and the disabled-path warn) write the full recipient email
to application logs. For a medical-context app, email addresses are personal data; accumulating them in
logs widens the PII footprint. (The OTP **code** is correctly *not* logged here.)

**Fix:** mask/hash the address (e.g. `t***@domain`) or drop these lines to `debug`. Low priority;
align with the project's logging/PII policy.

**Tests:** send log output contains no full plaintext address (if masking adopted).

## 70. [Low — cross-ref item 54] Email-disabled path is a silent no-op while the OTP caller reports success

**Files:**
- `apps/api/src/email/email.service.ts` (`sendOtp` disabled branch, L46-50)

**Problem:**
When SMTP isn't configured, `sendOtp` logs a warning and returns. This is correct fail-soft behaviour
*for the email module*, but combines with **item 54** (`OtpService.sendOtp` reports "OTP sent
successfully" regardless) so a misconfigured deployment silently never delivers codes.

**Fix:** none required in this module — surfacing belongs to the OTP layer (item 54). Optionally,
fail startup loudly if SMTP is unconfigured in a non-dev environment.

## Possible unused or redundant indexes — N/A (owns no schema)

This module has **no collection, schema, or query surface**, so there are no indexes to assess —
nothing to add, drop, or consolidate. (No `@Prop`/`Schema.index`, no repository.)

## Email — Verified safe (no action needed — documented to avoid re-litigation)

- **No HTTP / DB / auth / ownership surface:** provider-only `@Global()` service; no controller, no
  collection — structurally no IDOR/BOLA, NoSQL-injection, mass-assignment, or index concerns.
- **No email-header injection:** `to`/`subject` are passed to nodemailer's structured `sendMail` API
  (not raw SMTP header concatenation); nodemailer strips CR/LF from header values. `to` is a Zod
  `.email()`-validated, lowercased address from `OtpService`.
- **No template injection / XSS:** the OTP template interpolates only the server-generated numeric
  `code` and integer `expiryMinutes`; no user-supplied string (name/email) is rendered into the HTML
  body. (Guard this if future templates interpolate user input — escape it.)
- **TLS cert validation on by default:** `tls.rejectUnauthorized:false` is not set, so server certs are
  validated; the only gap is enforcing the TLS *upgrade* (item 68).
- **Fail-soft when disabled:** `sendOtp` no-ops (no throw) when SMTP is unconfigured; send errors when
  enabled propagate to the caller's fire-and-forget `.catch` (don't break the OTP flow).

---

# Quota Module — Security & Index Review Fixes (To Do)

**Module shape:** `usage_events` collection (per-user event log) + one `@Public` static route
(`GET /quota/info`) + `QuotaService` + a global `QuotaGuard` (pre-check) and `QuotaInterceptor`
(post-record + `X-Quota-*` headers), driven by the `@UseQuota('type')` decorator on conversations
(`message`, `analysis`) and media (`upload`) routes. Quota is a **cost-control** mechanism for
expensive AI ops. Ownership is clean (always computed/recorded against the JWT `userId` — no IDOR, no
injection, no mass-assignment; `type` is a server literal, `metadata` never client-set), and the index
setup is the tidiest reviewed (compound for queries + single-field TTL, **no redundant `xid`**).
Overall **LOW-MEDIUM**; the one substantive issue is enforcement integrity under concurrency.

## 71. [Medium] Quota is check-then-record (non-atomic, recorded *after* the operation) → concurrent requests bypass the limit

**Files:**
- `apps/api/src/common/guards/quota.guard.ts` (`checkQuota` call, L33-35)
- `apps/api/src/common/interceptors/quota.interceptor.ts` (`recordEvent` after `next.handle()`, L28-50)
- `apps/api/src/quota/quota.service.ts` (`checkQuota` L34-67, `recordEvent` L72-82)

**Problem:**
Classic TOCTOU. `QuotaGuard.checkQuota` does `countDocuments` the window and allows if `used < limit`,
but the usage event is **only written afterward, in `QuotaInterceptor`, on the success path of
`next.handle()`**. Between the guard's count and the interceptor's write, the count doesn't reflect
the in-flight request. N concurrent requests all read `used = K < limit`, all pass, all run the
expensive operation, then all record events — overshooting the cap by the concurrency factor.

**Impact:** A user fires many concurrent `@UseQuota('analysis')`/`'message'`/`'upload'` requests; all
clear the gate simultaneously and trigger expensive LLM/upload work beyond the intended cap. Because
quota bounds AI spend, this is a cost-control bypass, not a cosmetic miscount. Limits are generous
(100–200 short window) so per-burst overrun is bounded by concurrency, but the control is non-atomic
and "record after success" also commits the expensive work before counting it.

**Fix (preferred — atomic, pre-operation reservation):** collapse check+increment into one atomic op
in the **guard**, before the handler — e.g. a per-(user, window) counter doc with
`findOneAndUpdate({ userId, window, count: { $lt: limit } }, { $inc: { count: 1 } }, { new: true })`,
treating a null result as limit-reached → 429. (This also subsumes item 73's count amplification.)
Alternatively, if soft-limit semantics are acceptable, **document explicitly** that quota is a
best-effort soft cap (not a hard boundary). At minimum, move `recordEvent` to *before* the expensive
work so failures still count and the window reflects in-flight load sooner.

**Tests:** `limit + N` concurrent `@UseQuota` requests for one user → at most `limit` succeed, rest
429; a single under-limit request increments exactly once.

## 72. [Low — cross-ref item 65] `usage_events` is not purged by account-cleanup (self-cleans via TTL; minimal PII)

**Files:**
- `apps/api/src/quota/schemas/usage-event.schema.ts`
- (account-cleanup cascade — item 65)

**Problem:**
The account-cleanup cascade (item 65) does not include `usage_events`. After account deletion a user's
usage rows persist — but they hold only `{userId (ObjectId), type, createdAt}` with `metadata` always
null (no direct identifiers), and the 90-day TTL reaps them. Low-sensitivity and time-bounded.

**Fix:** decide explicitly — accept (TTL + minimal data, document it) or add `deleteByUserId` to the
cascade. Fold into the item-65 end-to-end erasure test (assert usage_events is purged or deliberately
excluded). Revisit if `metadata` is ever populated with anything sensitive.

**Tests:** part of the item-65 erasure fixture — usage_events handling matches the chosen policy.

## 73. [Low] Per-request query amplification on `@UseQuota` routes

**Files:**
- `apps/api/src/common/guards/quota.guard.ts` (L35), `apps/api/src/common/interceptors/quota.interceptor.ts` (L33-35)
- `apps/api/src/quota/quota.service.ts` (`checkQuota` L41-51, `getQuotaStatus` L93-114)

**Problem:**
Each `@UseQuota` request issues ~5 `usage_events` reads: guard `checkQuota` (2× `countDocuments` +
maybe `findOldestInWindow`) and interceptor `recordEvent` (1 write) + `getQuotaStatus` (2×
`countDocuments` + `findOldestInWindow` for headers). All index-backed by `{userId, createdAt}`, but
`countDocuments` over a heavy user's window scans up to ~1000 index entries.

**Fix:** acceptable at current limits; if these routes get hot, cache the per-window counts briefly or
move to an incremental counter doc — which the **item 71** atomic-counter fix already provides
(eliminating the count scans). Low priority.

## 74. [Low — product decision] Quota enforcement fails closed on DB error while display fails open

**Files:**
- `apps/api/src/quota/quota.service.ts` (`checkQuota` throws on `isErr` L42/48 vs `getQuotaStatus` `isErr ? 0` L94/98)
- `apps/api/src/common/guards/quota.guard.ts` (L39-44)

**Problem:**
`checkQuota` throws on a count DB error → the guard re-throws → the gated operation 500s
(fail-closed). `getQuotaStatus` (display/init) treats a DB error as `0` (fail-open). Each is
individually defensible, but enforcement couples message/analysis/upload availability to the
`usage_events` collection's health.

**Fix:** make the degradation policy explicit — decide whether a quota-check DB failure should
**block** (current, conservative) or **allow** (availability-first) the operation, and document it. Low.

## Possible unused or redundant indexes — none

All indexes on `usage_events` were checked against the **full** query surface (the repo is the only
query site):

| Index | Defined in | Used by module? | Concern | Recommendation |
| ----- | ---------- | --------------- | ------- | -------------- |
| `{ userId, createdAt:-1 }` | usage-event.schema:25 | Yes — `countSince` (eq+range), `findOldestInWindow` (reverse-scan for the ascending sort) | None — workhorse | **Keep** |
| `{ createdAt:1 }` TTL (`expireAfterSeconds` 90d) | usage-event.schema:28 | Yes — auto-expiry | **Not redundant** — TTL must be single-field; independent of the userId-leading compound | **Keep** |

No redundant index, and **no `xid index:true` pattern** here (the internal `usage_events` collection
has no `xid`) — the cleanest schema index setup in the backlog. No missing index (the enforcement
*logic* is the concern, item 71, not coverage).

## Quota — Verified safe (no action needed — documented to avoid re-litigation)

- **Ownership is clean:** every quota read/write filters `{userId}` from the JWT `request.user.userId`
  (cast to `ObjectId` in the service) — never body/params. No IDOR; the concern is a user bypassing
  *their own* limit (item 71), not cross-user access.
- **No mass assignment / injection:** `recordEvent` writes explicit `{userId, type, metadata}`; `type`
  is the server-defined `@UseQuota('literal')` arg (not request input) and `metadata` is never set by
  the client; filters use server-computed `Date`s and JWT ids in equality/range predicates.
- **`GET /quota/info` is static public config:** no user data, cacheable (`max-age=3600`), no DB.
- **Guard ordering is correct:** `QuotaGuard` runs after `JwtAuthGuard` in the global chain, so
  `request.user` is populated; a missing user safely skips (no enforcement on unauthenticated/`@Public`
  routes, of which none currently use `@UseQuota`).
- **TTL hygiene:** the 90-day TTL bounds `usage_events` growth and caps the retention of the (minimal,
  metadata-null) usage rows.
- **Interceptor side-effects are best-effort:** `recordEvent`/header-setting failures are swallowed so
  they never break the underlying response (the enforcement decision already happened in the guard).

---

# Init Module — Security & Index Review Fixes (To Do)

**Module shape:** Thin, read-only **aggregation layer** — one authenticated route (`GET /init`) that
`Promise.allSettled`-fans-out to 7 already-reviewed services (auth, dashboard, quota, version-policy,
notices, acknowledgements, artefacts-count) and assembles the launch `InitResponse`. **Owns no schema,
no repository, and issues no DB query of its own.** Correctly authenticated (`@CurrentUser`,
self-scoped — forwards only the caller's JWT `userId`/`role`, no IDOR), validates its only client input
(`x-platform`/`x-app-version`) downstream in `evaluate`, and degrades gracefully on partial failure
with a **correctly fail-closed acknowledgement gate**. **No security or index findings** — only an
operational note.

## 75. [Low — performance/monitoring] `/init` is the highest fan-out read endpoint, hit on every app launch

**Files:**
- `apps/api/src/init/init.service.ts` (`getInit` fan-out, L42-58)

**Problem:**
A single `/init` call triggers, in parallel, the dashboard aggregation (artefacts + pdp-goals +
review-periods), quota (~4 `countDocuments`), notices (`findActive` + dismissals), acknowledgements
(`distinct`), version-policy (`findByPlatform`), the current-user read, and (for guests)
`artefacts.countByUser` — ~10+ queries across collections. `Promise.allSettled` makes wall-clock
latency the slowest branch (not the sum), but aggregate DB load per launch is high and `/init` is hit
on every app foreground/launch.

**Impact:** Not security/correctness — a scaling/cost concern. As DAU grows, `/init` becomes the
dominant read-load endpoint.

**Fix:** monitor `/init` query volume; if it becomes hot, consider (a) a short-TTL per-user cache for
the slow/static branches (quota status, notices, version policy), (b) consolidating the quota counts
(ties to **item 71**'s incremental-counter fix), (c) confirm each downstream is index-backed (they are,
per their reviews). The default global `ThrottlerGuard` already bounds per-IP abuse. Low priority
pre-launch.

**Tests:** a load/perf test asserting `/init` p95 latency and per-call query count stay within budget
as data grows; each downstream branch is index-backed (no COLLSCAN under `explain`).

## Possible unused or redundant indexes — N/A (owns no schema)

This module has **no collection, schema, or query of its own**, so there are no indexes to assess. All
collections it reads through (users, artefacts, pdp_goals, review_periods, notices, notice_dismissals,
acknowledgements, usage_events, version_policies) belong to other modules and are covered in their
reviews. Nothing to add, drop, or consolidate here.

## Init — Verified safe (no action needed — documented to avoid re-litigation)

- **No direct DB / no own schema:** pure delegation; no `find`/`update`/`delete`/aggregate/upsert, so
  structurally no NoSQL-injection, mass-assignment, unscoped-mutation, or index concern in this module.
- **Authenticated + self-scoped:** `GET /init` requires a JWT (`@CurrentUser`, not `@Public`) and
  forwards only the caller's own `userId`/`role` to every downstream — no target identity is accepted,
  so no IDOR/BOLA; the response bundles only the caller's own data + audience-correct notices.
- **Client input validated downstream:** the only request-controlled values (`x-platform`,
  `x-app-version` headers) feed solely `versionPolicy.evaluate`, which `safeParse`s the platform enum
  and `semver.valid`s the version → `null` on bad input (no 500, no injection).
- **Graceful, intentional degradation:** `Promise.allSettled` — a user-fetch failure propagates
  (non-200); dashboard/quota/notices/updatePolicy fail open to null/empty (non-critical display data);
  the **acknowledgement compliance gate fails closed** (`needs: true`, re-prompt) on lookup error.
- **Rate-limited:** inherits the global `ThrottlerGuard` (no `@SkipThrottle`), bounding per-IP abuse of
  this heavy endpoint.
