# Replay-Safe Side Effects — Implementation Plan

An implementation plan to make all side effects outside LangGraph's replay boundary safe to retry. This addresses risks #1, #3, #6, #8, #10 from the [backend failure review](./backend-failure-review.md) — the five highest-severity issues in the system, all stemming from a single architectural pattern.

---

## Problem Statement

LangGraph guarantees deterministic replay: when `graph.invoke()` resumes from a checkpoint, it re-executes nodes from the last checkpoint forward. Everything inside graph state is safe — the checkpointer ensures convergence.

The problem is that our system performs **real-world writes** (MongoDB inserts/updates) that happen outside LangGraph's checkpoint boundary:

1. **ASSISTANT message creation** after an interrupt — runs after `graph.invoke()` returns
2. **Artefact update + PDP goal creation** inside the `save` node — committed before LangGraph writes the checkpoint
3. **AnalysisRun status transitions** — decoupled from the writes they depend on

These writes are invisible to LangGraph. It will re-execute them on every replay. The outbox pattern exists precisely to retry on failure — so replays are not hypothetical, they are a designed-in behaviour.

### Concrete Failures This Causes

| Risk | What happens | User impact |
|------|-------------|-------------|
| #1 (Critical) | Outbox retries `graph.invoke()`, `handleInterruptSideEffects` creates a second ASSISTANT message with a fresh `nanoidAlphanumeric()` key | Duplicate questions in conversation |
| #3 (Critical) | ASSISTANT message created, then `transitionStatus(RUNNING → AWAITING_INPUT)` fails | User sees the question but can't answer it — permanently stuck |
| #6 (High) | Save node catches DB error, returns `{ error }` in state. Graph "completes" normally | Run marked COMPLETED with empty artefact |
| #8 (High) | `handleInterruptSideEffects` returns null on message creation failure | Run marked COMPLETED while graph is paused at interrupt |
| #10 (High) | Save node transaction commits, then checkpoint write fails. Replay re-executes save | Duplicate PDP goals |

### Root Cause

The comment at `portfolio-graph.service.ts:238-239` captures the assumption:

```ts
// This runs once per startGraph()/resumeGraph() call — outside the graph's
// replay cycle — so there is no idempotency concern.
```

This is only true if `startGraph()`/`resumeGraph()` is **never retried**. But the outbox pattern exists precisely to retry on failure. The comment's assumption is violated by the system's own retry mechanism.

---

## Architecture Decisions

### Single Instance (MVP)

The server runs as a single instance. We are not horizontally scaling at this stage. This means:

