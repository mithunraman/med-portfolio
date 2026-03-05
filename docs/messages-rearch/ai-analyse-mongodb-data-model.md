# AI Analyse — MongoDB Data Model & Workflow Design

> **Version:** 1.0 · **Status:** Proposal · **Last updated:** 2026-03-05

---

## 1. Collections & Example Documents

The schema is decomposed into **five primary collections** and **one LangGraph-managed collection**. The guiding principle is **separation of hot-path chat data from analytical/checkpoint data** so that reads on the conversation timeline never compete with heavy analysis writes.

### 1.1 `conversations`

The root entity. Lightweight header — no embedded message array.

**Rationale:** Keeping messages out of the conversation document avoids the 16 MB BSON limit and eliminates write-contention on a single document as messages stream in.

```json
{
  "_id": "conv_01J7Xk9pQ3",
  "orgId": "org_abc",
  "userId": "usr_42f",
  "title": "Benefits eligibility check",
  "status": "active",            // active | analysing | closed
  "messageCount": 34,
  "createdAt": "2026-03-05T10:00:00Z",
  "updatedAt": "2026-03-05T10:47:12Z",
  "closedAt": null,
  "metadata": {
    "channel": "web",
    "locale": "en-GB",
    "tags": ["benefits", "onboarding"]
  },
  "ttlExpiresAt": null           // set on close for retention policy
}
```

### 1.2 `messages`

One document per user or AI message. Referenced by `conversationId`. Ordered by a monotonic `seq` counter (not by `_id` or wall-clock) to guarantee ordering under concurrent writes.

**Rationale:** A separate collection allows efficient range queries (`seq` ranges), append-only inserts, and independent sharding by `conversationId`.

```json
{
  "_id": "msg_8fZnW1",
  "conversationId": "conv_01J7Xk9pQ3",
  "seq": 12,
  "role": "user",               // user | assistant | system
  "content": "I'm on a fixed-term contract.",
  "contentType": "text",        // text | single_select_response | multi_select_response
  "analysisRunId": null,        // non-null when message was part of an analysis Q&A loop
  "createdAt": "2026-03-05T10:12:44Z",
  "tokens": 14
}
```

A **question-prompt message** from the AI during analysis:

```json
{
  "_id": "msg_Qp3xY2",
  "conversationId": "conv_01J7Xk9pQ3",
  "seq": 13,
  "role": "assistant",
  "content": "What type of contract are you on?",
  "contentType": "text",
  "analysisRunId": "run_v9LkM3",
  "questionMeta": {
    "questionType": "single_select",   // single_select | multi_select | free_text
    "options": [
      {"key": "perm", "label": "Permanent"},
      {"key": "fixed", "label": "Fixed-term"},
      {"key": "casual", "label": "Casual / Zero-hours"}
    ],
    "required": true
  },
  "createdAt": "2026-03-05T10:12:50Z",
  "tokens": 38
}
```

### 1.3 `analysis_runs`

One document per "AI Analyse" invocation. This is the **unit of work** for the analysis pipeline — it tracks status, the snapshot of input, and the final artefact.

**Rationale:** Separating runs from the conversation allows multiple analysis attempts (retries, re-analyses after new info) without mutating the conversation header, and enables per-run audit trails.

```json
{
  "_id": "run_v9LkM3",
  "conversationId": "conv_01J7Xk9pQ3",
  "userId": "usr_42f",
  "runNumber": 2,                      // auto-incremented per conversation
  "status": "awaiting_input",
  // pending | running | awaiting_input | completed | failed | cancelled
  "idempotencyKey": "idem_Xk9pQ3_1709636832",
  "triggerMessageSeq": 12,             // message seq at the moment of trigger
  "snapshotRange": { "fromSeq": 1, "toSeq": 12 },
  "currentQuestion": {
    "messageId": "msg_Qp3xY2",
    "questionType": "single_select",
    "answeredAt": null
  },
  "artefact": null,                    // populated on completion (see §1.4)
  "error": null,                       // { code, message, retryable }
  "langGraphThreadId": "lg_thr_run_v9LkM3",
  "createdAt": "2026-03-05T10:12:48Z",
  "updatedAt": "2026-03-05T10:12:50Z",
  "completedAt": null,
  "durationMs": null
}
```

**Status transitions** are covered in §3.

### 1.4 `artefacts`

The modeled output produced at the end of a successful analysis run.

