# Backend Failure Point Review

An AI-powered portfolio builder for UK medical trainees. This document reviews the backend architecture for points of failure, reliability risks, integrity risks, operational risks, and scaling bottlenecks.

---

## Executive Summary

- **Total risks found:** 22
- **Critical:** 3
- **High:** 7
- **Medium:** 8
- **Low:** 4

### Top 5 Most Dangerous Backend Failure Points

1. **Outbox retry replays graph from stale checkpoint, producing duplicate assistant messages** — side effects are outside LangGraph's replay envelope
2. **Stale lock reset while handler is still running causes concurrent graph execution** — 5-minute lock vs. multi-minute LLM chains
3. **Assistant message created but analysis run status transition fails** — orphaned question with no matching `currentQuestion`
4. **`markFailed` read-then-write is not atomic** — retry counter can be corrupted under concurrent access
5. **No active-run-per-conversation uniqueness constraint at the DB level** — only application-level guard

---

## Risk Register

### 1. Outbox retry causes duplicate assistant messages

- **Type:** Explicit risk
- **Severity:** Critical
- **Backend area:** AnalysisStartHandler / AnalysisResumeHandler + PortfolioGraphService.handleInterruptSideEffects
- **Failure scenario:**
  1. Outbox consumer claims `analysis.start` job, handler transitions run PENDING -> RUNNING.
  2. `startGraph()` invokes LangGraph. Graph runs through `gather_context -> classify -> present_classification`, hits interrupt, checkpoint is saved.
  3. `handleInterruptSideEffectsIfPaused()` creates an ASSISTANT message with a *freshly generated* `nanoidAlphanumeric()` idempotency key.
  4. The handler then calls `transitionStatus(RUNNING -> AWAITING_INPUT)` — this call **times out or throws**.
  5. Handler re-throws -> outbox consumer calls `markFailed()` -> job is rescheduled for retry.
  6. On retry: `transitionStatus(PENDING -> RUNNING)` **fails** because status is already RUNNING. Handler throws, retries again, eventually permanently fails.
  7. Even if the status check somehow passes (e.g., a stale lock reset moved it back), `startGraph()` re-invokes `graph.invoke()` which replays from the checkpoint. After replay, `handleInterruptSideEffectsIfPaused()` creates **another** ASSISTANT message with a **new** random idempotency key (`portfolio-graph.service.ts:289`). The user sees duplicate question messages.
- **Why it can happen:** The idempotency key for assistant messages is generated fresh on every invocation, not derived from a deterministic value (like `conversationId + pausedNode + interruptId`). Side effects run *outside* LangGraph's replay-safe boundary.
- **User/system impact:** Duplicate question messages in conversation, mobile shows two identical questions, user can answer either one — potentially causing a state mismatch.
- **Detection signals:** Multiple ASSISTANT messages with identical question payloads for the same interrupt node in one conversation. Count of ASSISTANT messages > count of graph interrupts.
- **Recommended mitigation:** Derive the idempotency key deterministically: `${conversationId}:${pausedNode}:${checkpointId}`. Before creating the message, check if one already exists for that key. Return the existing message ID if found.
- **Residual risk after mitigation:** Low

---

### 2. Stale lock reset while handler is still running

- **Type:** Explicit risk
- **Severity:** Critical
- **Backend area:** OutboxConsumer + OutboxRepository.resetStaleLocks
- **Failure scenario:**
  1. Consumer claims job, sets `lockedUntil = now + 5 minutes`.
  2. Handler starts graph invocation. LangGraph runs multiple nodes, each making OpenAI API calls (e.g., classify at temp 0.1, check_completeness, tag_capabilities, reflect at temp 0.4). Total wall-clock can exceed 5 minutes under load or with retries.
  3. After 5 minutes, `resetStaleLocks()` transitions the entry back to PENDING and clears the lock.
  4. Next poll cycle: the *same job* is claimed again by the consumer and dispatched to a second handler invocation.
  5. Both handler instances run `graph.invoke()` concurrently on the same `thread_id`, corrupting the checkpoint state or producing conflicting side effects.
- **Why it can happen:** Lock duration is 5 minutes (`outbox.service.ts`), but a full graph traversal through multiple LLM calls (classify + completeness + followup + capabilities + reflect + generate_pdp + save) can easily exceed this. OpenAI structured output calls with retries can take 10-30s each; 6+ nodes x 15s = 90s in the best case, much longer under degraded conditions.
- **User/system impact:** Corrupted checkpoint state, duplicate artefact writes, double PDP goal creation, two concurrent graph executions fighting over the same conversation state.
- **Detection signals:** Two outbox entries for the same `analysisRunId` in PROCESSING state simultaneously. Checkpoint write conflicts. Duplicate artefact updates.
- **Recommended mitigation:** (a) Increase lock duration to 15-20 minutes. (b) Implement a heartbeat mechanism — the handler periodically extends the lock while still working. (c) Add a distributed lock on `conversationId` (e.g., MongoDB advisory lock or a separate lock document) before graph invocation.
- **Residual risk after mitigation:** Low with heartbeat; Medium with static lock increase alone.

