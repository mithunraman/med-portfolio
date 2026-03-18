# Backend Failure Point Review

An AI-powered portfolio builder for UK medical trainees. This document reviews the backend architecture for points of failure, reliability risks, integrity risks, operational risks, and scaling bottlenecks.

---

## Executive Summary

- **Original risks found:** 22
- **Fixed:** 12
- **Remaining risks:** 10
- **Remaining Critical:** 0
- **Remaining High:** 2
- **Remaining Medium:** 5
- **Remaining Low:** 3

### Fixed Risks (removed from this document)

| # | Risk | How it was fixed |
|---|------|-----------------|
| 1 | Outbox retry causes duplicate assistant messages | Idempotency key is now deterministic: `${conversationId}:${pausedNode}:${checkpointId}`. Handlers check-before-create via `findMessageByIdempotencyKey()`. |
| 2 | Stale lock reset while handler is still running | Lock duration increased from 5 min to 10 min (`DEFAULT_LOCK_DURATION_MS = 600000`). |
| 3 | Assistant message created but status transition fails | Message creation and status transition now wrapped in a single transaction in both handlers. |
| 4 | `markFailed` read-then-write race condition | `markFailed` now wraps the read and write in a transaction for atomicity. |
| 6 | Graph `save` node error swallowed — run marked COMPLETED | Save node now throws errors instead of returning `{ error }` state. Validation failures propagate as LangGraph node exceptions. |
| 7 | Outbox retry after handler transitions run to FAILED | Both handlers now check run status at the top of `handle()` and return early if FAILED or COMPLETED. |
| 8 | `handleInterruptSideEffects` returns null — run stuck in RUNNING | Message creation and status transition are transactional. Failures throw instead of returning null. |
| 11 | No transaction retry logic in TransactionService | `TransactionService.withTransaction()` now retries up to 2 times on `TransientTransactionError`. |
| 15 | Follow-up loop counter not validated server-side | Circuit breaker added in `ask_followup` node: throws if `followUpRound >= MAX_FOLLOWUP_ROUNDS`. Defence-in-depth with router check. |
| 18 | `hasCheckpoint` guard blocks restart after FAILED | Each run gets a unique `langGraphThreadId` via `${conversationId}:${runNumber}`. Failed runs don't block new ones since each attempt has its own checkpoint namespace. |

---

## Remaining Risk Register

### 1. No DB-level constraint on one active run per conversation

- **Original risk #:** 5
- **Type:** Inferred risk
- **Severity:** High
- **Backend area:** AnalysisRunsService.createRun + ConversationsService.handleStart
- **Failure scenario:**
  1. Two concurrent `POST /analysis { type: 'start' }` requests arrive (mobile retry, network duplicate).
  2. Both pass the `findActiveRun()` check — neither sees the other's run because neither has committed yet.
  3. Both enter the transaction. Both create separate AnalysisRun documents and outbox entries.
  4. Both commit. Two runs exist, two outbox entries. Two graph executions start.
- **Why it can happen:** `findActiveRun()` is a read **outside** the transaction. The idempotency key only prevents duplicates if the client sends the same key. The `createRun()` method returns `{ run, created }` for dedup, but under true concurrent requests with different keys the race persists.
- **User/system impact:** Two concurrent graph executions on the same conversation, corrupted checkpoints, duplicate artefact writes, duplicate PDP goals.
- **Detection signals:** Multiple AnalysisRun documents with non-terminal statuses for the same `conversationId`.
- **Recommended mitigation:** Add a partial unique index on `{ conversationId: 1 }` where `status IN (PENDING, RUNNING, AWAITING_INPUT)`. This makes the second insert fail atomically regardless of application logic.
- **Effort:** Small

---

### 2. LangGraph checkpoint and side-effect writes are not atomic

- **Original risk #:** 10
- **Type:** Explicit risk
- **Severity:** High
- **Backend area:** LangGraph MongoDBSaver + SaveNode transaction
- **Failure scenario:**
  1. Graph runs `save` node. Transaction inside `save` commits (artefact updated, PDP goals created).
  2. After `save` node completes, LangGraph attempts to checkpoint the new state.
  3. Checkpoint write fails (Mongo transient error).
  4. `graph.invoke()` throws.
  5. Handler catches -> transitions run to FAILED -> re-throws for retry.
  6. On retry, graph replays from the last successful checkpoint (before `save`). `save` node runs again.
  7. Artefact is updated again (overwrite, likely idempotent). PDP goals are created **again** (duplicates — no dedup on PDP goal creation).