**Rationale:** Stored separately so artefacts can be queried, versioned, and retained independently of the conversation lifecycle (e.g., a compliance team may need artefacts long after the chat is deleted).

```json
{
  "_id": "art_Wn4rP7",
  "conversationId": "conv_01J7Xk9pQ3",
  "analysisRunId": "run_v9LkM3",
  "version": 1,
  "type": "eligibility_summary",
  "payload": {
    "eligible": true,
    "score": 87,
    "factors": [
      {"name": "contractType", "value": "fixed", "weight": 0.3},
      {"name": "tenure", "value": "14mo", "weight": 0.25}
    ],
    "narrative": "Based on the information gathered …"
  },
  "createdAt": "2026-03-05T10:15:02Z"
}
```

### 1.5 `audit_events`

Append-only log for every state-changing action. Hot-path writes; cold-path reads (dashboards, investigations).

```json
{
  "_id": "evt_9cLmN1",
  "conversationId": "conv_01J7Xk9pQ3",
  "analysisRunId": "run_v9LkM3",
  "actor": "usr_42f",               // userId, "system", or "ai"
  "action": "analysis.triggered",
  // analysis.triggered | analysis.running | analysis.question_asked
  // analysis.answer_received | analysis.completed | analysis.failed
  // conversation.closed | message.created
  "detail": { "idempotencyKey": "idem_Xk9pQ3_1709636832" },
  "timestamp": "2026-03-05T10:12:48Z"
}
```

### 1.6 `langgraph_checkpoints` (LangGraph-managed)

LangGraph persists its own state via a **checkpoint saver**. We use the official `MongoDBSaver` (from `langgraph-checkpoint-mongodb`) so that graph state lives in the same cluster, benefiting from shared backups and transactions.

**Rationale:** Co-locating checkpoints with application data means a single restore recovers both business state and graph state. Using LangGraph's native MongoDB saver avoids a custom serialisation layer.

```json
{
  "_id": "chk_abc123",
  "thread_id": "lg_thr_run_v9LkM3",  // 1:1 with analysis_runs._id
  "checkpoint_id": "chk_step_4",
  "parent_checkpoint_id": "chk_step_3",
  "channel_values": {
    "messages": ["msg_8fZnW1", "msg_Qp3xY2"],
    "pending_question": { "type": "single_select", "answered": false },
    "analysis_state": "gathering_info"
  },
  "metadata": { "step": 4, "source": "loop" },
  "created_at": "2026-03-05T10:12:50Z"
}
```

> **Note:** The exact field names are governed by `langgraph-checkpoint-mongodb`'s schema; the above is representative.

---

## 2. Relationships & Referencing Strategy

```
conversations  1 ←——→ N  messages          (via messages.conversationId)
conversations  1 ←——→ N  analysis_runs     (via analysis_runs.conversationId)
analysis_runs  1 ←——→ 1  artefacts         (via artefacts.analysisRunId)
analysis_runs  1 ←——→ 1  langgraph thread  (via analysis_runs.langGraphThreadId)
analysis_runs  1 ←——→ N  messages          (via messages.analysisRunId — only Q&A messages)
*              * ←——→ N  audit_events      (via audit_events.conversationId + analysisRunId)
```

**Default strategy: References (foreign keys), not embedding.**

| Decision | Rationale |
|---|---|
| Messages are **not** embedded in conversations | Avoids 16 MB limit; allows independent pagination and sharding |
| Artefacts are **not** embedded in analysis_runs | Artefacts may be large structured payloads; separate collection enables independent access patterns and retention |
| `questionMeta` **is** embedded in the message | Always read together; never queried independently; small and bounded |
| `currentQuestion` **is** embedded in analysis_runs | Single active question at a time; read with every run status check; eliminates a join |

**Tradeoff note on embedding messages:** For products where conversations are guaranteed small (< 50 messages, < 100 KB total), embedding messages inside the conversation document simplifies reads. However, given the requirement for "large conversations" and high write volume, referencing is the correct default. If a future use-case needs sub-millisecond full-conversation reads, consider a read-optimised materialised view or cache.

---

## 3. State Machine & Transitions

### 3.1 Conversation State Machine

