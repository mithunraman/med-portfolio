# IDOR Security Review — Follow-Ups & High-Risk Patterns to Manually Verify

This document collects the **"High-Risk Patterns to Manually Verify"** and other items needing attention from the per-controller IDOR (broken object-level authorization) security reviews of the backend (`apps/api`).

**Scope of the reviews:** cross-user resource access only (one authenticated user creating/reading/updating/deleting/listing another user's resources). Style, performance, and general code-quality issues were out of scope.

**Overall result:** No exploitable cross-user IDOR was found in the production posture of any reviewed controller. One confirmed issue (`/dev/account-cleanup/:userId`) has since been **remediated** (see §11). Everything else below is defence-in-depth hardening or verification of a dependency, **not** a live vulnerability.

**Legend:**
- 🟢 Safe as reviewed — item is a latent/defence-in-depth concern only.
- 🟡 Verify — depends on code not read during the review; confirm before fully clearing.
- 🔴 Was vulnerable — now fixed; retained for audit trail.

---

## Cross-cutting: the recurring "reusable unscoped primitive" pattern

Several repositories expose **bulk write primitives filtered only by `_id`, `artefactId`, or `conversationId` (no `userId`)**. In every reviewed controller path these are fed **owner-verified ids** obtained from a prior `userId`-scoped read, so they are safe *as reached*. The hazard is that they carry **no intrinsic ownership constraint** — a future caller that wires one to a route without the pre-check turns it into an IDOR with no compiler or test signal.

This is exactly the risk `CLAUDE.md` calls out ("Ownership predicate at the persistence layer / defence in depth"). Recommended general fix: thread `userId` into these primitives' filters (e.g. `markDeleted(ids, userId)` → `{ _id: { $in: ids }, userId }`) so a mis-wire fails closed.

Instances are listed per-module below.

---

## 1. Artefacts (`artefacts.controller.ts`) 🟢

No IDOR. All controller-reachable reads/writes scope by `userId` (`findByXid({ xid, userId })`, `updateArtefactById({ _id, userId })`).

**Verify / harden:**
- `markDeleted(ids)` — `updateMany({ _id: { $in: ids }, status $ne DELETED })`, **no `userId`**. Reached only via `deleteArtefact` → `deleteByIds` with an owner-verified `_id`. Consider `markDeleted(ids, userId)`.
- `updateManyByArtefactId(artefactId, …)` (pdp-goals) — mass status update filtered by `artefactId` only; reached from `archiveArtefact` with an owner-verified id.
- **Cascade services not fully read during this review:** `conversationsService.deleteByArtefactIds`, `analysisRunsService.deleteByArtefactIds`, `versionHistoryService.anonymizeByEntity` (invoked in `deleteByIds`). Confirm each scopes by the passed artefact ids only and that those ids are always owner-derived.

---

## 2. Auth (`auth.controller.ts`) 🟢/🟡

No IDOR. `revokeSession` pairs the client `xid` with the JWT `userId`; all other routes use JWT-derived `userId`/`sessionId` or secret-token possession.

**Verify / harden:**
- 🟡 **Integrity of the JWT `sid`/`role`/`userId` claims.** The whole model trusts `request.user`. Read the passport **`JwtStrategy`** (`auth/strategies/*.ts`) and confirm claims come from the *verified* token payload (not a client header), and that session validation only ever resolves the caller's own `sid`.
- `revoke(sessionId)` and `rotate(sessionId, …)` — filter by `_id` alone (rotate also binds the token hash). Safe because `logout`/`claim` pass the JWT's own `sid`. Consider adding `userId` to `revoke`'s filter for defence in depth.
- `findByXid` / `findById` / `findRevocationStatus` (sessions) — unscoped session finders; not reached from user routes here, but confirm the JWT strategy consuming `findRevocationStatus` never exposes another user's session by an inbound id.
- `revokeFamily(family)` — mass revoke by token family, no `userId`. Confirm `refreshTokenFamily` is never client-supplied.

---

## 3. Conversations (`conversations.controller.ts`) 🟢/🟡

No IDOR. Conversation gate `findConversationByXid({ xid, userId })`; message resolution is `userId`-scoped **and** membership-checked against the owned conversation.

**Verify / harden:**
- `updateMessage(messageId, …)` — `findOneAndUpdate({ _id, live })`, no `userId`. Fed owner-verified `message._id`. Consider threading `userId`.
- `markDeletedMessagesByIds` / `markDeleted` / `markDeletedMessagesByConversationIds` — `_id`/`conversation`-scoped `updateMany`s, no `userId`.
- 🟡 **`ConversationContextService.computeContext`** and **`AnalysisRunsService`** methods (`findActiveRun`/`findExecutingRun`/`createRun`/`deleteByConversationIds`) were not read. Confirm they consume only the owned `conversation._id`, never a client id.
- 🟡 **Documented "SYSTEM READ" unscoped finders** — `findMessageById`, `findArtefactRefByConversationId`. Reached only with owner-derived ids in this path; confirm no user-facing route passes a client id to them.
- `artefactsRepository.findById(conversation.artefact)` (IN_CONVERSATION status gate) — `_id`-scoped without `userId`; safe because the artefact id comes from the owned conversation.

---

## 4. Media (`media.controller.ts`) 🟢/🟡

No IDOR. `getMedia` → `findByXid({ xid, userId })`; `initiateUpload` stamps `userId` from JWT and namespaces the S3 key `media/{userId}/{server-xid}`.

**Verify / harden (all background/other-module paths, not reachable from this controller):**
- `markPendingDeleteByMessageIds(messageIds)` — `updateMany` by `refDocumentId` + `refCollection` + `status`, **no `userId`**. Safe via the conversations cascade (owner-verified message ids).
- 🟡 `markDeleted(ids)` / `incrementDeleteAttempts(id)` / `findPendingDeleteBatch` — `_id`/status-scoped, no `userId`. Confirm these are invoked **only** by the background media-cleanup sweeper/cron, never from a user-facing route. (Read the sweeper that consumes `findPendingDeleteBatch` → `markDeleted`.)

---

## 5. PDP Goals (`pdp-goals.controller.ts`) 🟢/🟡

No IDOR. Read gate `findOneWithArtefact({ xid, userId })`; writes via `saveGoal`/`anonymizeGoal` filtered `{ xid, userId }`; nested `actionXid` resolved in-memory within an owned goal.

**Verify / harden:**
- `markDeletedByArtefactIds(artefactIds)` — `updateMany({ artefactId ∈ …, status $ne DELETED })`, **no `userId`**. Reached via `deleteByArtefactIds` (artefact-deletion/account-cleanup cascade) with owner-verified ids.
- `markDeletedByUserId(userId)` — mass tombstone scoped by `userId`; account-cleanup path. Confirm its sole caller passes the authenticated/target user's own id.
- **Out-of-scope note (not IDOR):** `updateGoal`/`addAction`/`updateAction` don't check `status === DELETED` before `saveGoal`, so a caller can write to *their own* tombstoned goal. Single-user self-mutation edge case, no cross-user exposure.

---

## 6. Review Periods (`review-periods.controller.ts`) 🟢

No IDOR. All `xid` routes filter `{ xid, userId }`; `create` stamps `userId` from JWT and only auto-archives the caller's own active period; coverage cache is `coverage:${userId}:…` namespaced and the artefact query is `userId`-scoped.

**Verify / harden:**
- `markDeletedByUserId(userId)` — `updateMany({ userId }, tombstone)`; **not reachable from this controller** (the `DELETE` route archives via `updateByXid`). Account-cleanup primitive; confirm its caller passes the correct user's own id. Cannot cross users as written (the `userId` filter binds the whole update).

---

## 7. Specialties (`specialties.controller.ts`) 🟢

No IDOR and **nothing to verify.** Single `@Public()` GET returning an in-memory static registry; no service, repository, datastore, user identity, or client id in the path.

- Non-IDOR note: `@Public()` intentionally exposes global specialty reference data unauthenticated (onboarding picklist). Policy choice, not an ownership bug.

---

## 8. Quota (`quota.controller.ts`) 🟢

No IDOR and **nothing to verify.** Single `@Public()` GET returning a static `creditInfoItems` constant — generic explainer text, no per-user balance.

- Non-IDOR note: a user's **actual** credit balance/usage is served elsewhere (`QuotaGuard`/`QuotaInterceptor`, profile/`init`), not by this controller. If you want assurance those are ownership-scoped, review the live-balance path (covered in §12 `init` fan-out for `getQuotaStatus`).

---

## 9. Acknowledgements (`acknowledgements.controller.ts`) 🟢/🟡

No IDOR. `create` stamps `userId` from JWT; idempotency read and duplicate-race re-read both filter `{ userId, noticeVersion }`; unique index is compound `{ userId, noticeVersion }`.

**Verify / harden:**
- 🟡 `findAcknowledgedVersions(userId)` — `distinct('noticeVersion', { userId })`; **not** called from this controller. `userId`-scoped and safe by construction, but confirm its caller (notice/onboarding surface — see §12 `init`) passes the authenticated user's own id.
- Non-IDOR note: `req.ip` correctness depends on `TRUST_PROXY_HOPS` matching proxy topology; mis-set → captures the proxy address (audit-quality only).

---

## 10. Notices — user (`notices.controller.ts`) 🟢/🟡

No IDOR. `dismiss` upserts a `NoticeDismissal` filtered `{ userId, noticeId }` with `userId` from JWT and `$setOnInsert` (never overwrites another user's row). The `:id` is a global notice xid (no user ownership).

**Verify / harden:**
- 🟡 **Shared service — admin methods.** `NoticesService.adminCreate/adminUpdate/adminDelete/adminList` filter notices by `{ xid }` alone (no `userId`). Acceptable only because notices are global admin resources exposed **exclusively** through `notices.admin.controller.ts` behind `@Roles(ADMIN)` — verified in §10-admin. Confirm no other controller wires these unscoped notice `update`/`delete` methods.
- Defence-in-depth: a unique index on `(userId, noticeId)` in `notice-dismissal.schema.ts` would harden the upsert against duplicate rows under a race (the filter already guarantees per-user scoping regardless).
- Non-IDOR note: `dismiss` returns 404 for a missing notice xid → boolean existence oracle for **global** notice xids (no user data).

---

## 10-admin. Notices — admin (`notices.admin.controller.ts`) 🟢/🟡

No IDOR. Global owner-less broadcasts, gated by class-level `@Roles(ADMIN)` via a correct ordinal `RolesGuard` (`user.role >= ADMIN`, fails closed on null user, signed `role` claim).

**Verify / harden:**
- 🟡 **Integrity of the JWT `role` claim** (same dependency as §2 and §11) — confirm `JwtStrategy` sources `role` from the verified token, and a role downgrade invalidates outstanding tokens.
- `@Roles` class-metadata resolution relies on `getAllAndOverride([handler, class])` — correct as written; a future per-method `@Roles(USER)` override would silently widen access.
- Non-IDOR note: `create`/`update` accept `audienceUserIds` (admin targeting a broadcast at specific users) — intended admin capability, reads no user data.

---

## 11. Account Cleanup (`account-cleanup.controller.ts`) 🔴 → ✅ FIXED

**Was:** `POST /dev/account-cleanup/:userId` was `@Public()` (no auth) + `@DevOnly()`, taking a **fully client-controlled `:userId`** and driving a destructive cascade (PII wipe + tombstone/hard-delete across ~11 collections). The only control was the env flag → an unauthenticated cross-user account-deletion IDOR in any environment where `app.isDevelopment=true`. The `assertUserMarkedForDeletion` gate is a **data-state** precondition (target must be deletion-pending), not an authorization check.

**Now (remediated):** `@Public()` removed and `@Roles(UserRole.SUPER_ADMIN)` added, `@DevOnly()` retained. The route now requires:
1. A valid JWT (global `JwtAuthGuard`, no bypass) → 401 otherwise.
2. `user.role >= SUPER_ADMIN` (`RolesGuard`) → 403 otherwise.
3. Non-production returns 404 (`DevOnlyGuard`).

Three independent controls; the unauthenticated IDOR is closed. Residual is intended privileged-admin capability (a SUPER_ADMIN triggering deletion of a deletion-pending account), analogous to the admin controllers.

**Verify / harden:**
- 🟡 **`app.isDevelopment` provenance** — the single most important config value for this route. Confirm in `config/app.config.ts` it derives strictly from a trusted server-side `NODE_ENV`, is never true on a deployed/internet-facing staging/QA environment, and cannot be influenced by a request header.
- 🟡 **Guard execution for the route** — assert (integration test) a 404 in non-dev config and 401/403 for non-SUPER_ADMIN, confirming each `APP_GUARD` runs independently.
- Reusable mass-delete primitives (`markDeletedByUserId`/`deleteByUserId`/`markPendingDeleteByUser`/`revokeAllByUser`) are safe for the cron caller (server-derived ids); the fix correctly lives at the controller/auth layer, not the primitives.
- Optional: for a user-facing self-delete, bind `@CurrentUser().userId === :userId`. Not needed for an admin/dev tool.

---

## 12. Init (`init.controller.ts`) 🟢/🟡

No IDOR. Read-only aggregation forwarding the JWT `userId`/`role` to seven downstream calls, each `userId`-scoped. The only client inputs (`x-platform`/`x-app-version` headers) feed a global, owner-less version-policy lookup.

**Verify / harden:**
- 🟡 Confirm the downstream sub-reads not read in full here scope by the passed `userId`: `quota.repository.ts` `findOldestInWindow` filter, and the dashboard sub-reads (`artefactsService.listArtefacts`, `pdpGoalsRepository.findByUserId/countByUserId`, `reviewPeriodsService.getActiveCoverageSummary`) — all confirmed `userId`-scoped in their own module reviews; noted here because they are reachable via the `init` fan-out.

---

## 13. Version Policy — admin (`version-policy.admin.controller.ts`) 🟢/🟡

No IDOR. Global owner-less per-platform config keyed by `platform`; gated by class-level `@Roles(ADMIN)`.

**Verify / harden:**
- 🟡 **Integrity of the JWT `role` claim** (same dependency as §2, §10-admin, §11).
- `@Roles` class-metadata resolution — correct as written.
- Non-IDOR **impact** note: this endpoint controls **all clients'** update behaviour — a broken admin gate would let a non-admin set `minimumVersion` (force lockout) or a malicious `storeUrl` (phishing the update prompt). Availability/integrity concern, elevates the importance of the JWT-role verification, but not an IDOR.

---

## 14. Health / Observability (`health.controller.ts`, `o11y-demo.controller.ts`) 🟢/🟡

No IDOR and no user-owned resource. Only infra interactions: Mongo `readyState` check, `admin().ping()`, `headObject` on the constant sentinel key `__health-check__`, and synthetic metric emission.

**Verify / harden (non-IDOR):**
- 🟡 **Info-exposure:** `StorageHealthIndicator` returns `error.message` in the `down({ message })` payload on the `@Public()` `/health` route — a storage failure could surface bucket/credential-adjacent text. Hardening consideration; confirm what `StorageService.headObject` propagates on failure.
- 🟡 **`@DevOnly` enforcement** for `o11y-demo` (same env-flag dependency as §11) — confirm it keys off trusted server-side `NODE_ENV`. Even if exposed, these routes leak no user data.

---

## Consolidated priority list

| Priority | Item | Where |
|---|---|---|
| **P0 (done)** | `/dev/account-cleanup/:userId` unauthenticated cross-user deletion | §11 — **FIXED** (auth + SUPER_ADMIN + DevOnly) |
| **P1** | Verify integrity of JWT `role`/`sid`/`userId` claims in `JwtStrategy` | §2, §10-admin, §11, §13 |
| **P1** | Verify `app.isDevelopment` / `@DevOnly` keys off trusted server-side `NODE_ENV` only | §11, §14 |
| **P2** | Confirm background sweepers/cascades consume only owner-derived ids (media sweeper, conversation/analysis-run/version-history cascades) | §1, §3, §4 |
| **P2** | Confirm admin-only notice `update`/`delete` are reachable solely via the admin controller | §10, §10-admin |
| **P3** | Defence-in-depth: thread `userId` into `_id`/`artefactId`/`conversationId`-only bulk primitives | cross-cutting, §1, §3, §5 |
| **P3** | Info-exposure hardening on `/health` storage-indicator error message | §14 |

---

*Generated from per-controller IDOR reviews. Items marked 🟢 are safe as reviewed; 🟡 depend on code outside the reviewed path and should be confirmed. No live cross-user vulnerability remains in the production posture as of this document.*
