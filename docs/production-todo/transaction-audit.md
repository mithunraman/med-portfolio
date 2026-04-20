# MongoDB Transaction Correctness Audit

**Date:** 2026-04-19
**Scope:** All `*.service.ts` files under `apps/api/src/`
**Status:** ✅ All 11 findings fixed (2026-04-20)

---

## Executive Summary

| Metric                                       | Count  |
| -------------------------------------------- | ------ |
| Transactional flows audited                  | 13     |
| Missing session **inside** `withTransaction` | **0**  |
| TOCTOU / read-before-transaction bugs        | **11** |
| High confidence                              | 4      |
| Medium confidence                            | 5      |
| Low confidence                               | 2      |

Session propagation _within_ transaction callbacks is exemplary — every call correctly passes `session`. The systemic bug is the **read-before-transaction** anti-pattern: guard reads and snapshot data are fetched outside the transaction boundary, creating TOCTOU (time-of-check-time-of-use) windows.

**Most dangerous race:** `ArtefactsService.editArtefact` / `restoreVersion` — concurrent edits cause **silent data loss** in version history.

---

## HIGH Confidence Findings

### 1. `ArtefactsService.editArtefact` — version history data loss

- **File:** `apps/api/src/artefacts/artefacts.service.ts:438`
- **Transaction context:** Read outside, write inside `withTransaction`
- **Call:** `findByXid` (line 438) outside transaction
- **Operation type:** read-then-write
- **Why this is a bug:** The artefact is read outside the transaction and used to snapshot current state inside it. A concurrent edit between the read and the transaction causes the snapshot to capture stale data.
- **Concurrency risk:** Two concurrent edits both read v1. Edit B commits (snapshots v1, writes v2). Edit A commits (snapshots stale v1 again, writes v3). **Version v2 is silently lost from history.**
- **Required fix:** Move `findByXid` inside the transaction with `session`.

### 2. `ArtefactsService.restoreVersion` — version history data loss

- **File:** `apps/api/src/artefacts/artefacts.service.ts:531`
- **Transaction context:** Read outside, write inside `withTransaction`
- **Call:** `findByXid` (line 531) outside transaction
- **Operation type:** read-then-write
- **Why this is a bug:** Same as `editArtefact` — snapshot uses stale data from pre-transaction read.
- **Concurrency risk:** Concurrent edit + restore race loses the edit from version history.
- **Required fix:** Move `findByXid` inside the transaction with `session`.

### 3. `ArtefactsService.finaliseArtefact` — status guard bypass

- **File:** `apps/api/src/artefacts/artefacts.service.ts:306`
- **Transaction context:** Read outside, write inside `withTransaction`
- **Call:** `findByXid` (line 306), status check (line 317) outside transaction
- **Operation type:** read-then-write
- **Why this is a bug:** Status guard (`IN_REVIEW`) is checked outside the transaction. A concurrent archive or duplicate finalise can bypass the guard.
- **Concurrency risk:** Two concurrent finalise requests both pass the status check; both apply potentially conflicting PDP goal selections.
- **Required fix:** Move `findByXid` and status check inside the transaction, or use atomic `findOneAndUpdate` with status precondition.

### 4. `ArtefactsService.deleteArtefact` — incomplete anonymization

- **File:** `apps/api/src/artefacts/artefacts.service.ts:151`
- **Transaction context:** Read outside, write inside `withTransaction`
- **Call:** `findByXid` (line 151), `findConversationIdsByArtefact` (line 167), `findMessageIdsByConversation` (line 177) all outside transaction
- **Operation type:** read-then-write
- **Why this is a bug:** Conversation and message IDs collected before transaction starts. New messages created between read and transaction are missed by anonymization.
- **Concurrency risk:** Un-anonymized data can survive a "delete" operation.
- **Required fix:** Move all reads inside the transaction with `session`.

---

## MEDIUM Confidence Findings

### 5. `ConversationsService.handleStart` — double analysis start