```
                 ┌─────────────────────┐
                 │       active        │
                 └──────┬──────────────┘
                        │ user clicks "AI Analyse"
                        ▼
                 ┌─────────────────────┐
           ┌────▶│     analysing       │◀───── (re-trigger after free-text)
           │     └──┬───────────┬──────┘
           │        │           │
           │  (question asked)  │ (complete / fail)
           │        ▼           ▼
           │  back to active  ┌─────────────────────┐
           │  (free-text      │       closed         │
           │   input mode)    └─────────────────────┘
           │        │
           └────────┘  user clicks "AI Analyse" to resume
```

Allowed transitions on `conversations.status`:

| From | To | Trigger |
|---|---|---|
| `active` | `analysing` | User clicks "AI Analyse" |
| `analysing` | `active` | AI asks a free-text question (user needs to chat freely) |
| `analysing` | `closed` | Artefact generated, conversation finalised |
| `active` | `analysing` | User clicks "AI Analyse" to resume after free-text input |

> Single-select and multi-select questions do **not** transition the conversation back to `active`; the run remains in `awaiting_input` and resumes automatically on answer.

### 3.2 Analysis Run State Machine

```
  pending ──▶ running ──▶ awaiting_input ──▶ running ──▶ completed
     │            │              │                           │
     │            ▼              │                           ▼
     │         failed ◀──────────┘                   (artefact created,
     │                                                conversation closed)
     ▼
  cancelled  (duplicate detected via idempotency)
```

| From | To | Trigger |
|---|---|---|
| `pending` | `running` | Worker picks up the job |
| `pending` | `cancelled` | Duplicate idempotencyKey detected |
| `running` | `awaiting_input` | Graph node decides more info is needed |
| `running` | `completed` | Graph produces artefact |
| `running` | `failed` | Unrecoverable error or timeout |
| `awaiting_input` | `running` | User answers select question **or** clicks "AI Analyse" after free-text |
| `awaiting_input` | `failed` | Timeout (configurable, e.g. 24 h) |

### 3.3 LangGraph Integration with State Transitions

The analysis run maps **1:1 to a LangGraph thread**. Each step in the graph corresponds to a node:

```
[start] → gather_context → decide_action ──→ ask_question ──→ (interrupt)
                                │                                  │
                                │                    (user answers; resume)
                                │                                  │
                                ▼                                  ▼
                          generate_artefact ◀──────────────────────┘
                                │
                                ▼
                            [end]
```

The `decide_action` node is the routing hub. It inspects accumulated context and either loops back through `ask_question` (with an interrupt/checkpoint) or proceeds to `generate_artefact`.

**Interrupt mechanism:**
- When the graph reaches `ask_question`, it **checkpoints** current state via `MongoDBSaver` and **returns control** to the application layer, which writes the question message and sets the run to `awaiting_input`.
- When the user answers (or clicks "AI Analyse" for free-text), the application **resumes** the graph from the checkpoint with the new user input injected into the channel state.

```python
# Pseudocode — LangGraph wiring
from langgraph.graph import StateGraph
from langgraph.checkpoint.mongodb import MongoDBSaver

checkpointer = MongoDBSaver(
    connection_string="mongodb+srv://...",
    db_name="ai_analyse",
    collection_name="langgraph_checkpoints"
)

graph = StateGraph(AnalysisState)
graph.add_node("gather_context", gather_context_node)
graph.add_node("decide_action", decide_action_node)
graph.add_node("ask_question", ask_question_node)
graph.add_node("generate_artefact", generate_artefact_node)

graph.add_edge("gather_context", "decide_action")
graph.add_conditional_edges("decide_action", route_fn, {
    "need_info": "ask_question",
    "ready": "generate_artefact"
})
graph.add_edge("ask_question", "decide_action")  # after resume
graph.set_entry_point("gather_context")
graph.set_finish_point("generate_artefact")

compiled = graph.compile(checkpointer=checkpointer, interrupt_before=["ask_question"])
```

---

## 4. Query Patterns & Indexing

### 4.1 Primary Query Patterns

| # | Query | Collection | Filter | Sort |
|---|---|---|---|---|
| Q1 | List user's conversations | conversations | `{ userId, status }` | `updatedAt DESC` |
| Q2 | Load conversation messages (paginated) | messages | `{ conversationId }` | `seq ASC` |
| Q3 | Load analysis-run Q&A messages | messages | `{ analysisRunId }` | `seq ASC` |
| Q4 | Get active run for conversation | analysis_runs | `{ conversationId, status }` | `createdAt DESC` |
| Q5 | Idempotency check | analysis_runs | `{ idempotencyKey }` | — |
| Q6 | Get artefact for a run | artefacts | `{ analysisRunId }` | — |
| Q7 | Audit trail for conversation | audit_events | `{ conversationId }` | `timestamp ASC` |