---

### 3. Assistant message created but status transition fails — orphaned question

- **Type:** Explicit risk
- **Severity:** Critical
- **Backend area:** AnalysisStartHandler/ResumeHandler + PortfolioGraphService.handleInterruptSideEffects
- **Failure scenario:**
  1. Handler runs `startGraph()` -> graph hits interrupt -> checkpoint saved.
  2. `handleInterruptSideEffectsIfPaused()` succeeds -> ASSISTANT question message written to DB.
  3. Handler returns `pauseResult` with `questionMessageId`.
  4. `transitionStatus(RUNNING -> AWAITING_INPUT, { currentQuestion: { messageId, node, questionType } })` **fails** (e.g., Mongo transient error, run already transitioned by a stale-lock duplicate).
  5. AnalysisRun remains in RUNNING (or FAILED). `currentQuestion` is never set.
  6. ConversationContext computes `phase: 'analysing'` (because status is RUNNING, not AWAITING_INPUT).
  7. Mobile blocks all user input. The ASSISTANT question message is visible in the message list but the app has no `activeQuestion` pointing to it — user cannot answer it.
  8. The conversation is permanently stuck.
- **Why it can happen:** The ASSISTANT message creation and the `analysisRun.currentQuestion` update are **not in the same transaction**. The message is created inside `handleInterruptSideEffects` (a plain repo call, no session), while the status transition happens in the handler after the method returns.
- **User/system impact:** Permanently stuck conversation. User sees the question but cannot interact with it. Requires manual DB intervention.
- **Detection signals:** AnalysisRun in RUNNING or FAILED status with no `currentQuestion`, but an ASSISTANT question message exists in the conversation that was created after the run started. Alert on runs stuck in RUNNING for > 10 minutes.
- **Recommended mitigation:** Wrap both the message creation and the status transition in a single transaction. Alternatively, make the handler check for existing question messages on retry and re-use the existing message ID.
- **Residual risk after mitigation:** Low

---

### 4. `markFailed` read-then-write race condition

- **Type:** Explicit risk
- **Severity:** High
- **Backend area:** OutboxRepository.markFailed
- **Failure scenario:**
  1. Job is in PROCESSING. Handler throws.
  2. `markFailed` reads the current entry to get `attempts` (`outbox.repository.ts:107` — `findById`).
  3. Between the read and the subsequent `findOneAndUpdate` (`outbox.repository.ts:127`), a stale lock reset runs and transitions the entry to PENDING.
  4. The `findOneAndUpdate` filter `{ _id: entryId, status: PROCESSING }` finds nothing -> returns null.
  5. The failure is **silently swallowed** — `ok(null)` is returned. The entry is now PENDING again with the old `attempts` count (the increment was lost).
  6. If this happens repeatedly, the job retries indefinitely, never reaching `maxAttempts`.
- **Why it can happen:** `markFailed` is a two-step read-then-write without a transaction or atomic increment. The `findOneAndUpdate` filter correctly prevents double-writes, but the retry counter increment is lost.
- **User/system impact:** Job retries forever instead of failing permanently. Wastes compute (repeated OpenAI calls). Could cause runaway costs.
- **Detection signals:** Outbox entries that cycle between PENDING and PROCESSING many more times than `maxAttempts`. `attempts` field stays at 0 despite multiple processing cycles.
- **Recommended mitigation:** Use a single atomic `findOneAndUpdate` with `$inc: { attempts: 1 }` and a conditional `$set` based on whether `attempts + 1 >= maxAttempts`. Or use `$cond` in an aggregation pipeline update.
- **Residual risk after mitigation:** Low

---

### 5. No DB-level constraint on one active run per conversation

- **Type:** Inferred risk
- **Severity:** High
- **Backend area:** AnalysisRunsService.createRun + ConversationsService.handleStart
- **Failure scenario:**
  1. Two concurrent `POST /analysis { type: 'start' }` requests arrive (mobile retry, network duplicate).
  2. Both pass the `findActiveRun()` check at `conversations.service.ts:284` — neither sees the other's run because neither has committed yet.
  3. Both enter the transaction. Both create separate AnalysisRun documents and outbox entries.
  4. Both commit. Two runs exist, two outbox entries. Two graph executions start.