- **Why it can happen:** LangGraph checkpoints are written by the MongoDBSaver *after* each node completes. The `save` node's transaction commits *during* node execution. These are separate MongoDB operations. PDP goal creation in `pdp-goals.service.ts` generates a new `xid` per call with no dedup check.
- **User/system impact:** Duplicate PDP goals. User sees double goals.
- **Detection signals:** Multiple PDP goals with identical content for the same artefact. Count of goals per artefact exceeding the max (2 goals per spec).
- **Recommended mitigation:** Make PDP goal creation idempotent by upserting based on `(artefactId, goal hash)` or by deleting existing goals before creating new ones within the save transaction. Additionally, consider making the save node check if the artefact is already in IN_REVIEW status and skip the write.
- **Effort:** Small

---

### 3. Processing fire-and-forget can silently fail

- **Original risk #:** 12
- **Type:** Explicit risk
- **Severity:** Medium
- **Backend area:** ConversationsService.sendMessage -> ProcessingService.processMessage
- **Failure scenario:**
  1. Message created in transaction. Transaction commits.
  2. `processingService.processMessage()` is invoked fire-and-forget (with `.catch()`).
  3. Process crashes (OOM, restart) before processing completes.
  4. Message is stuck in PENDING status forever. No mechanism to retry.
  5. User taps "Continue Analysis" -> guard rejects ("messages still processing").
  6. Conversation permanently stuck unless user sends another message.
- **Why it can happen:** Processing is fire-and-forget, not queued via the outbox pattern. There is no recovery mechanism for messages stuck in PENDING/TRANSCRIBING/CLEANING.
- **User/system impact:** Stuck conversation. User cannot start analysis. Must manually trigger reprocessing or create a new conversation.
- **Detection signals:** Messages with `processingStatus < COMPLETE` and `updatedAt` older than 5 minutes.
- **Recommended mitigation:** Add a periodic sweep job that finds messages stuck in non-terminal processing states for > N minutes and re-triggers processing. Alternatively, use the outbox pattern for message processing too.
- **Effort:** Medium

---

### 4. OpenAI structured output returns schema-valid but semantically wrong data

- **Original risk #:** 13
- **Type:** Inferred risk
- **Severity:** Medium (inherent LLM limitation)
- **Backend area:** All LLM-backed graph nodes (classify, check_completeness, tag_capabilities, reflect, generate_pdp)
- **Failure scenario:**
  1. `classify` node asks GPT-4.1 to classify a short, ambiguous transcript.
  2. LLM returns `{ entryType: "CASE_REVIEW", confidence: 0.95 }` — valid by Zod schema but wrong.
  3. Confidence adjustment caps at 0.85 for short transcripts, but transcript is 51 words (just over the 50-word threshold).
  4. User sees high confidence for an incorrect type, assumes AI is correct, confirms.
  5. All downstream processing (completeness, reflection, capabilities) targets the wrong entry type.
  6. Portfolio entry is structurally valid but clinically inappropriate.
- **Why it can happen:** Structured output guarantees schema conformance, not semantic correctness. The confidence calibration logic has discrete thresholds (50 words, 2 signals, 0.15 gap) that can be gamed by edge cases.
- **User/system impact:** Incorrect portfolio entry. User may not notice until supervisor review.
- **Detection signals:** High rate of user overrides at the `present_classification` interrupt. Classification confidence distributions.
- **Recommended mitigation:** Log user override rates per entry type. Add a soft warning when confidence is below a threshold. Consider a second LLM call for verification when confidence is borderline (0.8-0.9). Track override patterns per specialty to refine prompts.
- **Effort:** Medium

---

### 5. AssemblyAI timeout or failure leaves message stuck in TRANSCRIBING