### 4.2 Recommended Indexes

```javascript
// conversations
db.conversations.createIndex({ userId: 1, status: 1, updatedAt: -1 })  // Q1
db.conversations.createIndex({ ttlExpiresAt: 1 },
  { expireAfterSeconds: 0, partialFilterExpression: { ttlExpiresAt: { $ne: null } } })

// messages
db.messages.createIndex({ conversationId: 1, seq: 1 }, { unique: true })  // Q2 (also enforces ordering uniqueness)
db.messages.createIndex({ analysisRunId: 1, seq: 1 },
  { partialFilterExpression: { analysisRunId: { $ne: null } } })          // Q3

// analysis_runs
db.analysis_runs.createIndex({ conversationId: 1, status: 1, createdAt: -1 })  // Q4
db.analysis_runs.createIndex({ idempotencyKey: 1 }, { unique: true })           // Q5 — idempotency

// artefacts
db.artefacts.createIndex({ analysisRunId: 1 }, { unique: true })  // Q6

// audit_events
db.audit_events.createIndex({ conversationId: 1, timestamp: 1 })  // Q7
db.audit_events.createIndex({ analysisRunId: 1, timestamp: 1 })

// langgraph_checkpoints — managed by MongoDBSaver; typically indexes on (thread_id, checkpoint_id)
```

### 4.3 Sharding Strategy (at scale)

| Collection | Shard Key | Rationale |
|---|---|---|
| messages | `{ conversationId: "hashed" }` | Co-locates all messages for a conversation on one shard; hashed distributes conversations evenly |
| conversations | `{ _id: "hashed" }` | Uniform distribution; lookups are always by `_id` or `userId` |
| audit_events | `{ conversationId: "hashed" }` | Co-locates with conversation for efficient audit queries |

---

## 5. Concurrency, Retries & Job Processing

### 5.1 Idempotent "AI Analyse" Trigger

Double-clicks and network retries are handled via an **idempotency key** composed of `conversationId + client-generated nonce` (or `conversationId + timestamp-bucket` for simpler clients).

```javascript
// Trigger endpoint pseudocode
async function triggerAnalysis(conversationId, idempotencyKey) {
  const existing = await db.analysis_runs.findOne({ idempotencyKey });
  if (existing) return existing;  // idempotent — return existing run

  // Optimistic insert; unique index on idempotencyKey catches races
  try {
    const run = await db.analysis_runs.insertOne({
      _id: generateId("run"),
      conversationId,
      idempotencyKey,
      status: "pending",
      // ...
    });
    await enqueueJob(run._id);
    return run;
  } catch (err) {
    if (err.code === 11000) {  // duplicate key
      return db.analysis_runs.findOne({ idempotencyKey });
    }
    throw err;
  }
}
```

### 5.2 Optimistic Locking on Run Status

Status transitions use **atomic `findOneAndUpdate` with a status precondition** to prevent race conditions:

```javascript
const result = await db.analysis_runs.findOneAndUpdate(
  { _id: runId, status: "running" },           // precondition
  { $set: { status: "awaiting_input", updatedAt: now() } },
  { returnDocument: "after" }
);
if (!result) throw new ConflictError("Run is no longer in 'running' state");
```

This pattern ensures that two concurrent workers cannot both transition the same run, and that a stale retry cannot overwrite a newer state.

### 5.3 Job Processing Architecture

```
  API Server                   Queue (e.g. BullMQ / SQS)          Worker
  ──────────                   ──────────────────────────          ──────
  POST /analyse  ──insertOne──▶  enqueue(runId)  ──────────▶  dequeue(runId)
                                                               │
                                                          load run + messages
                                                               │
                                                          invoke LangGraph
                                                               │
                                                          checkpoint saved
                                                               │
                                                          update run status
```

- **At-least-once delivery:** The worker is designed to be idempotent — if it picks up a run that's already `running` or `completed`, it skips or short-circuits.
- **Visibility timeout:** Jobs have a visibility timeout (e.g. 5 min). If a worker crashes mid-analysis, the message re-appears and another worker picks it up. LangGraph resumes from the last checkpoint.
- **Dead-letter queue:** After N retries (e.g. 3), failed jobs go to a DLQ for manual investigation.

### 5.4 Handling Free-Text Resume