- **Why it can happen:** `findActiveRun()` is a read **outside** the transaction. The `hasCheckpoint` guard may also return false for both concurrent requests since neither graph has started yet. The idempotency key only prevents duplicates if the client sends the same key — if the client generates a new key per request (or the server generates via `generateXid()` at `conversations.service.ts:289`), the dedup fails.
- **User/system impact:** Two concurrent graph executions on the same conversation, corrupted checkpoints, duplicate artefact writes, duplicate PDP goals.
- **Detection signals:** Multiple AnalysisRun documents with non-terminal statuses for the same `conversationId`.
- **Recommended mitigation:** Add a partial unique index on `{ conversationId: 1 }` where `status IN (PENDING, RUNNING, AWAITING_INPUT)`. This makes the second insert fail atomically regardless of application logic.
- **Residual risk after mitigation:** Low

---

### 6. Graph `save` node error is swallowed — run marked COMPLETED

- **Type:** Explicit risk
- **Severity:** High
- **Backend area:** SaveNode + AnalysisStartHandler/ResumeHandler
- **Failure scenario:**
  1. Graph reaches `save` node. The transaction inside `save` fails (Mongo error, artefact update conflict).
  2. `save` node catches the error and returns `{ error: "Failed to save artefact: ..." }` (`save.node.ts:63`).
  3. Graph completes normally (no throw) — `graph.invoke()` returns. `getPausedNode()` returns null (graph finished).
  4. Handler transitions run to COMPLETED.
  5. The artefact was **never updated**. The user sees "Entry ready for review" but the artefact has no reflection, no capabilities, no title.
- **Why it can happen:** The save node catches its own errors and returns them as state (`save.node.ts:60-63`), rather than throwing. The handler has no way to know the graph "completed" with an error state.
- **User/system impact:** User believes their portfolio entry is complete. The artefact is empty or in its pre-analysis state. Data loss of the entire reflection and PDP goals.
- **Detection signals:** AnalysisRun status = COMPLETED but linked artefact has `status != IN_REVIEW` or has null reflection/capabilities. Periodic consistency check: count completed runs where artefact status is still DRAFT.
- **Recommended mitigation:** After `graph.invoke()` completes, read the final graph state and check for `state.error`. If non-null, throw so the handler transitions to FAILED. Alternatively, have the save node throw instead of returning an error state.
- **Residual risk after mitigation:** Low

---

### 7. Outbox retry after handler transitions run to FAILED

- **Type:** Explicit risk
- **Severity:** High
- **Backend area:** AnalysisStartHandler/ResumeHandler + OutboxConsumer retry
- **Failure scenario:**
  1. Handler starts graph -> graph throws partway through.
  2. Handler catches error, transitions run RUNNING -> FAILED.
  3. Handler re-throws -> outbox consumer calls `markFailed()` -> entry rescheduled for retry (attempt 1 of 3).
  4. On retry: handler calls `transitionStatus(PENDING -> RUNNING)`. This **fails** because status is FAILED (terminal), not PENDING.
  5. Handler throws -> `markFailed()` again -> retry again (attempt 2).
  6. Same failure. Attempt 3 -> permanent failure.
  7. Three wasted retries that can never succeed, each potentially consuming OpenAI API credits if the status transition happens to succeed on one path.
- **Why it can happen:** The handler transitions the analysis run to FAILED before the outbox consumer gets to schedule its retry. On retry, the run is in a terminal state and can never transition back. But more dangerously: if the `RUNNING -> FAILED` transition fails (`analysis-start.handler.ts:85-88` — the catch block just logs a warning), the run stays RUNNING, and a retry *would* attempt to invoke the graph again, potentially from a partially-corrupted checkpoint.
- **User/system impact:** Wasted compute on impossible retries. In the worse case (FAILED transition fails), graph may re-execute from a partial checkpoint.
- **Detection signals:** Outbox entries with `type: 'analysis.start'` or `'analysis.resume'` that reach maxAttempts where the linked analysis run is already in FAILED status.
- **Recommended mitigation:** At the start of each handler, read the current run status. If it's already terminal (FAILED, COMPLETED), return early without re-throwing (mark outbox as completed to prevent further retries).
- **Residual risk after mitigation:** Low

---

### 8. `handleInterruptSideEffects` returns null — run stuck in RUNNING

- **Type:** Explicit risk
- **Severity:** High
- **Backend area:** PortfolioGraphService.handleInterruptSideEffectsIfPaused
- **Failure scenario:**
  1. Graph pauses at an interrupt. `getPausedNode()` returns a valid node.
  2. `handleInterruptSideEffects()` is called, but the message creation fails (`portfolio-graph.service.ts:292` — `!result.ok`).
  3. Method logs an error and returns `null`.
  4. `handleInterruptSideEffectsIfPaused()` returns `null` (`portfolio-graph.service.ts:222`).
  5. Handler treats `null` as "graph completed" -> transitions run to COMPLETED.
  6. But the graph is actually paused at an interrupt with no question message created.