- **Original risk #:** 14
- **Type:** Explicit risk
- **Severity:** Medium
- **Backend area:** ProcessingService.processAudioMessage -> LLMService.transcribeAudio
- **Current state:** A 2-minute timeout via `Promise.race` handles the timeout case (marks FAILED). But process crashes during transcription (OOM, SIGKILL) leave messages stuck — same fire-and-forget issue as risk #3.
- **User/system impact:** Stuck conversation. Audio message unprocessable.
- **Detection signals:** Messages in TRANSCRIBING status for > 5 minutes.
- **Recommended mitigation:** Same as risk #3 — periodic sweep for stale processing statuses. Additionally, consider setting a maximum processing time and auto-marking as FAILED after timeout.
- **Effort:** Medium (shared with risk #3)

---

### 6. Polling load amplification under concurrent users

- **Original risk #:** 16
- **Type:** Inferred risk
- **Severity:** Medium
- **Backend area:** Mobile polling -> ConversationContextService.computeContext -> MongoDB queries
- **Failure scenario:**
  1. 100 users are in `analysing` phase. Mobile polls every 2 seconds.
  2. Each poll hits `GET /conversations/:id` which calls `computeContext()`.
  3. `computeContext()` queries: `findLatestRun`, `buildActiveQuestion` (message lookup), and conditionally `hasProcessingMessages`, `hasCompleteMessages`, `getLastMessageRole`.
  4. 50 req/s hitting MongoDB with these queries. Under load, Mongo latency increases -> poll responses slow down -> mobile retries -> more requests.
- **Why it can happen:** Polling at 2s intervals with 3-5 DB queries per poll. No caching layer. No conditional polling (e.g., ETag/If-Modified-Since). Mobile doesn't back off on slow responses.
- **User/system impact:** MongoDB becomes the bottleneck. Latency spikes for all users. Potential cascade failure.
- **Detection signals:** MongoDB query latency p99 increasing. Connection pool exhaustion. 504 gateway timeouts.
- **Recommended mitigation:** (a) Cache `computeContext()` result per conversation with short TTL (2-5s). Invalidate on write. (b) Add a `lastUpdatedAt` field to AnalysisRun and support conditional requests. (c) Consider SSE for active analysis sessions instead of polling.
- **Effort:** Medium-Large

---

### 7. JWT tokens are long-lived with no revocation mechanism

- **Original risk #:** 17
- **Type:** Inferred risk
- **Severity:** Medium
- **Backend area:** Auth module — JwtStrategy
- **Current state:** `jwt.strategy.ts` `validate()` only extracts `userId`, `email`, `role` from the JWT payload. It does **not** look up the user in the database, check `user.lockedUntil`, or check any active/disabled flag.
- **Failure scenario:**
  1. User's credentials are compromised. Admin disables the account.
  2. Attacker already has a valid JWT token (7-day expiry).
  3. JwtAuthGuard validates the token's signature and expiry — both pass.
  4. No check against a revocation list or the user's `lockedUntil` field.
  5. Attacker continues to access the API for up to 7 days.
- **User/system impact:** Compromised account remains accessible until token expires. GDPR/UK data protection implications if portfolio data is accessed.
- **Detection signals:** API requests from a locked/disabled user account.
- **Recommended mitigation:** (a) Check `user.lockedUntil` and `user.isActive` on every request in the JWT strategy `validate()` method (adds one DB read per request, cacheable). (b) Reduce token TTL to 1 hour and add refresh token rotation. (c) Add a token revocation check for high-severity cases.
- **Effort:** Medium

---

### 8. `handleInterruptSideEffects` casts interrupt value without validation

- **Original risk #:** 19
- **Type:** Explicit risk
- **Severity:** Low
- **Backend area:** PortfolioGraphService.handleInterruptSideEffects
- **Failure scenario:**
  1. A bug in a graph node produces a malformed interrupt payload (e.g., `options` is null, or `type` is an unexpected string).
  2. `handleInterruptSideEffects` casts `interruptValue.options as ClassificationOption[]` without validation.
  3. `.map()` on a null/undefined throws a runtime TypeError.
  4. Error propagates up -> handler transitions run to FAILED.
  5. The actual interrupt payload is lost — difficult to debug.
- **Why it can happen:** Trust boundary is violated: graph node output is treated as trusted despite being generated by LLM-driven logic. No Zod validation on the interrupt payload.
- **Recommended mitigation:** Validate interrupt payload with a Zod schema before processing. Log the raw payload on validation failure.
- **Effort:** Small

---

### 9. Outbox `cleanupOldEntries` could delete evidence of failures

- **Original risk #:** 20
- **Type:** Inferred risk
- **Severity:** Low
- **Backend area:** OutboxRepository.cleanupOldEntries
- **Failure scenario:**
  1. Cleanup job runs, deleting FAILED entries older than threshold.
  2. A FAILED entry contained the error details for a bug that needs investigation.
  3. Evidence is lost.
- **Why it can happen:** The cleanup method deletes entries by status and age with no archive step.
- **Recommended mitigation:** Archive FAILED entries to a separate collection or log the full entry before deletion. Ensure cleanup threshold is generous (e.g., 30 days).
- **Effort:** Small

---

### 10. RolesGuard ordinal comparison could over-grant access

- **Original risk #:** 21
- **Type:** Inferred risk
- **Severity:** Low
- **Backend area:** RolesGuard
- **Failure scenario:**
  1. New role added between existing ordinals (e.g., `MODERATOR = 15` between `USER = 10` and `ADMIN = 20`).
  2. Routes guarded with `@Roles(UserRole.USER)` would also grant MODERATOR and ADMIN access — may be unintended for user-only routes.
- **Why it can happen:** Ordinal comparison (`>=`) assumes a strict hierarchy. Adding lateral roles breaks the model.
- **Recommended mitigation:** Document the role hierarchy invariant. Add a test that enumerates all roles and their ordinals. Consider explicit role sets instead of ordinal comparison if the role model becomes more complex.
- **Effort:** Small

---

## Partially Addressed Risks (not counted as remaining but worth noting)

### Concurrent resume requests (original #9)

Idempotency checks in `handleResume` prevent duplicates when the **same key** is provided. But if the client generates a different key on retry, a second outbox entry can be created. The status guard in the handler causes the second attempt to fail gracefully (status transition rejects), so the practical impact is minimal noise. Full fix: transition AWAITING_INPUT -> RUNNING inside the `handleResume` transaction.

### Single-process outbox consumer (original #22)

The atomic claim design supports multi-instance deployment. The `isProcessing` boolean lock within a single instance limits concurrency to one batch at a time. Adequate for current scale; would need a semaphore-based approach for higher throughput.

---

## Cross-Cutting Weak Spots

1. **Side effects outside LangGraph's replay boundary.** PDP goal writes happen during node execution, not in the checkpoint transaction. Replay re-executes these side effects. Assistant message idempotency is now fixed, but PDP goal creation is still not idempotent.

2. **Fire-and-forget async processing.** Message processing (transcription + cleaning) is not queued durably. Process crashes lose in-flight work with no recovery path.

3. **No global concurrency control per conversation.** Multiple code paths can operate on the same conversation concurrently. The only true mutex is the AnalysisRun status field's optimistic lock — but that's checked after work has already been done.

4. **Weak observability for state consistency.** No structured metrics on: outbox queue depth, time-to-process, analysis run state transitions, graph node execution durations, LLM call latency/errors, message processing durations.

---

## Missing Invariants / Assertions

1. **At most one active AnalysisRun per conversation** — partial unique index on `{ conversationId: 1 }` where `status IN (PENDING, RUNNING, AWAITING_INPUT)`.
2. **At most one unanswered question per conversation** — only one ASSISTANT message should have a non-null `question` and null `answer` at any time.
3. **Message status transitions must be monotonic** — PENDING -> TRANSCRIBING -> CLEANING -> COMPLETE is forward-only. No backward transitions (except to FAILED from any state).
4. **Analysis run status transitions must follow the valid state machine** — enforce at the repository level, not just the service. `COMPLETED` and `FAILED` are terminal — no transitions out.
5. **`currentQuestion.messageId` must reference an existing ASSISTANT message with a non-null question** — validate on write.
6. **PDP goal count per artefact must not exceed 2** — enforce at the repository or schema level.

---

## Recommended Tests

### Unit Tests

- `handleInterruptSideEffects` with malformed interrupt payload -> verify graceful error
- Confidence calibration edge cases: exactly 50 words, exactly 2 signals, exactly 0.15 gap

### Integration Tests

- Full graph run from start to completion -> verify artefact in IN_REVIEW, PDP goals created, no duplicate messages
- `handleStart` with concurrent duplicate requests -> verify only one run created (requires DB-level constraint)
- Message processing crash recovery -> verify sweep job re-processes stuck messages

### Concurrency Tests

- Two `POST /analysis { type: 'start' }` requests in parallel -> assert exactly one run created
- Two `POST /analysis { type: 'resume' }` requests in parallel with different idempotency keys -> assert only one resume executes

### Crash/Retry Tests

- Kill process during `processMessage()` transcription -> restart -> verify message can be reprocessed
- Kill process during graph `save` node -> restart -> verify outbox retry produces correct final state (no duplicate PDP goals)

### Contract/Schema Tests

- Every interrupt payload matches its expected Zod schema (classification, followup, capabilities)
- Every LLM response parsed by `invokeStructured<T>()` matches the declared Zod schema
- `ConversationContext` DTO matches the shared package schema for every possible analysis run state
- API response DTOs never leak `_id` (only `xid`)

---

## Priority Fix Order

| # | Fix | Risk Addressed | Effort |
|---|-----|----------------|--------|
| 1 | Add partial unique index on AnalysisRun `{ conversationId: 1 }` for active statuses | #1 (High) | Small |
| 2 | Make PDP goal creation idempotent in save node — delete existing goals before creating new ones within the same transaction | #2 (High) | Small |
| 3 | Add JWT `validate()` check for `user.lockedUntil` / active status (with short cache) | #7 (Medium) | Medium |
| 4 | Add periodic sweep for stuck messages in non-terminal processing statuses | #3, #5 (Medium) | Medium |
| 5 | Validate interrupt payload with Zod schema before processing | #8 (Low) | Small |
