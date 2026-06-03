# `delete-rearch` Branch — Feature Test Plan

**Branch:** `delete-rearch`
**Compared against:** `main`
**Author:** QA / release review
**Date:** 2026-06-02
**Commits:** `96f8f16`, `f2e91c9` (both "delete rearchitecture")

## Summary

The `delete-rearch` branch is a **backend-only rearchitecture of soft-delete / tombstone handling** across the artefact → conversation → message → PDP-goal → analysis-run → version-history → media → outbox graph, plus the GDPR account-deletion (account-cleanup) job. There are two commits, both titled "delete rearchitecture."

The core idea: move cascade orchestration out of ad-hoc inline loops and into **reusable cascade primitives on the service layer** (`deleteByIds`, `deleteByArtefactIds`, `deleteMessagesByIds`, etc.), backed by **bulk `markDeleted*` repository methods** that apply a single tombstone update per collection. Tombstoning is status-driven (`status === DELETED`); the redundant `deletedAt` field was removed. New compound indexes back the cascade hot paths.

User-facing/behavioral changes that ride along:
- **`DELETE /conversations/:conversationId` endpoint was removed entirely.**
- **Artefact deletion semantics changed** while an entry is in-progress (now allowed unless an analysis run is active → `409`, previously always `400`).
- **Message deletion was hardened** with role and conversation-membership checks that return `404`.
- **Account deletion (GDPR) was reworked** into a gated three-step flow with parallel purge and a safety gate.

Main areas changed: `apps/api` (artefacts, conversations, account-cleanup, analysis-runs, media, outbox, pdp-goals, review-periods, items, version-history), `packages/shared` (new `VersionHistoryEntity` enum), plus DB schema indexes. No mobile/web code changed — which is itself a risk (see Gaps).

## Feature Changes