- **Why it can happen:** When the ASSISTANT message fails to create, the method returns null rather than throwing. The handler interprets null as "graph finished."
- **User/system impact:** Run marked COMPLETED while graph is paused. Artefact never completed (graph didn't reach save). ConversationContext shows `completed` phase but no entry was generated.
- **Detection signals:** AnalysisRun COMPLETED but graph checkpoint shows `next` is non-empty (still has pending interrupt nodes).
- **Recommended mitigation:** Throw an error from `handleInterruptSideEffects` if message creation fails, rather than returning null. This lets the handler transition to FAILED and allows outbox retry.
- **Residual risk after mitigation:** Low

---

### 9. No conversation-level mutex on concurrent resume requests

- **Type:** Inferred risk
- **Severity:** High
- **Backend area:** ConversationsService.handleResume
- **Failure scenario:**
  1. User taps "Confirm" on a multi-select question (capabilities). Mobile sends `POST /analysis { type: 'resume' }`.
  2. Network timeout — mobile retries the same request.
  3. First request: passes all guards, creates USER message + outbox entry in transaction. Commits.
  4. Second request: idempotency check finds the message -> returns early. **Safe.**
  5. But if the client sends a *different* idempotency key (e.g., retry logic generates a new one), the second request also creates a USER message + outbox entry.
  6. Two `analysis.resume` outbox entries for the same run. Both fire. First transitions AWAITING_INPUT -> RUNNING and resumes graph. Second finds status = RUNNING -> `transitionStatus` fails -> handler throws.
  7. The second handler's throw triggers `markFailed` on the outbox entry, which is correct. But the graph was already resumed — the retry attempt is just noise.
- **Why it can happen:** The idempotency check only works if the client provides the same key. The `activeRun.currentQuestion` check and `getPausedNode()` check are non-atomic reads that can both pass for concurrent requests.
- **User/system impact:** Mostly noise (second handler fails gracefully due to status guard). But if timing aligns poorly, two `graph.invoke(Command({ resume }))` calls could run concurrently.
- **Detection signals:** Multiple `analysis.resume` outbox entries for the same `analysisRunId` created within seconds.
- **Recommended mitigation:** Transition the analysis run status from AWAITING_INPUT -> RUNNING **inside the handleResume transaction** (before the outbox entry is created). This makes the status change atomic with the resume decision — the second request will fail the `findActiveRun().currentQuestion` check. Alternatively, use the `analysisRunId + node` as a deterministic idempotency key on the outbox entry.
- **Residual risk after mitigation:** Low

---

### 10. LangGraph checkpoint and side-effect writes are not atomic

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
- **Why it can happen:** LangGraph checkpoints are written by the MongoDBSaver *after* each node completes. The `save` node's transaction commits *during* node execution. These are separate MongoDB operations — there is no shared transaction.
- **User/system impact:** Duplicate PDP goals. If the save node is not fully idempotent (e.g., creates new goals rather than upserting), the user sees double goals.
- **Detection signals:** Multiple PDP goals with identical content for the same artefact. Count of goals per artefact exceeding the max (2 goals per spec).
- **Recommended mitigation:** Make PDP goal creation idempotent by upserting based on `(artefactId, goal hash)` or by deleting existing goals before creating new ones within the save transaction. Additionally, consider making the save node check if the artefact is already in IN_REVIEW status and skip the write.
- **Residual risk after mitigation:** Low

---

### 11. No transaction retry logic in TransactionService

- **Type:** Inferred risk
- **Severity:** Medium
- **Backend area:** TransactionService.withTransaction
- **Failure scenario:**
  1. Any transaction (message creation, analysis start, resume) encounters a MongoDB transient transaction error (e.g., `TransientTransactionError`).
  2. TransactionService catches the error, aborts the transaction, and re-throws.
  3. The caller (ConversationsService) throws an HTTP 500. The client retries.
  4. For non-idempotent operations, the retry may have side effects. For operations with idempotency keys, the retry succeeds.
- **Why it can happen:** MongoDB recommends retrying transactions that fail with `TransientTransactionError` or `UnknownTransactionCommitResult`. The TransactionService has no retry logic — it fails immediately.
- **User/system impact:** Transient Mongo failures surface as 500 errors to the client. Most operations are protected by idempotency keys so client retry is safe, but it creates unnecessary user-visible errors.
- **Detection signals:** Elevated 500 error rate correlated with MongoDB replica set elections or network hiccups. Error messages containing `TransientTransactionError`.
- **Recommended mitigation:** Add retry logic (1-2 retries with short backoff) for `TransientTransactionError` inside `withTransaction()`.
- **Residual risk after mitigation:** Low

---

### 12. Processing fire-and-forget can silently fail

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
- **Detection signals:** Messages with `processingStatus < COMPLETE` and `updatedAt` older than 5 minutes. Alert on count of stale processing messages.
- **Recommended mitigation:** Add a periodic sweep job that finds messages stuck in non-terminal processing states for > N minutes and re-triggers processing. Alternatively, use the outbox pattern for message processing too.
- **Residual risk after mitigation:** Low

---

### 13. OpenAI structured output returns schema-valid but semantically wrong data

- **Type:** Inferred risk
- **Severity:** Medium
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
- **Detection signals:** High rate of user overrides at the `present_classification` interrupt (user picks different type than suggested). Classification confidence distributions.
- **Recommended mitigation:** Log user override rates per entry type. Add a soft warning in the question when confidence is below a threshold. Consider a second LLM call for verification when confidence is borderline (0.8-0.9). Track override patterns per specialty to refine prompts.
- **Residual risk after mitigation:** Medium (inherent LLM limitation)

---

### 14. AssemblyAI timeout or failure leaves message stuck in TRANSCRIBING

- **Type:** Explicit risk
- **Severity:** Medium
- **Backend area:** ProcessingService.processAudioMessage -> LLMService.transcribeAudio
- **Failure scenario:**
  1. Audio message submitted. Processing begins: status -> TRANSCRIBING.
  2. AssemblyAI API is down or times out (2-minute timeout configured).
  3. `processMessage` catch block fires -> `markFailed(messageId, error)` -> status -> FAILED.
  4. **But**: If the process crashes *during* the AssemblyAI call (not a timeout but an OOM or SIGKILL), the `.catch()` handler never runs. Message stays in TRANSCRIBING forever.
- **Why it can happen:** Same fire-and-forget issue as risk #12, compounded by the fact that audio processing takes longer and is more likely to span process restarts.
- **User/system impact:** Same as #12 — stuck conversation. Audio message unprocessable.
- **Detection signals:** Messages in TRANSCRIBING status for > 5 minutes.
- **Recommended mitigation:** Same as #12 — periodic sweep for stale processing statuses. Additionally, consider setting a maximum processing time and auto-marking as FAILED after timeout.
- **Residual risk after mitigation:** Low

---

### 15. Follow-up loop counter is in graph state — not validated server-side

- **Type:** Inferred risk
- **Severity:** Medium
- **Backend area:** PortfolioGraph completenessRouter + ask_followup node
- **Failure scenario:**
  1. Graph runs completeness check -> missing sections -> `ask_followup` node.
  2. User responds. Graph resumes -> `gather_context` -> `check_completeness` again.
  3. Still missing -> `ask_followup` again. `followUpRound` incremented to 2.
  4. User responds. Graph resumes -> `gather_context` -> `check_completeness`.
  5. If the `completenessRouter` logic has a bug where it doesn't check `followUpRound >= MAX_FOLLOWUP_ROUNDS` correctly (e.g., off-by-one), a third follow-up round executes.
  6. In the extreme case, an infinite loop of follow-ups.
- **Why it can happen:** The loop counter lives in graph state and is compared to `MAX_FOLLOWUP_ROUNDS = 2`. If the reducer for `followUpRound` has a bug (e.g., doesn't increment, or the router checks `>` instead of `>=`), the loop continues. Since the router is the *only* exit from the loop, there's no server-side circuit breaker.
- **User/system impact:** User stuck in infinite follow-up loop. Wasted OpenAI API calls. Bad UX.
- **Detection signals:** Conversations with > 2 follow-up ASSISTANT messages. Graph state with `followUpRound > 2`.
- **Recommended mitigation:** Add a hard assertion in the `ask_followup` node: if `followUpRound >= MAX_FOLLOWUP_ROUNDS`, throw (fail the run) rather than creating another follow-up. This is a defense-in-depth against router bugs.
- **Residual risk after mitigation:** Low

---

### 16. Polling load amplification under concurrent users

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
- **Residual risk after mitigation:** Low with SSE; Medium with caching alone.

---

### 17. JWT tokens are long-lived with no revocation mechanism

- **Type:** Inferred risk
- **Severity:** Medium
- **Backend area:** Auth module — JwtStrategy
- **Failure scenario:**
  1. User's credentials are compromised. Admin disables the account.
  2. Attacker already has a valid JWT token (7-day expiry).
  3. JwtAuthGuard validates the token's signature and expiry — both pass.
  4. No check against a revocation list or the user's `lockedUntil` field.
  5. Attacker continues to access the API for up to 7 days.
- **Why it can happen:** JWT strategy only validates signature and expiration. It does not check if the user account is locked or disabled. No refresh token rotation. No token revocation list.
- **User/system impact:** Compromised account remains accessible until token expires. GDPR/UK data protection implications if portfolio data is accessed.
- **Detection signals:** API requests from a locked/disabled user account.
- **Recommended mitigation:** (a) Check `user.lockedUntil` and `user.isActive` on every request in the JWT strategy `validate()` method (adds one DB read per request, cacheable). (b) Reduce token TTL to 1 hour and add refresh token rotation. (c) Add a token revocation check for high-severity cases.
- **Residual risk after mitigation:** Low

---

### 18. `hasCheckpoint` guard does not prevent re-runs after FAILED

- **Type:** Explicit risk
- **Severity:** Medium
- **Backend area:** ConversationsService.handleStart
- **Failure scenario:**
  1. User starts analysis -> graph runs -> fails midway -> run FAILED.
  2. LangGraph checkpoint exists (nodes up to the failure point were checkpointed).
  3. User tries `POST /analysis { type: 'start' }` again.
  4. `hasCheckpoint()` returns true -> throws "Analysis already started."
  5. User cannot retry analysis. Conversation permanently stuck in a failed state with no way to restart.
- **Why it can happen:** `hasCheckpoint()` checks if *any* checkpoint data exists for the thread, not whether the run is in a recoverable state. After a failure, checkpoints remain. The `findActiveRun()` check returns null (FAILED is terminal), but `hasCheckpoint` fires first and blocks.
- **User/system impact:** User cannot restart a failed analysis. Must create a new conversation and re-enter all their clinical experience text.
- **Detection signals:** Users creating new conversations immediately after a FAILED analysis run on the previous one. Support tickets about "stuck" conversations.
- **Recommended mitigation:** Check `hasCheckpoint()` only if there's an active (non-terminal) run. If the latest run is FAILED, allow starting a new run (potentially with a fresh thread_id or by clearing the old checkpoint).
- **Residual risk after mitigation:** Low

---

### 19. `handleInterruptSideEffects` casts interrupt value without validation

- **Type:** Explicit risk
- **Severity:** Low
- **Backend area:** PortfolioGraphService.handleInterruptSideEffects
- **Failure scenario:**
  1. A bug in a graph node produces a malformed interrupt payload (e.g., `options` is null, or `type` is an unexpected string).
  2. `handleInterruptSideEffects` casts `interruptValue.options as ClassificationOption[]` without validation (`portfolio-graph.service.ts:260`).
  3. `.map()` on a null/undefined throws a runtime TypeError.
  4. Error propagates up -> handler transitions run to FAILED.
  5. The actual interrupt payload is lost — difficult to debug.
- **Why it can happen:** Trust boundary is violated: graph node output is treated as trusted despite being generated by LLM-driven logic. No Zod validation on the interrupt payload.
- **User/system impact:** Run fails with an unhelpful error message. Retries fail identically.
- **Detection signals:** GRAPH_START_FAILED or GRAPH_RESUME_FAILED errors with `TypeError: Cannot read properties of null`.
- **Recommended mitigation:** Validate interrupt payload with a Zod schema before processing. Log the raw payload on validation failure.
- **Residual risk after mitigation:** Low

---

### 20. Outbox `cleanupOldEntries` could delete evidence of failures

- **Type:** Inferred risk
- **Severity:** Low
- **Backend area:** OutboxRepository.cleanupOldEntries
- **Failure scenario:**
  1. Cleanup job runs, deleting FAILED entries older than threshold.
  2. A FAILED entry contained the error details for a bug that needs investigation.
  3. Evidence is lost.
- **Why it can happen:** The cleanup method deletes entries by status and age with no archive step.
- **User/system impact:** Loss of debugging information. Harder to investigate production failures.
- **Detection signals:** Investigation finds missing outbox entries.
- **Recommended mitigation:** Archive FAILED entries to a separate collection or log the full entry before deletion. Ensure cleanup threshold is generous (e.g., 30 days).
- **Residual risk after mitigation:** Low

---

### 21. RolesGuard ordinal comparison could over-grant access

- **Type:** Inferred risk
- **Severity:** Low
- **Backend area:** RolesGuard
- **Failure scenario:**
  1. New role added between existing ordinals (e.g., `MODERATOR = 15` between `USER = 10` and `ADMIN = 20`).
  2. Routes guarded with `@Roles(UserRole.MODERATOR)` would also grant access to ADMIN — correct.
  3. But routes guarded with `@Roles(UserRole.USER)` would also grant MODERATOR and ADMIN access — may be unintended for user-only routes.
  4. If the guard returns false when no roles are defined (current behavior), undecorated routes reject everyone — this is safe.
- **Why it can happen:** Ordinal comparison (`>=`) assumes a strict hierarchy. Adding lateral roles (e.g., `REVIEWER` who shouldn't have admin access but has a higher ordinal) breaks the model.
- **User/system impact:** Privilege escalation if role model evolves incorrectly.
- **Detection signals:** Audit role assignments vs. intended access patterns.
- **Recommended mitigation:** Document the role hierarchy invariant. Add a test that enumerates all roles and their ordinals. Consider explicit role sets instead of ordinal comparison if the role model becomes more complex.
- **Residual risk after mitigation:** Low

---

### 22. Single-process outbox consumer — no horizontal scaling

- **Type:** Inferred risk
- **Severity:** Low
- **Backend area:** OutboxConsumer
- **Failure scenario:**
  1. API runs as a single process. OutboxConsumer polls every 1s, batch size 5.
  2. Each batch processes 5 jobs in parallel. But each job may take 2-5 minutes (graph execution with LLM calls).
  3. `isProcessing = true` blocks new polls until the batch completes.
  4. If 10 users start analysis simultaneously, 5 run immediately, the other 5 wait potentially minutes.
  5. If the API is scaled to multiple instances, all instances run their own OutboxConsumer. The atomic claim prevents double-processing, but multiple instances competing increases Mongo write contention.
- **Why it can happen:** In-process consumer with a boolean lock. Not designed for horizontal scaling.
- **User/system impact:** Under load: long queue wait times. Users see "analysing" phase for extended periods before graph even starts. Multi-instance: increased but manageable Mongo contention.
- **Detection signals:** Time between outbox entry creation and first `PROCESSING` status. Growing queue depth (PENDING entries).
- **Recommended mitigation:** For single-instance: Process jobs individually (don't block polling during execution). Use a semaphore with configurable concurrency (e.g., 3 concurrent jobs). For multi-instance: the current atomic claim design is correct for horizontal scaling — just ensure lock durations are adequate per risk #2.
- **Residual risk after mitigation:** Medium (architecture limits throughput)

---

## Cross-Cutting Weak Spots

1. **Side effects outside LangGraph's replay boundary.** Assistant message creation, artefact saves, and PDP goal writes happen during node execution or after `invoke()` returns — not in the checkpoint transaction. Any retry or replay will re-execute these side effects. The system relies on application-level idempotency that is inconsistently applied (fresh nanoid keys for messages, no dedup on PDP goals).

2. **Two separate sources of truth for graph state.** The LangGraph checkpoint and the AnalysisRun document both represent "where the analysis is." They can diverge: checkpoint shows paused at `present_capabilities` while AnalysisRun shows RUNNING (if the status transition failed). ConversationContext derives phase from AnalysisRun, not the checkpoint — so the user sees the wrong state.

3. **Fire-and-forget async processing.** Message processing (transcription + cleaning) is not queued durably. Process crashes lose in-flight work with no recovery path. This is a different reliability tier than the outbox pattern used for analysis, creating an inconsistent failure model.

4. **No global concurrency control per conversation.** Multiple code paths can operate on the same conversation concurrently (sendMessage, handleStart, handleResume, outbox handlers, processing). The guards use non-atomic reads that can all pass simultaneously. The only true mutex is the AnalysisRun status field's optimistic lock — but that's checked after work has already been done.

5. **Weak observability for state consistency.** No structured metrics on: outbox queue depth, time-to-process, analysis run state transitions, graph node execution durations, LLM call latency/errors, message processing durations. Without these, most of the above risks are undetectable until a user reports a stuck conversation.

---

## Missing Invariants / Assertions

These should be enforced in code or as database constraints:

1. **At most one active AnalysisRun per conversation** — partial unique index on `{ conversationId: 1 }` where `status IN (PENDING, RUNNING, AWAITING_INPUT)`.
2. **At most one unanswered question per conversation** — only one ASSISTANT message should have a non-null `question` and null `answer` at any time.
3. **Message status transitions must be monotonic** — PENDING -> TRANSCRIBING -> CLEANING -> COMPLETE is forward-only. No backward transitions (except to FAILED from any state).
4. **Analysis run status transitions must follow the valid state machine** — enforce at the repository level, not just the service. `COMPLETED` and `FAILED` are terminal — no transitions out.
5. **A graph resume must target the latest checkpoint** — validate `checkpoint_id` matches the most recent checkpoint for the thread before invoking `graph.invoke(Command)`.
6. **`currentQuestion.messageId` must reference an existing ASSISTANT message with a non-null question** — validate on write.
7. **Artefact status must be IN_REVIEW when analysis run is COMPLETED** — if the save node failed, the run should not be COMPLETED.
8. **PDP goal count per artefact must not exceed 2** — enforce at the repository or schema level.
9. **An outbox entry in COMPLETED status must correspond to a terminal analysis run status** — periodic consistency check.
10. **`followUpRound` must never exceed `MAX_FOLLOWUP_ROUNDS`** — assert in the `ask_followup` node.

---

## Recommended Tests

### Unit Tests

- AnalysisStartHandler: status already FAILED -> should return early, not re-throw
- AnalysisResumeHandler: status already COMPLETED -> should return early
- `markFailed` with concurrent status change -> verify attempts counter correctness
- SaveNode error -> verify graph state contains error field
- `handleInterruptSideEffects` with malformed interrupt payload -> verify graceful error
- Confidence calibration edge cases: exactly 50 words, exactly 2 signals, exactly 0.15 gap
- `completenessRouter` at `followUpRound = MAX_FOLLOWUP_ROUNDS` -> routes to tag_capabilities, not ask_followup

### Integration Tests

- Full graph run from start to completion -> verify artefact in IN_REVIEW, PDP goals created, no duplicate messages
- Graph run that fails at save node -> verify run is FAILED (not COMPLETED), artefact unchanged
- Outbox retry after transient handler failure -> verify no duplicate assistant messages
- `handleStart` with concurrent duplicate requests -> verify only one run created (requires DB-level constraint)
- `handleResume` with expired lock + concurrent retry -> verify no double graph invocation
- Message processing crash recovery -> verify sweep job re-processes stuck messages

### Concurrency Tests

- Two `POST /analysis { type: 'start' }` requests in parallel -> assert exactly one run created
- Two `POST /analysis { type: 'resume' }` requests in parallel with different idempotency keys -> assert only one resume executes
- `resetStaleLocks` running while handler is mid-execution -> assert handler detects lock loss or no concurrent claim happens
- Multiple outbox consumers (multi-instance) claiming the same batch -> assert no double-claims

### Crash/Retry Tests

- Kill process during `processMessage()` transcription -> restart -> verify message can be reprocessed
- Kill process during graph `save` node -> restart -> verify outbox retry produces correct final state (no duplicate PDP goals)
- Kill process after ASSISTANT message created but before status transition -> verify retry creates no duplicate messages
- Mongo replica set step-down during transaction -> verify transaction retries or fails cleanly

### Property/State-Machine Tests

- AnalysisRun status transitions: fuzz all possible `(currentStatus, targetStatus)` pairs -> only valid transitions succeed
- Message processing status: fuzz all transitions -> verify monotonicity
- Graph state: after any number of start/resume cycles, `followUpRound <= MAX_FOLLOWUP_ROUNDS`
- Outbox entries: after all retries, status is either COMPLETED or FAILED (no entries stuck in PROCESSING indefinitely)

### Contract/Schema Tests

- Every interrupt payload matches its expected Zod schema (classification, followup, capabilities)
- Every LLM response parsed by `invokeStructured<T>()` matches the declared Zod schema
- `ConversationContext` DTO matches the shared package schema for every possible analysis run state
- API response DTOs never leak `_id` (only `xid`)

---

## Priority Fix Order

| # | Fix | Risks Addressed | Effort |
|---|-----|-----------------|--------|
| 1 | Make assistant message idempotency keys deterministic (`${conversationId}:${node}:${checkpointId}`) | #1 (Critical) | Small |
| 2 | Add handler early-exit when run is already terminal — check status at handler start, return without re-throwing | #7 (High), #3 partial | Small |
| 3 | Throw on save node error — don't return `{ error }` state, throw so handler sees it as failure | #6 (High) | Small |
| 4 | Throw on failed message creation in `handleInterruptSideEffects` instead of returning null | #8 (High) | Small |
| 5 | Increase outbox lock duration to 15 min + add heartbeat to prevent stale lock reset during long graph runs | #2 (Critical) | Medium |
| 6 | Add partial unique index on AnalysisRun `{ conversationId: 1 }` for active statuses | #5 (High) | Small |
| 7 | Make `markFailed` atomic — single `findOneAndUpdate` with `$inc` and conditional status set | #4 (High) | Small |
| 8 | Add periodic sweep for stuck messages in non-terminal processing statuses | #12 (Medium), #14 (Medium) | Medium |
| 9 | Allow restart after FAILED run — skip `hasCheckpoint` guard when latest run is terminal, clear checkpoint or use fresh thread_id | #18 (Medium) | Medium |
| 10 | Make PDP goal creation idempotent in save node — delete existing goals for artefact before creating new ones within the same transaction | #10 (High) | Small |