When the user clicks "AI Analyse" after providing free-text answers, the system:

1. Collects all messages with `analysisRunId = currentRun AND seq > lastQuestion.seq`.
2. Resumes the LangGraph thread from the last checkpoint, injecting the new messages.
3. Transitions the run from `awaiting_input` → `running`.

This is the same idempotent trigger endpoint — if the run is already `running`, the call is a no-op.

---

## 6. Auditing & Traceability

### 6.1 Audit Event Strategy

Every state change produces an immutable `audit_events` document. Events are written **fire-and-forget to a secondary write concern** (`w: 1`) to avoid slowing the hot path, with a background process that verifies completeness.

Key auditable actions:

| Action | Actor | Detail captured |
|---|---|---|
| `message.created` | user / ai | messageId, seq, role |
| `analysis.triggered` | user | idempotencyKey, triggerMessageSeq |
| `analysis.running` | system | workerId, checkpoint_id |
| `analysis.question_asked` | ai | questionType, options, messageId |
| `analysis.answer_received` | user | messageId, selectedOptions |
| `analysis.completed` | system | artefactId, durationMs |
| `analysis.failed` | system | error code, retryable flag |
| `conversation.closed` | system | artefactId |

### 6.2 Prompt Traceability

Each LangGraph node execution logs the **prompt template version**, **model ID**, **token counts**, and **latency** into the checkpoint metadata. This allows reconstructing exactly what the AI "saw" at each decision point.

```json
// Inside langgraph checkpoint channel_values.trace
{
  "node": "decide_action",
  "model": "claude-sonnet-4-20250514",
  "promptTemplateVersion": "v2.3.1",
  "inputTokens": 2840,
  "outputTokens": 312,
  "latencyMs": 1420,
  "decision": "need_info",
  "reasoning": "User has not specified contract type."
}
```

### 6.3 Artefact Versioning

If re-analysis produces a new artefact for the same conversation, a new `artefacts` document is created (with an incremented `version`), preserving the full history. Old artefacts are never mutated.

---

## 7. Privacy, Security & Retention

### 7.1 Data Classification

| Field / Collection | Classification | Encryption |
|---|---|---|
| `messages.content` | **PII / Sensitive** | Encrypted at rest (MongoDB CSFLE or storage-level encryption); field-level encryption recommended for regulated deployments |
| `artefacts.payload` | **Sensitive** | Encrypted at rest |
| `conversations.userId` | **PII** | Pseudonymised where possible; encrypted at rest |
| `audit_events` | **Internal** | Encrypted at rest |
| `langgraph_checkpoints.channel_values` | **Sensitive** (contains conversation context) | Encrypted at rest |

### 7.2 Access Control

- **Application level:** All queries are scoped by `orgId` + `userId` via middleware. No cross-tenant queries are possible without explicit admin elevation.
- **Database level:** Use MongoDB roles to restrict direct access. Workers use a service account with write access only to `analysis_runs`, `artefacts`, `audit_events`, and `langgraph_checkpoints`.
- **API level:** Bearer token (JWT) with `userId` and `orgId` claims; validated on every request.

### 7.3 Retention & Right-to-Erasure

- **TTL-based expiry:** When a conversation is closed, `ttlExpiresAt` is set to `closedAt + retentionPeriod` (e.g. 90 days). A TTL index on `conversations` auto-deletes expired documents. Related messages, runs, and events are cleaned up by a **scheduled sweeper job** that queries for orphaned `conversationId` references.
- **Right-to-erasure (GDPR Art. 17):** A dedicated endpoint deletes all documents across all collections for a given `userId`. LangGraph checkpoints are deleted by `thread_id` (derived from `analysisRunId`). An audit event of type `data.erased` is the sole surviving record.
- **Artefact retention override:** Artefacts needed for regulatory compliance can have their `ttlExpiresAt` extended independently.

---

## 8. Operational Concerns

### 8.1 Monitoring & Alerting

| Metric | Source | Alert threshold |
|---|---|---|
| Analysis run duration (p99) | `analysis_runs.durationMs` | > 30 s |
| Runs stuck in `pending` | Query `{ status: "pending", createdAt: { $lt: 5min ago } }` | Count > 0 for > 5 min |
| Runs stuck in `awaiting_input` | Query `{ status: "awaiting_input", updatedAt: { $lt: 24h ago } }` | Auto-timeout + alert |
| Checkpoint write latency | LangGraph MongoDBSaver metrics | p99 > 500 ms |
| Dead-letter queue depth | Queue metrics | Depth > 0 |
| Message insert rate | MongoDB `opCounters` | Spike > 3× baseline |