| Feature / Change | Description | Evidence from Diff | Risk Level | Notes / Assumptions |
| ---------------- | ----------- | ------------------ | ---------- | ------------------- |
| Conversation delete endpoint removed | `DELETE /conversations/:conversationId` route and `deleteConversation()` service method deleted. In-progress entries are now deleted only via artefact delete. | `conversations.controller.ts` (route block removed); `conversations.service.ts` (`deleteConversation` removed) | **High** | api-client `deleteConversation()` and mobile Redux thunk still call this route → will 404. Breaking, not propagated. |
| Artefact delete semantics for in-progress entries | Previously `IN_CONVERSATION` artefacts threw `400 "Use conversation delete…"`. Now they're deletable; only blocked with `409 ConflictException` if an analysis run is active. `DELETED` artefact no longer special-cased to `404` (idempotent cascade). | `artefacts.service.ts` `deleteArtefact` rewrite; new `findActiveRun` loop; `ConflictException` import | **High** | Changes user-visible delete behavior and HTTP status codes. Assumes `findActiveRun` correctly detects in-flight runs. |
| Message delete hardening (role + membership) | Delete now 404s if the target message isn't role `USER`, or if it doesn't belong to the conversation in the route. Both return generic `404` to avoid leaking xid existence; role/membership mismatch logged at debug. | `conversations.service.ts` `deleteMessage` — role check, `objectIdsEqual` membership check | **High** | Security/privacy hardening + IDOR fix. Relies on `.lean()` populated `conversation._id` quirk noted in comment. |
| Cascade primitives (services) | New `deleteByIds` / `deleteByArtefactIds` / `deleteMessagesByIds` / `deleteMessagesByConversationIds` orchestrate tombstone-parent-then-children, all session-aware and idempotent. | `artefacts.service.ts`, `conversations.service.ts`, `analysis-runs.service.ts`, `media.service.ts`, `outbox.service.ts`, `version-history.service.ts` (new methods) | **High** | Central to every delete path. Sequential within a Mongo session by design. |
| Bulk `markDeleted*` repo methods + tombstone helpers | Repos gain `markDeleted`, `markDeletedByUserId`, `markDeletedByArtefactIds`, `markDeletedByConversationIds`, etc., each applying a `*TombstoneUpdate()` payload (scrub fields + `status: DELETED`) in one bulk write. | All `*.repository.ts` / `*.repository.interface.ts`; `tombstone.spec.ts` ×4 | **Medium** | Replaces older `anonymize*` methods (some still survive). Idempotent via `status: { $ne: DELETED }`. |
| Account deletion (GDPR) reworked | `anonymizeUser` → `executeDeletion`: (1) safety gate `assertUserMarkedForDeletion`, (2) `lockAccountForDeletion` (revoke sessions + wipe PII **first**), (3) parallel `Promise.allSettled` purge of all collections, (4) `markAccountAnonymized` only on full success. `triggerAnonymization`→`triggerDeletion`. | `account-cleanup.service.ts` full rewrite | **High** | Sessions now revoked at start, not end. Version history is **hard-deleted** (`deleteByUserId`/`deleteMany`), not tombstoned. `ForbiddenException` aborts the whole cron batch. |
| Account-cleanup safety gate | Deletion refuses (`403`) if user not found, already `anonymizedAt`, or no `deletionRequestedAt`. Applies to both cron and manual trigger. | `account-cleanup.service.ts` `assertUserMarkedForDeletion` | **Medium** | Prevents accidental/replayed deletion of valid accounts. |
| `deletedAt` field removed from media (and other schemas) | Soft-delete state now derived solely from `status`. | `media.schema.ts` (`deletedAt` prop removed) | **Medium** | Local dev data with `deletedAt` becomes vestigial. Sweeper relies on `status` only. |
| New DB indexes for cascade hot paths | media `{refDocumentId, refCollection, status}`; outbox `{payload.conversationId, status}` & `{payload.userId, status}`; analysis-run `{artefactId, status}`; version_history `{entityType, entityId, version}`. | `*.schema.ts` diffs | **Medium** | Performance only; verify they build and are actually used (`$ne` legs can't seek). |
| `VersionHistoryEntity` enum | Magic string `'artefact'` replaced by `VersionHistoryEntity.ARTEFACT` shared enum. | `packages/shared/.../version-history-entity.enum.ts`; `artefacts.service.ts` | **Low** | Pure refactor; touches version create/restore/count paths. |
| `unwrapVoid` result helper | Centralized `Result→void` unwrap throwing `InternalServerErrorException`. | `common/utils/result.util.ts` | **Low** | Used by cascade entry points. |

## Test Scenarios

### Feature: Conversation delete endpoint removal

**What to test:** That the route no longer exists, and that the product still has a working path to delete an in-progress entry (via artefact delete). Critically, what happens to existing mobile/web clients that still call the old route.

**Prerequisites:** Authenticated user with at least one `IN_CONVERSATION` artefact + conversation; API running; a way to issue raw HTTP (`curl`/Postman) since clients are stale.

**Scenarios:**

| Scenario | Steps | Expected Result | Type |
| -------- | ----- | --------------- | ---- |
| Old route gone | `DELETE /api/conversations/:conversationId` with valid id | `404 Not Found` (no route) | Happy Path |
| Mobile delete-conversation still calls dead route | Trigger "delete conversation" from mobile app | App receives 404; verify UI error handling / Redux `rejected` state doesn't corrupt list | Regression |
| Delete in-progress entry via artefact delete | `DELETE /api/artefacts/:xid` on an `IN_CONVERSATION` artefact with no active run | `200`, entry + its conversation/messages tombstoned | Integration |
| Message delete still works | `DELETE /api/conversations/:id/messages/:msgId` | Still routes correctly (sibling route untouched) | Regression |

### Feature: Artefact deletion semantics for in-progress entries

**What to test:** New allow/deny logic and HTTP status codes when deleting an artefact that is mid-conversation, with and without an active analysis run.

**Prerequisites:** User with: (a) a `DRAFT`/completed artefact, (b) an `IN_CONVERSATION` artefact with no active run, (c) an `IN_CONVERSATION` artefact with an in-flight analysis run, (d) an already-`DELETED` artefact.

**Scenarios:**

| Scenario | Steps | Expected Result | Type |
| -------- | ----- | --------------- | ---- |
| Delete normal artefact | `DELETE /artefacts/:xid` on a non-in-progress entry | `200`; artefact + conversations + messages + PDP goals + analysis runs + version history tombstoned/removed; attached media → `PENDING_DELETE` | Happy Path |
| Delete in-progress entry, no active run | Delete `IN_CONVERSATION` artefact while no run is active | `200`, full cascade (previously this was `400`) | Happy Path |
| Delete while analysis run active | Start analysis, then delete the artefact mid-run | `409 Conflict "Cannot delete entry while analysis is in progress"`; nothing tombstoned (transaction rolls back) | Error Handling |
| Delete already-deleted artefact | Delete the same artefact twice | Idempotent — no error/resurrection; cascade re-runs harmlessly (no short-circuit) | Edge Case |
| Delete non-existent xid | `DELETE /artefacts/:bogus` | `404 Not Found` | Error Handling |
| Delete another user's artefact | User B deletes User A's artefact xid | `404`/`403` (ownership enforced via `findOrThrow`) | Permission |
| Verify no orphan resurrection | After active-run delete is blocked, let the run finish, then delete | Terminal run write does not resurrect a tombstoned `analysis_run` | Regression |
| Media cleanup propagation | Delete artefact with audio/image attachments | Media rows flip to `PENDING_DELETE`, sweeper later removes S3 objects | Integration |

### Feature: Message deletion hardening (role + membership)

**What to test:** Only the owner's own `USER` messages can be deleted, only through the conversation they belong to, and all rejection paths return a uniform `404`.

**Prerequisites:** User with two conversations (C1, C2). C1 has a `USER` message and an assistant message. C2 belongs to same user. Optionally a conversation with an in-flight run.

**Scenarios:**

| Scenario | Steps | Expected Result | Type |
| -------- | ----- | --------------- | ---- |
| Delete own USER message | `DELETE /conversations/C1/messages/:userMsg` | `200/204`; message tombstoned, attached media → `PENDING_DELETE` | Happy Path |
| Delete assistant/system message | Delete an assistant message xid | `404 Not Found`; debug log notes role mismatch; row untouched | Error Handling |
| Cross-conversation routing (IDOR) | Delete C1's message xid via route `/conversations/C2/messages/:c1Msg` | `404`; message NOT deleted (membership check) | Permission |
| Bypass active-run guard attempt | Route a message-delete for a message in a run-locked conversation through an idle conversation | `404` (membership blocks the bypass) | Permission |
| Delete non-existent message | Random msg xid | `404` | Error Handling |
| Other user's message | User B deletes User A's message | `404` (no leakage that xid exists) | Permission |
| Idempotent re-delete | Delete same USER message twice | Second call → `404` or no-op; no error | Edge Case |
| Nearby: send message still works | After deletes, send a new message in C1 | Unaffected; conversation still active | Regression |

### Feature: Account deletion (GDPR) three-step flow

**What to test:** The gated lock → parallel purge → completion-marker flow, session revocation timing, partial-failure retry, and the safety gate.

**Prerequisites:** Test users in states: (A) `deletionRequestedAt` set, not anonymized; (B) already `anonymizedAt`; (C) no deletion request; (D) non-existent id. Ability to invoke the cleanup (cron or service call) and inspect DB. Note: the dev controller `POST /dev/account-cleanup/:userId` currently returns a stub message and does **not** invoke the service (see Gaps) — drive via cron/integration test.

**Scenarios:**

| Scenario | Steps | Expected Result | Type |
| -------- | ----- | --------------- | ---- |
| Full successful deletion (user A) | Run cleanup for A | Sessions revoked + PII wiped first (`name='Deleted User'`, email `deleted-<id>@removed.local`, specialty/trainingStage null); all collections tombstoned; version history **hard-deleted**; finally `anonymizedAt` set, `deletionRequestedAt`/`deletionScheduledFor` cleared | Happy Path |
| Sessions revoked at start | Have an active session for A, run cleanup | Session invalidated immediately (lock step), even if later purge fails | Integration |
| Gate: not requested (user C) | Run cleanup for C | `ForbiddenException`; no data touched | Permission |
| Gate: already anonymized (user B) | Run cleanup for B | `ForbiddenException "already anonymized"`; idempotent, no re-purge | Permission |
| Gate: user not found (D) | Run cleanup for D | `ForbiddenException "not found"` | Error Handling |
| Cron batch halts on gate failure | Cron query returns a user that fails the gate | `ForbiddenException` re-thrown → entire batch aborts (by design); transient errors instead skip+retry | Edge Case |
| Partial purge failure → retry | Force one purge step (e.g. media) to fail | `anonymizedAt` stays null; warning logs failed step names; user re-selected next cron tick and completes | Error Handling |
| Parallel purge correctness | Deletion with data in all collections | All steps run via `Promise.allSettled`; final state same as serial; no step skipped on another's failure | Integration |
| Resolve conversation ids fails | Force `findConversationIdsByUser` error | Throws (not silent `[]`); analysis_runs not orphaned; retried | Edge Case |
| Idempotent re-run mid-flight | Re-run cleanup after a partial failure | Lock + tombstones safely re-applied; completes | Regression |

### Feature: Cascade primitives & bulk tombstone repo methods

**What to test:** That a delete at any level tombstones the correct subtree exactly once, within a transaction, and that `status === DELETED` correctly hides rows from all reads.

**Prerequisites:** Seeded graph: artefact → 2 conversations → N messages (with media) → PDP goals → analysis runs → version history.

**Scenarios:**

| Scenario | Steps | Expected Result | Type |
| -------- | ----- | --------------- | ---- |
| Artefact cascade completeness | Delete artefact, inspect each collection | Artefact, all conversations, all messages, PDP goals, analysis runs tombstoned; version history scrubbed; outbox entries for those conversations cancelled; media `PENDING_DELETE` | Integration |
| Tombstoned rows hidden from reads | List artefacts / conversations / messages / goals after delete | Deleted rows excluded (live filters / `status !== DELETED`) | Regression |
| Transaction atomicity | Force a mid-cascade repo error | Whole transaction rolls back; no partially-tombstoned subtree | Error Handling |
| Empty-id cascade | Call cascade with no matching children (e.g. artefact with no conversations) | No-op, no error | Edge Case |
| Idempotent re-cascade | Delete the same subtree twice | Second pass modifies 0 rows, no error | Edge Case |
| Outbox cancellation | Delete conversation with pending outbox jobs | Pending/processing jobs for those conversation ids cancelled; analysis not triggered afterward | Integration |
| Media sweeper still clears S3 | After cascade, run media sweeper | `PENDING_DELETE` media S3 objects removed; status transitions correctly without `deletedAt` field | Regression |

### Feature: New indexes & schema changes

**What to test:** Indexes build cleanly on a fresh DB and queries use them; removed `deletedAt` doesn't break anything.

**Prerequisites:** Fresh Mongo (drop local dev DB), API boot.

**Scenarios:**

| Scenario | Steps | Expected Result | Type |
| -------- | ----- | --------------- | ---- |
| Index creation on boot | Start API against empty DB | All new indexes (media/outbox/analysis-run/version_history) create without conflict | Happy Path |
| Existing data with `deletedAt` | Boot against DB that had old `deletedAt` media docs | No crash; field simply ignored | Edge Case |
| Cascade query performance | Delete a user with large media/outbox volume; explain plans | Cascade filters hit the new compound indexes (exact-status legs), not collection scans | Integration |

## Gaps / Questions

1. **Stale clients for the removed conversation-delete route.** `packages/api-client/src/clients/conversations.client.ts:28` `deleteConversation()` and the mobile Redux thunk (`apps/mobile/src/store/slices/conversations/thunks.ts`) still call `DELETE /conversations/:id`, which now 404s. Is the mobile "delete conversation" affordance being removed/replaced with artefact delete, or was the client update simply missed?
2. **Dev cleanup controller is a no-op stub.** `account-cleanup.controller.ts` `POST /dev/account-cleanup/:userId` returns a canned message and never calls `triggerDeletion()`. Intentional placeholder, or should it be wired to the new method? This blocks manual end-to-end testing of deletion via HTTP.
3. **Version history is hard-deleted during account cleanup but tombstoned during artefact delete.** Confirm this asymmetry is intended (PII snapshots fully removed only at account level).
4. **`findActiveRun` definition of "active."** Which run statuses count as active for the new `409` guard? Need the exact status set to test boundaries (e.g. queued vs running vs paused-at-interrupt).
5. **No short-circuit on already-deleted artefacts** — re-deletes re-walk the whole subtree. Safe but confirm acceptable for large graphs.
6. **`outbox.cancelByUser` has no `session` parameter** — during account deletion it runs outside any transaction. Confirm that's acceptable given purge steps already run non-transactionally via `Promise.allSettled`.
7. **Cron batch abort on `ForbiddenException`.** A single gate-inconsistent user aborts the whole nightly batch. Is halting (vs skipping) the desired operational behavior?
8. **No automated regression for the removed route / stale client** in the diff — the four new `tombstone.spec.ts` files are unit-level shape assertions only, and `conversations.service.delete.spec.ts` (193 lines) was deleted. End-to-end cascade coverage relies on the modified integration specs — confirm they exercise the new paths.
9. **Mobile/web behavior after artefact `409`.** No client changes in the branch — does the mobile UI handle the new `409 Conflict` on artefact delete gracefully, or does it surface a generic error?

## Recommended Test Priority

Run these before merge, highest impact first:

1. **Artefact delete while analysis run active → `409`; and in-progress delete with no run → `200`** (core semantic change, transaction rollback correctness).
2. **Message delete IDOR/membership + role checks all return `404`** (security hardening — verify the cross-conversation bypass is closed).
3. **Account deletion full happy path + safety gate** (all three gate refusals, session-revoked-first, version history hard-deleted, `anonymizedAt` set only on full success).
4. **Account deletion partial-failure retry** (one purge step fails → `anonymizedAt` stays null → retried next cycle; no half-deleted account marked complete).
5. **Removed conversation-delete route + stale mobile/api-client behavior** (decide: propagate client change or document; verify no UI corruption on 404).
6. **Full artefact cascade completeness + atomicity** on a richly-seeded graph (every child collection tombstoned, transaction rolls back on injected error).
7. **Tombstoned rows excluded from all list/read endpoints** (regression that delete actually hides data everywhere).
8. **Media sweeper still clears `PENDING_DELETE` S3 objects** without the removed `deletedAt` field.
9. **Fresh-DB index creation + cron batch abort behavior** (lower urgency, but verify before deploy).