- **Stale lock concurrent execution** (Risk #2) is reduced — `isProcessing = true` blocks the next poll cycle, so two handlers can't run simultaneously. But the lock can still expire while a handler awaits an LLM call, causing the same job to be re-queued for the next batch.
- **Concurrent HTTP requests** are still possible — JavaScript is single-threaded but async. Two requests can interleave at every `await`. Race conditions at `findActiveRun()` are real but less likely.
- **Fencing tokens and heartbeat mechanisms** are deferred — a static lock increase (5min → 15min) is sufficient.
- **Partial unique index on active runs** is deferred — app-level guard catches most cases.

The core side-effect issues (duplicate messages, stuck conversations, swallowed errors, duplicate PDP goals) are **not concurrency problems** — they are retry and failure-handling problems that happen on a single process.

### Save Node: Validation Only (Option B)

The save node is converted to a validation-only gate rather than removed entirely. The graph topology stays the same (`generate_pdp → save → END`), but the save node validates required fields without performing DB writes. This preserves a natural extension point for future features.

### Thread ID Per Run (Option A for Restart After FAILED)

Each AnalysisRun gets its own LangGraph thread namespace: `${conversationId}:${runNumber}`. This allows restarting after a FAILED run without stale checkpoints blocking the new run. The `langGraphThreadId` field already exists on the AnalysisRun schema.

---

## Industry Patterns Applied

### 1. Fail-Stop Over Silent Degradation (Erlang/OTP "Let It Crash")

When a side effect fails, the system should fail loudly (throw) rather than return a degraded result. A thrown error can be caught, retried, and eventually surfaced. A silently degraded result propagates through the system and corrupts downstream state.

**Applied in:** Phase 1 — save node throws instead of returning `{ error }`, `handleInterruptSideEffects` throws instead of returning null, handlers exit early for terminal runs.

### 2. Deterministic Idempotency Keys (Temporal's Activity ID Model)

An idempotency key must be derivable from the state that caused the side effect — not generated randomly. If the same state produces the same key, duplicate writes are naturally prevented.

**Applied in:** Phase 2 — idempotency keys derived from `${conversationId}:${pausedNode}:${checkpointId}`. The message collection itself serves as the side effect journal (check-before-create returns cached result on retry).

### 3. Transactional Outbox for Outputs (Atomically Coupling Related Writes)

If two writes must be consistent (either both happen or neither does), they must be in the same transaction.

**Applied in:** Phase 3 — message creation and `transitionStatus(RUNNING → AWAITING_INPUT)` wrapped in a single MongoDB transaction. Artefact save + PDP goals + `transitionStatus(RUNNING → COMPLETED)` wrapped in a single transaction (Phase 4).

### 4. Separation of Decision from Execution (Temporal's Workflow/Activity Model)

Workflow code (the graph) decides WHAT to do. Infrastructure (the handler) handles HOW and WHEN to execute side effects, with retry and idempotency guarantees. Nodes should be pure state transformers.

**Applied in:** Phase 4 — save node becomes validation-only. All DB writes move to the handler, where they're wrapped in transactions with status transitions.

### 5. Idempotent Receivers (AWS Lambda / SQS Pattern)

If you can't prevent a side effect from being re-executed, make it safe to re-execute. Every write should be an upsert or create-if-not-exists.

**Applied in:** Phase 2 (PDP goals: delete-then-create inside transaction), Phase 4 (same pattern in handler).

---

## Implementation Phases

### Phase 1: Fail-Stop and Guard Rails

**Goal:** Make failures visible to the retry mechanism instead of silently degrading.

**Estimated scope:** Small — localised changes, no architectural shifts.

#### 1a. Save node throws instead of returning error state

**File:** `apps/api/src/portfolio-graph/nodes/save.node.ts`

**Current (lines 60-63):**
```ts
catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  logger.error(`Failed to save artefact ${state.artefactId}: ${message}`);
  return { error: `Failed to save artefact: ${message}` };
}
```

**Change:** Remove the try/catch. Let errors propagate through `graph.invoke()` to the handler's catch block, which transitions to FAILED and re-throws for outbox retry.

**Why:** The save node currently swallows errors and returns them as graph state. LangGraph sees a successful node completion, checkpoints the state, and the graph ends. The handler marks the run COMPLETED. But the artefact was never updated — it's still in DRAFT with no reflection, no capabilities, no title. The user believes their entry is complete.

#### 1b. `handleInterruptSideEffects` throws instead of returning null

**File:** `apps/api/src/portfolio-graph/portfolio-graph.service.ts`

**Lines affected:** 293-295, 335-337, 378-380 (one per interrupt type: classification, followup, capabilities)

**Current:**
```ts
if (!result.ok) {
  this.logger.error(`Failed to send classification options: ${result.error.message}`);
  return null;
}
```

**Change:** Replace `return null` with `throw new Error(...)` in all three branches.

**Why:** The handler interprets `null` from `handleInterruptSideEffectsIfPaused()` as "graph completed" and marks the run COMPLETED. But the graph is actually paused at an interrupt with no question message created. The conversation is silently stuck — the run says COMPLETED but the artefact was never finished.

#### 1c. Handler early-exit when run is already terminal

**Files:** `apps/api/src/outbox/handlers/analysis-start.handler.ts`, `apps/api/src/outbox/handlers/analysis-resume.handler.ts`

**Change:** At the top of each `handle()` method, before the status transition, check the current run status. If FAILED or COMPLETED, log and return without throwing.

```ts
const run = await this.analysisRunsService.findRunById(runId);
if (!run) return;
if (run.status === AnalysisRunStatus.FAILED ||
    run.status === AnalysisRunStatus.COMPLETED) {
  this.logger.log(`Run ${data.analysisRunId} already ${run.status}, skipping`);
  return;
}
```

**Why:** When a handler fails and transitions the run to FAILED, it re-throws so the outbox schedules a retry. On retry, `transitionStatus(PENDING → RUNNING)` fails because status is FAILED. The handler throws again. This repeats for all 3 retry attempts — wasting compute and potentially OpenAI credits. The early-exit makes the handler idempotent: if the work is done (or permanently failed), acknowledge it and move on.

#### 1d. Hard assertion on follow-up round

**File:** `apps/api/src/portfolio-graph/nodes/ask-followup.node.ts`

**Change:** Add at the top of the node function:

```ts
if (state.followUpRound >= MAX_FOLLOWUP_ROUNDS) {
  throw new Error(
    `Follow-up round ${state.followUpRound} exceeds maximum ${MAX_FOLLOWUP_ROUNDS}`
  );
}
```

**Also:** Export `MAX_FOLLOWUP_ROUNDS` from `portfolio-graph.builder.ts` so both the router and this assertion use the same constant.

**Why:** The follow-up loop counter lives in graph state. The `completenessRouter` (line 36 of builder) is the primary guard, but if it has a bug (off-by-one, missing increment), the loop continues unbounded. This assertion is defence-in-depth: a circuit breaker that caps the blast radius of a router bug. Without it, an infinite loop of LLM calls could run up OpenAI costs.

**Note:** `followUpRound` starts at 0 and is incremented to 1 on the first `ask_followup` call. `MAX_FOLLOWUP_ROUNDS = 2`, so the router checks `followUpRound < 2`. The assertion checks `followUpRound >= 2` — these are consistent.

#### Phase 1 Tests

| Test | File | Assertion |
|------|------|-----------|
| Save node error propagation | save.node.spec.ts | When transaction throws, error propagates (no `{ error }` in state) |
| Interrupt message failure | portfolio-graph.service.spec.ts | When `createMessage` returns `!ok`, method throws |
| Start handler — run already FAILED | analysis-start.handler.spec.ts | Handler returns without throwing or invoking graph |
| Start handler — run already COMPLETED | analysis-start.handler.spec.ts | Handler returns without throwing or invoking graph |
| Resume handler — run already terminal | analysis-resume.handler.spec.ts | Handler returns without throwing |
| Follow-up round assertion | ask-followup.node.spec.ts | Throws when `followUpRound >= MAX_FOLLOWUP_ROUNDS` |

---

### Phase 2: Deterministic Idempotency

**Goal:** Make retry of `handleInterruptSideEffects` safe by ensuring the same interrupt always produces the same idempotency key, and checking for existing messages before creating new ones.

**Estimated scope:** Small — changes to key generation and a new repo method.

#### 2a. Derive idempotency keys from checkpoint state

**File:** `apps/api/src/portfolio-graph/portfolio-graph.service.ts`

**Current (lines 290, 333, 375):**
```ts
idempotencyKey: nanoidAlphanumeric(),
```

**Change:** After reading the snapshot in `handleInterruptSideEffects` (line 245), extract the checkpoint ID and compute a deterministic key:

```ts
const checkpointId = snapshot?.config?.configurable?.checkpoint_id ?? 'unknown';
const pausedNodeName = snapshot.next?.[0] ?? 'unknown';
const idempotencyKey = `${state.conversationId}:${pausedNodeName}:${checkpointId}`;
```

Use this key for all three branches instead of `nanoidAlphanumeric()`.

**Why:** A random key defeats the purpose of idempotency on retry. The same interrupt at the same checkpoint should produce the same key — `conversationId:node:checkpointId` is unique per interrupt instance and stable across retries.

#### 2b. Check-before-create with idempotency key

**File:** `apps/api/src/portfolio-graph/portfolio-graph.service.ts`

**Change:** At the top of `handleInterruptSideEffects`, before the switch statement, check if a message with this key already exists:

```ts
const existingResult = await this.conversationsRepository.findMessageByIdempotencyKey(
  new Types.ObjectId(state.userId),
  idempotencyKey,
);
if (existingResult.ok && existingResult.value) {
  const existingQuestion = existingResult.value.question as { questionType: string };
  return {
    messageId: existingResult.value._id,
    questionType: existingQuestion.questionType as 'single_select' | 'multi_select' | 'free_text',
  };
}
```

**Why:** This is the side effect journal pattern using the message collection as the journal. On retry, the existing message is found and its ID returned — the handler proceeds with the correct `messageId` for the status transition. No duplicate message created. This is how Temporal handles activity retries: check the recorded result first, execute only if not found.

#### 2c. Add `deleteByArtefactId` to PDP Goals Repository

**File:** `apps/api/src/pdp-goals/pdp-goals.repository.interface.ts` — add to `IPdpGoalsRepository`:

```ts
deleteByArtefactId(
  artefactId: Types.ObjectId,
  session?: ClientSession,
): Promise<Result<number, DBError>>;
```

**File:** `apps/api/src/pdp-goals/pdp-goals.repository.ts` — implement:

```ts
async deleteByArtefactId(
  artefactId: Types.ObjectId,
  session?: ClientSession,
): Promise<Result<number, DBError>> {
  try {
    const result = await this.pdpGoalModel.deleteMany({ artefactId }, { session });
    return ok(result.deletedCount);
  } catch (error) {
    this.logger.error(`Failed to delete PDP goals for artefact ${artefactId}`, error);
    return err({ code: 'DB_ERROR', message: 'Failed to delete PDP goals' });
  }
}
```

#### 2d. Make PDP goal creation idempotent in save node

**File:** `apps/api/src/portfolio-graph/nodes/save.node.ts`

**Change:** Inside the transaction, add delete-before-create:

```ts
// Delete existing goals for idempotency on replay
const deleteResult = await deps.pdpGoalsRepository.deleteByArtefactId(artefactObjectId, session);
if (!deleteResult.ok) throw new Error(deleteResult.error.message);

// Create new goals
const pdpResult = await deps.pdpGoalsRepository.create(..., session);
```

**Note:** This is a temporary measure. Phase 4 moves the entire save outside the graph. But until Phase 4 is done, this makes the save node replay-safe.

**Why:** Without this, if LangGraph's checkpoint write fails after the save node's transaction commits, the retry replays the save node, which creates duplicate PDP goals. Delete-then-create within the same transaction is idempotent — running it N times produces the same result.

#### Phase 2 Tests

| Test | File | Assertion |
|------|------|-----------|
| Deterministic key format | portfolio-graph.service.spec.ts | Key matches `${conversationId}:${node}:${checkpointId}` |
| Check-before-create hit | portfolio-graph.service.spec.ts | When message exists, returns cached result without `createMessage` call |
| Check-before-create miss | portfolio-graph.service.spec.ts | When no message exists, creates new message with deterministic key |
| `deleteByArtefactId` | pdp-goals.repository.spec.ts | Deletes all goals for given artefact, returns count |
| Delete-then-create idempotency | save.node.spec.ts | Running save node twice produces exactly N goals (not 2N) |

---

### Phase 3: Transactional Atomicity

**Goal:** Ensure the ASSISTANT message and the `RUNNING → AWAITING_INPUT` status transition are in the same MongoDB transaction. If either fails, both roll back.

**Estimated scope:** Medium — refactors the boundary between `PortfolioGraphService` and the handlers.

#### 3a. Separate interrupt payload reading from message writing

**File:** `apps/api/src/portfolio-graph/portfolio-graph.service.ts`

**Change:** Split `handleInterruptSideEffects` into:

1. **`getInterruptPayload(threadId)`** — public method. Reads the checkpoint snapshot, extracts the interrupt value, computes the deterministic idempotency key and message content. Returns the data needed to create the message. **No DB writes.**

```ts
async getInterruptPayload(threadId: string): Promise<{
  idempotencyKey: string;
  pausedNode: InterruptNode;
  messageData: CreateMessageData;
  questionType: 'single_select' | 'multi_select' | 'free_text';
} | null>
```

2. Remove `handleInterruptSideEffectsIfPaused` and `handleInterruptSideEffects` — their responsibility moves to the handlers.

3. Update `startGraph` and `resumeGraph` to return just the paused node (or null), without performing side effects:

```ts
async startGraph(params): Promise<InterruptNode | null> {
  await this.graph.invoke(initialState, config);
  return this.getPausedNode(params.threadId);
}

async resumeGraph(threadId, node, ...args): Promise<InterruptNode | null> {
  await this.graph.invoke(new Command({ resume: resumeValue }), config);
  return this.getPausedNode(threadId);
}
```

**Why:** Currently, `startGraph` / `resumeGraph` both invoke the graph AND create the ASSISTANT message. By separating these, the handler gains control over when and how the message is created, enabling it to wrap the message creation + status transition in a single transaction.

#### 3b. Move message creation + status transition into handler transaction

**Files:** `apps/api/src/outbox/handlers/analysis-start.handler.ts`, `apps/api/src/outbox/handlers/analysis-resume.handler.ts`

**New dependencies for handlers:**
- `TransactionService` — for wrapping writes in a transaction
- `IConversationsRepository` (via `CONVERSATIONS_REPOSITORY` token) — for creating messages
- `PortfolioGraphService` — already injected

**New handler flow after `graph.invoke()` returns:**

```ts
const pausedNode = await this.portfolioGraphService.startGraph({ threadId, ... });

if (pausedNode) {
  const interruptPayload = await this.portfolioGraphService.getInterruptPayload(threadId);
  if (!interruptPayload) {
    throw new Error(`Graph paused at ${pausedNode} but no interrupt payload found`);
  }

  // Check-before-create (idempotency)
  const userOid = new Types.ObjectId(data.userId);
  const existing = await this.conversationsRepository.findMessageByIdempotencyKey(
    userOid, interruptPayload.idempotencyKey,
  );

  if (existing.ok && existing.value) {
    // Message already exists from a previous attempt — just transition status
    await this.analysisRunsService.transitionStatus(
      runId, AnalysisRunStatus.RUNNING, AnalysisRunStatus.AWAITING_INPUT,
      {
        currentQuestion: {
          messageId: existing.value._id,
          node: interruptPayload.pausedNode,
          questionType: interruptPayload.questionType,
        },
        currentStep: null,
      },
    );
  } else {
    // Atomic: create message + transition status in one transaction
    await this.transactionService.withTransaction(async (session) => {
      const msgResult = await this.conversationsRepository.createMessage(
        interruptPayload.messageData, session,
      );
      if (!msgResult.ok) throw new Error(msgResult.error.message);

      await this.analysisRunsService.transitionStatus(
        runId, AnalysisRunStatus.RUNNING, AnalysisRunStatus.AWAITING_INPUT,
        {
          currentQuestion: {
            messageId: msgResult.value._id,
            node: interruptPayload.pausedNode,
            questionType: interruptPayload.questionType,
          },
          currentStep: null,
        },
        session,
      );
    }, { context: 'interrupt-side-effects' });
  }
} else {
  // Graph completed (no interrupt)
  await this.analysisRunsService.transitionStatus(
    runId, AnalysisRunStatus.RUNNING, AnalysisRunStatus.COMPLETED,
    { currentStep: null },
  );
}
```

**Why:** Currently, the message write and the status transition are three separate non-atomic operations:

```
graph.invoke()                      → checkpoint (LangGraph boundary)
handleInterruptSideEffects()        → writes ASSISTANT message (op 1)
transitionStatus(RUNNING → AWAITING_INPUT)  → updates AnalysisRun (op 2)
```

If op 2 fails after op 1 succeeds: the question message exists but `currentQuestion` is never set. The mobile derives UI phase from `AnalysisRun`, not messages — it shows `phase: 'analysing'` and blocks input. The question is visible but unanswerable. Permanently stuck.

Wrapping both in a transaction makes them atomic: either both succeed or neither does.

#### 3c. Add transient error retry to `TransactionService`

**File:** `apps/api/src/database/transaction.service.ts`

**Change:** Wrap the existing logic in a retry loop (max 2 retries) for errors labelled `TransientTransactionError`:

```ts
async withTransaction<T>(
  fn: (session: ClientSession) => Promise<T>,
  options?: TransactionOptions,
): Promise<T> {
  const context = options?.context || 'unknown';
  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const session = await this.connection.startSession();
    try {
      session.startTransaction();
      this.logger.debug(`Transaction started: ${context}`);

      const result = await fn(session);

      await session.commitTransaction();
      this.logger.debug(`Transaction committed: ${context}`);
      return result;
    } catch (error) {
      await session.abortTransaction();

      const isTransient = error instanceof Error &&
        'hasErrorLabel' in error &&
        typeof (error as any).hasErrorLabel === 'function' &&
        (error as any).hasErrorLabel('TransientTransactionError');

      if (isTransient && attempt < MAX_RETRIES) {
        this.logger.warn(
          `Transient transaction error (${context}), retry ${attempt + 1}/${MAX_RETRIES}`
        );
        continue;
      }

      this.logger.error(`Transaction aborted: ${context}`, error);
      throw error;
    } finally {
      session.endSession();
    }
  }

  throw new Error(`Transaction failed after ${MAX_RETRIES} retries: ${context}`);
}
```

**Why:** MongoDB recommends retrying transactions that fail with `TransientTransactionError` (e.g., during replica set elections). The current implementation aborts and re-throws immediately, surfacing transient Mongo failures as 500 errors. Adding 1-2 retries handles the most common transient failure without user-visible impact.

#### Phase 3 Tests

| Test | File | Assertion |
|------|------|-----------|
| `getInterruptPayload` returns data without DB writes | portfolio-graph.service.spec.ts | No `createMessage` calls; returns correct structure |
| Handler: message + status in one transaction | analysis-start.handler.spec.ts | Both ops receive same session; on abort, neither persists |
| Handler: existing message reuse (idempotency) | analysis-start.handler.spec.ts | When message exists, `createMessage` not called; status still transitions |
| TransactionService: retries on transient error | transaction.service.spec.ts | Retries up to 2 times; succeeds on second attempt |
| TransactionService: throws on non-transient error | transaction.service.spec.ts | Non-transient errors throw immediately, no retry |

---

### Phase 4: Move Save Outside the Graph

**Goal:** Make the graph a pure computation pipeline. All DB writes happen in the handler, where we control the transactional boundary.

**Estimated scope:** Medium — changes graph topology semantics, handler responsibilities, and thread ID resolution.

#### 4a. Convert save node to validation-only

**File:** `apps/api/src/portfolio-graph/nodes/save.node.ts`

**Change:** Remove all DB writes. Keep as a validation gate that asserts all required fields are present:

```ts
export function createSaveNode(deps: GraphDeps) {
  const logger = new Logger('SaveNode');

  return async (state: PortfolioStateType): Promise<Partial<PortfolioStateType>> => {
    deps.eventEmitter.emit(ANALYSIS_STEP_STARTED, {
      conversationId: state.conversationId,
      step: 'save',
    });

    if (!state.entryType) throw new Error('Cannot save: entryType is not set');
    if (!state.title) throw new Error('Cannot save: title is not set');
    if (!state.reflection) throw new Error('Cannot save: reflection is not set');
    if (state.capabilities.length === 0) throw new Error('Cannot save: no capabilities');

    logger.log(`Validation passed for artefact ${state.artefactId}`);
    return {};
  };
}
```

**Graph topology stays the same:** `generate_pdp → save → END`. The save node is now a pre-completion validation step.

**Why:** The save node currently runs inside a LangGraph node but performs MongoDB writes that are independent of the checkpoint. If the checkpoint write fails after the save transaction commits, replay re-executes the writes. Moving writes out eliminates this entire category of bugs. Keeping the node as a validation gate preserves the extension point and catches bugs in upstream nodes (e.g., `reflect` failing to produce a title).

#### 4b. Add `getFinalState` to `PortfolioGraphService`

**File:** `apps/api/src/portfolio-graph/portfolio-graph.service.ts`

```ts
async getFinalState(threadId: string): Promise<PortfolioStateType> {
  const config = { configurable: { thread_id: threadId } };
  const snapshot = await this.graph.getState(config);
  if (!snapshot?.values?.conversationId) {
    throw new Error(`No graph state found for thread ${threadId}`);
  }
  return snapshot.values as PortfolioStateType;
}
```

This reads the completed graph's state from the checkpoint. Pure read, no side effects, safe to call any number of times.

#### 4c. Handler performs save after graph completion

**Files:** `apps/api/src/outbox/handlers/analysis-start.handler.ts`, `apps/api/src/outbox/handlers/analysis-resume.handler.ts`

**New dependencies:**
- `IArtefactsRepository` (via `ARTEFACTS_REPOSITORY` token)
- `IPdpGoalsRepository` (via `PDP_GOALS_REPOSITORY` token)

**When graph completes (no paused node):**

```ts
const finalState = await this.portfolioGraphService.getFinalState(threadId);

await this.transactionService.withTransaction(async (session) => {
  const artefactOid = new Types.ObjectId(finalState.artefactId);

  // Artefact update (idempotent — overwrites same doc)
  const artefactResult = await this.artefactsRepository.updateArtefactById(
    artefactOid,
    {
      artefactType: finalState.entryType,
      title: finalState.title,
      reflection: finalState.reflection,
      capabilities: finalState.capabilities.map(c => ({
        code: c.code,
        evidence: c.reasoning,
      })),
      status: ArtefactStatus.IN_REVIEW,
    },
    session,
  );
  if (!artefactResult.ok) throw new Error(artefactResult.error.message);

  // Delete-then-create for PDP goals (idempotent)
  const deleteResult = await this.pdpGoalsRepository.deleteByArtefactId(artefactOid, session);
  if (!deleteResult.ok) throw new Error(deleteResult.error.message);

  if (finalState.pdpGoals.length > 0) {
    const userOid = new Types.ObjectId(finalState.userId);
    const pdpResult = await this.pdpGoalsRepository.create(
      finalState.pdpGoals.map(g => ({
        userId: userOid,
        artefactId: artefactOid,
        goal: g.goal,
        actions: g.actions.map(a => ({
          action: a.action,
          intendedEvidence: a.intendedEvidence,
        })),
      })),
      session,
    );
    if (!pdpResult.ok) throw new Error(pdpResult.error.message);
  }

  // Status transition in same transaction
  await this.analysisRunsService.transitionStatus(
    runId, AnalysisRunStatus.RUNNING, AnalysisRunStatus.COMPLETED,
    { currentStep: null },
    session,
  );
}, { context: 'analysis-complete' });
```

**Why:** Three things this gives us:

1. **Atomicity**: Artefact save, PDP goals, and COMPLETED transition are in one transaction. No more "COMPLETED with empty artefact."
2. **Retry safety**: If the transaction fails, the handler throws, the outbox retries. On retry, `graph.invoke()` returns immediately (graph already completed, checkpoint exists), and only the write is retried. No duplicate LLM calls.
3. **Idempotency**: Delete-then-create within the transaction means any number of retries produces the same result.

#### 4d. Thread ID per run (Restart After FAILED)

**Goal:** Each AnalysisRun gets its own LangGraph thread namespace, allowing restart after FAILED without checkpoint collisions.

##### `AnalysisRunsService.createRun` — derive threadId internally

**File:** `apps/api/src/analysis-runs/analysis-runs.service.ts`

**Change:** Remove the `langGraphThreadId` parameter. Compute it from `conversationId + runNumber`:

```ts
async createRun(
  conversationId: Types.ObjectId,
  idempotencyKey: string,
  session?: ClientSession,
): Promise<{ run: AnalysisRun; created: boolean }> {
  // ... existing idempotency check ...
  const runNumber = maxResult.value + 1;
  const langGraphThreadId = `${conversationId.toString()}:${runNumber}`;

  const createResult = await this.repository.createRun(
    { conversationId, runNumber, idempotencyKey, langGraphThreadId },
    session,
  );
  // ...
}
```

##### `handleStart` — remove `hasCheckpoint` guard

**File:** `apps/api/src/conversations/conversations.service.ts`

**Current (lines 279-283):**
```ts
const hasCheckpoint = await this.portfolioGraphService.hasCheckpoint(convIdStr);
if (hasCheckpoint) {
  throw new ConflictException('Analysis already started.');
}
```

**Change:** Remove these lines. The `findActiveRun` check (lines 292-295) already prevents duplicate active runs. Each run gets its own thread namespace, so old checkpoints don't block new runs.

Also remove `langGraphThreadId` from the `createRun` call since it's now derived internally.

##### Update outbox payloads to include `langGraphThreadId`

**File:** `apps/api/src/conversations/conversations.service.ts`

`handleStart` outbox payload:
```ts
payload: {
  analysisRunId: run._id.toString(),
  conversationId: convIdStr,
  artefactId: conversation.artefact.toString(),
  userId,
  specialty: Specialty.GP.toString(),
  langGraphThreadId: run.langGraphThreadId,  // NEW
},
```

`handleResume` outbox payload:
```ts
payload: {
  analysisRunId: activeRun._id.toString(),
  conversationId: convIdStr,
  node,
  resumeValue,
  langGraphThreadId: activeRun.langGraphThreadId,  // NEW
},
```

##### Update handler payload types

**File:** `apps/api/src/outbox/handlers/analysis-start.handler.ts`

```ts
export interface AnalysisStartPayload {
  analysisRunId: string;
  conversationId: string;
  artefactId: string;
  userId: string;
  specialty: string;
  langGraphThreadId: string;  // NEW
}
```

**File:** `apps/api/src/outbox/handlers/analysis-resume.handler.ts`

```ts
export interface AnalysisResumePayload {
  analysisRunId: string;
  conversationId: string;
  node: InterruptNode;
  resumeValue?: Record<string, unknown> | true;
  langGraphThreadId: string;  // NEW
}
```

Handlers use `data.langGraphThreadId` for all graph operations instead of `data.conversationId`.

##### Update `PortfolioGraphService` method signatures

**File:** `apps/api/src/portfolio-graph/portfolio-graph.service.ts`

All methods change from using `conversationId` as thread_id to accepting an explicit `threadId` parameter:

- `startGraph(params)` — `params` includes `threadId`
- `resumeGraph(threadId, node, ...args)`
- `getPausedNode(threadId)`
- `hasCheckpoint(threadId)` — kept for potential future use, signature updated
- `getInterruptPayload(threadId)` — new from Phase 3
- `getFinalState(threadId)` — new from Phase 4b

The `graph.invoke()` config changes from `{ thread_id: conversationId }` to `{ thread_id: threadId }`.

##### Update `handleResume` in `ConversationsService`

**File:** `apps/api/src/conversations/conversations.service.ts`

```ts
// Before (line 359):
const pausedNode = await this.portfolioGraphService.getPausedNode(convIdStr);

// After:
const pausedNode = await this.portfolioGraphService.getPausedNode(
  activeRun.langGraphThreadId,
);
```

#### Phase 4 Tests

| Test | File | Assertion |
|------|------|-----------|
| Save node — validation passes | save.node.spec.ts | Returns `{}` when all fields present, no DB calls |
| Save node — missing entryType | save.node.spec.ts | Throws with descriptive error |
| Save node — missing title | save.node.spec.ts | Throws with descriptive error |
| Save node — missing reflection | save.node.spec.ts | Throws with descriptive error |
| Save node — no capabilities | save.node.spec.ts | Throws with descriptive error |
| `getFinalState` — returns state | portfolio-graph.service.spec.ts | Returns full state from checkpoint |
| `getFinalState` — no state | portfolio-graph.service.spec.ts | Throws when no checkpoint exists |
| Handler completion — all writes atomic | analysis-start.handler.spec.ts | Artefact, PDP goals, status in one transaction |
| Handler completion — idempotent retry | analysis-start.handler.spec.ts | Delete-then-create produces same result |
| Thread ID derivation | analysis-runs.service.spec.ts | `langGraphThreadId` = `${conversationId}:${runNumber}` |
| Start after FAILED — allowed | conversations.service.spec.ts | New run created with new threadId |
| Start after FAILED — isolated checkpoint | conversations.service.spec.ts | New run doesn't see old checkpoint |
| `createRun` — no threadId parameter | analysis-runs.service.spec.ts | ThreadId derived internally |

---

### Phase 5: Outbox Hardening

**Goal:** Fix the `markFailed` race condition and increase lock duration.

**Estimated scope:** Small.

#### 5a. Atomic `markFailed`

**File:** `apps/api/src/outbox/outbox.repository.ts`

**Current (lines 101-139):** Two-step read-then-write. `findById` to get `attempts`, then `findOneAndUpdate` with computed values. Race window between read and write where `resetStaleLocks` can intervene.

**Change:** Single atomic `findOneAndUpdate` with an aggregation pipeline update:

```ts
async markFailed(
  entryId: Types.ObjectId,
  error: string,
): Promise<Result<OutboxEntry | null, DBError>> {
  try {
    const entry = await this.outboxModel.findOneAndUpdate(
      { _id: entryId, status: OutboxStatus.PROCESSING },
      [
        {
          $set: {
            attempts: { $add: ['$attempts', 1] },
            lastError: error,
            lockedUntil: null,
            status: {
              $cond: {
                if: { $gte: [{ $add: ['$attempts', 1] }, '$maxAttempts'] },
                then: OutboxStatus.FAILED,
                else: OutboxStatus.PENDING,
              },
            },
            processAfter: {
              $cond: {
                if: { $gte: [{ $add: ['$attempts', 1] }, '$maxAttempts'] },
                then: '$processAfter',
                else: {
                  $add: [
                    '$$NOW',
                    { $multiply: [{ $pow: [2, { $add: ['$attempts', 1] }] }, 1000] },
                  ],
                },
              },
            },
          },
        },
      ],
      { new: true },
    ).lean();
    return ok(entry);
  } catch (err_) {
    this.logger.error('Failed to mark outbox entry as failed', err_);
    return err({ code: 'DB_ERROR', message: 'Failed to mark outbox entry as failed' });
  }
}
```

**Why:** The read-then-write pattern has a race window. If `resetStaleLocks` runs between the `findById` and `findOneAndUpdate`, the update filter `{ status: PROCESSING }` misses (entry is now PENDING), the attempt increment is lost, and the job retries indefinitely. A single atomic operation with `$inc`-equivalent (`$add`) closes this window entirely.

#### 5b. Increase lock duration

**File:** `apps/api/src/outbox/outbox.service.ts`

```ts
// Before
const DEFAULT_LOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// After
const DEFAULT_LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes
```

**Why:** A full graph traversal through multiple LLM nodes can exceed 5 minutes under load. With a single instance and `isProcessing` blocking concurrent polls, the risk of concurrent execution is low, but a 15-minute lock provides adequate margin without the complexity of a heartbeat mechanism.

#### Phase 5 Tests

| Test | File | Assertion |
|------|------|-----------|
| `markFailed` — increments attempts atomically | outbox.repository.spec.ts | `attempts` increases by exactly 1 |
| `markFailed` — transitions to FAILED at max | outbox.repository.spec.ts | Status = FAILED when `attempts >= maxAttempts` |
| `markFailed` — reschedules with backoff | outbox.repository.spec.ts | Status = PENDING, `processAfter` set with exponential backoff |
| `markFailed` — no entry found | outbox.repository.spec.ts | Returns `ok(null)` when entry not in PROCESSING |

---

## Files Changed Summary

| Phase | Files Modified | New Files |
|-------|---------------|-----------|
| 1 | save.node.ts, portfolio-graph.service.ts, analysis-start.handler.ts, analysis-resume.handler.ts, ask-followup.node.ts, portfolio-graph.builder.ts | Test files |
| 2 | portfolio-graph.service.ts, pdp-goals.repository.interface.ts, pdp-goals.repository.ts, save.node.ts | Test files |
| 3 | portfolio-graph.service.ts, analysis-start.handler.ts, analysis-resume.handler.ts, transaction.service.ts | Test files |
| 4 | save.node.ts, portfolio-graph.service.ts, analysis-runs.service.ts, conversations.service.ts, analysis-start.handler.ts, analysis-resume.handler.ts | Test files |
| 5 | outbox.repository.ts, outbox.service.ts | Test files |

---

## Post-Implementation Verification

After all phases are complete, verify these invariants hold:

1. **No random idempotency keys for ASSISTANT messages** — all keys derived from `conversationId:node:checkpointId`
2. **No DB writes inside graph nodes** — save node is validation-only
3. **Every status transition is atomic with its dependent write** — message + AWAITING_INPUT in one txn, artefact + goals + COMPLETED in one txn
4. **Every side effect is safe to retry** — idempotent writes (upsert/delete-then-create) or check-before-create
5. **No silent error swallowing** — all error paths throw, never return null/error-state
6. **Each run has its own checkpoint namespace** — `langGraphThreadId = conversationId:runNumber`
7. **`markFailed` is atomic** — single `findOneAndUpdate` with `$inc`-equivalent