### 8.2 Backup & Disaster Recovery

- **Oplog-based continuous backup** (MongoDB Atlas or `mongodump --oplog`) with point-in-time recovery.
- **Critical invariant:** A restore must include both application collections **and** `langgraph_checkpoints` at the same point in time. Since they share a replica set, this is automatic.
- **Cross-region replication** for HA; secondary reads can serve conversation history (eventual consistency is acceptable for chat history reads).

### 8.3 Performance Optimisation

- **Read-your-writes consistency:** After inserting a message, the API reads from the primary to immediately return the new message to the client. Subsequent list queries can use secondary reads.
- **Projection:** All list queries project only needed fields (e.g., message list excludes `tokens`; conversation list excludes `metadata`).
- **Connection pooling:** Use a shared `MongoClient` with `maxPoolSize` tuned to worker concurrency (typically 10–50 per process).

### 8.4 Schema Versioning

- Every document carries an implicit `schemaVersion` field (defaulting to `1`). Migration scripts bump the version and transform documents in batches. Application code handles multiple versions during rolling deployments.

### 8.5 Capacity Planning Estimates

| Collection | Write pattern | Growth estimate (10 K active users) |
|---|---|---|
| messages | Append-only, bursty | ~500 K docs/day |
| conversations | Low write (status updates) | ~10 K docs/day |
| analysis_runs | Medium write | ~30 K docs/day |
| audit_events | High write (1 per state change) | ~200 K docs/day |
| langgraph_checkpoints | Medium write (per graph step) | ~120 K docs/day |

---

## Appendix A: Entity-Relationship Diagram

```
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│  conversations   │       │     messages      │       │  analysis_runs   │
│──────────────────│1     N│──────────────────│       │──────────────────│
│ _id              │◀──────│ conversationId   │  N   1│ _id              │
│ userId           │       │ seq              │──────▶│ conversationId   │
│ status           │       │ role             │       │ status           │
│ messageCount     │       │ analysisRunId ───┼──────▶│ idempotencyKey   │
│ ...              │       │ questionMeta     │       │ langGraphThreadId│
└──────────────────┘       │ ...              │       │ currentQuestion  │
                           └──────────────────┘       └────────┬─────────┘
                                                               │ 1
                                                               │
                                                               ▼ 1
                                                      ┌──────────────────┐
                                                      │    artefacts     │
                                                      │──────────────────│
                                                      │ analysisRunId    │
                                                      │ version          │
                                                      │ payload          │
                                                      └──────────────────┘

  ┌──────────────────┐       ┌────────────────────────┐
  │   audit_events   │       │ langgraph_checkpoints   │
  │──────────────────│       │────────────────────────│
  │ conversationId   │       │ thread_id ◀── run.     │
  │ analysisRunId    │       │   langGraphThreadId     │
  │ action           │       │ channel_values          │
  │ timestamp        │       │ metadata                │
  └──────────────────┘       └────────────────────────┘
```

---

## Appendix B: LangGraph Checkpoint Lifecycle

```
1. User clicks "AI Analyse"
   └─▶ Create analysis_run (status: pending)
   └─▶ Enqueue job

2. Worker picks up job
   └─▶ Update run (status: running)
   └─▶ Invoke LangGraph compiled.invoke(state, config={"configurable": {"thread_id": threadId}})

3. Graph reaches ask_question node (interrupt_before)
   └─▶ MongoDBSaver writes checkpoint
   └─▶ Worker reads interrupted state, extracts question
   └─▶ Writes question message to messages collection
   └─▶ Updates run (status: awaiting_input, currentQuestion: {...})

4a. User answers single/multi select
   └─▶ API writes answer message (analysisRunId set)
   └─▶ API resumes graph: compiled.invoke(None, config={"configurable": {"thread_id": threadId}})
   └─▶ Graph continues from checkpoint

4b. User provides free-text, then clicks "AI Analyse"
   └─▶ Trigger endpoint (idempotent — same run)
   └─▶ Collect free-text messages since question
   └─▶ Resume graph with new messages injected

5. Graph reaches generate_artefact
   └─▶ Produces structured output
   └─▶ Worker writes artefact document
   └─▶ Updates run (status: completed)
   └─▶ Updates conversation (status: closed)
```