- **File:** `apps/api/src/conversations/conversations.service.ts:420`
- **Transaction context:** Read outside, write inside `withTransaction`
- **Call:** `findActiveRun` (line 433) outside transaction
- **Operation type:** read-then-write
- **Why this is a bug:** Two concurrent "Start Analysis" requests both see no active run, then both create runs + outbox entries.
- **Concurrency risk:** Two analysis graphs run concurrently on the same conversation, producing conflicting artefact writes.
- **Required fix:** Move `findActiveRun` inside the transaction, or add a unique index on `(conversationId, status: active)`.

### 6. `ConversationsService.handleResume` — double resume

- **File:** `apps/api/src/conversations/conversations.service.ts:484`
- **Transaction context:** Read outside, write inside `withTransaction`
- **Call:** `findActiveRun` (line 501), `getPausedNode` (line 515) outside transaction
- **Operation type:** read-then-write
- **Why this is a bug:** Two identical resume requests both pass the paused-node check and create duplicate USER selection messages + duplicate outbox entries.
- **Concurrency risk:** Graph resumed twice, potentially corrupting analysis state.
- **Required fix:** Move `findActiveRun` inside transaction, or use atomic claim on `currentQuestion` field.

### 7. `ArtefactsService.updateArtefactStatus` — no transaction

- **File:** `apps/api/src/artefacts/artefacts.service.ts:269`
- **Transaction context:** No transaction at all
- **Call:** `findByXid` (line 274) then `updateArtefactById` (line 290)
- **Operation type:** read-then-write
- **Why this is a bug:** No atomicity on status transitions; two concurrent updates can both succeed with last-write-wins.
- **Required fix:** Wrap in transaction or use `findOneAndUpdate` with status precondition.

### 8. `ReviewPeriodsService.updateReviewPeriod` — stale validation

- **File:** `apps/api/src/review-periods/review-periods.service.ts:122`
- **Transaction context:** No transaction
- **Call:** `findOrThrow` (line 127) then `updateByXid` (line 145)
- **Operation type:** read-then-write
- **Why this is a bug:** Status check (not-archived) and date validation use stale data.
- **Required fix:** Wrap in transaction or use conditional update filter.

### 9. `ConversationsService.deleteMessage` — unguarded delete

- **File:** `apps/api/src/conversations/conversations.service.ts:165`
- **Transaction context:** No transaction
- **Call:** `findConversationByXid` (line 173), `findActiveRun` (line 188), `findMessagesByXids` (line 194) then `softDeleteMessage` (line 203)
- **Operation type:** read-then-write
- **Why this is a bug:** Guard checks (conversation status, no active run, message existence) are not atomic with the delete.
- **Required fix:** Wrap in a `withTransaction` callback.

---

## LOW Confidence Findings

### 10. `ArtefactsService.duplicateToReview` — status guard outside transaction

- **File:** `apps/api/src/artefacts/artefacts.service.ts:636`
- **Transaction context:** Read outside, write inside `withTransaction`
- **Call:** `findByXid` (line 636) outside transaction
- **Why this is a bug:** Status guard (COMPLETED check) is outside the transaction. Could clone a non-COMPLETED artefact.
- **Practical impact:** Low — cloning stale source is generally acceptable.

### 11. `ReviewPeriodsService.archiveReviewPeriod` — double archive

- **File:** `apps/api/src/review-periods/review-periods.service.ts:164`
- **Transaction context:** No transaction
- **Call:** `findOrThrow` then `updateByXid`
- **Why this is a bug:** Double-archive race bypasses the "already archived" guard.
- **Practical impact:** Benign — double-archive is effectively a no-op.

---

## Consistent Fix Pattern

All findings share the same anti-pattern: **guard reads happen outside the transaction boundary**. The fix is consistent:

1. **Move `findByXid` / guard reads inside the `withTransaction` callback**, passing `session`.
2. **Alternative:** Use atomic `findOneAndUpdate` with a status precondition filter (e.g., `{ status: 'IN_REVIEW' }`) so the guard and write are a single atomic operation.
3. **For flows with no transaction:** Wrap the full read-validate-write sequence in `withTransaction`.

All repository methods already accept `session?: ClientSession` and forward it correctly — the fix surface is at the **service layer call sites only**.
