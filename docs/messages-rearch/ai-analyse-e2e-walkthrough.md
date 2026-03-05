# AI Analyse — End-to-End Conversation Walkthrough

> This document traces a **complete conversation** between a user and an AI bot through the AI Analyse system, showing every API call, database operation, state transition, and LangGraph checkpoint along the way.

---

## Scenario: Employee Benefits Eligibility Check

**User:** Sarah (usr_42f) from Acme Corp (org_abc) wants to check if she's eligible for extended parental leave benefits.

---

## Phase 1: Conversation Start

### Step 1.1 — User opens a new conversation

```
POST /api/v1/conversations
Authorization: Bearer <jwt: { userId: "usr_42f", orgId: "org_abc" }>
```

```json
{
  "title": "Benefits eligibility enquiry"
}
```

**Database: INSERT into `conversations`**

```json
{
  "_id": "conv_01J7Xk9pQ3",
  "orgId": "org_abc",
  "userId": "usr_42f",
  "title": "Benefits eligibility enquiry",
  "status": "active",
  "messageCount": 0,
  "createdAt": "2026-03-05T10:00:00.000Z",
  "updatedAt": "2026-03-05T10:00:00.000Z",
  "closedAt": null,
  "metadata": { "channel": "web", "locale": "en-GB", "tags": [] },
  "ttlExpiresAt": null
}
```

**Database: INSERT into `audit_events`**

```json
{
  "_id": "evt_000001",
  "conversationId": "conv_01J7Xk9pQ3",
  "analysisRunId": null,
  "actor": "usr_42f",
  "action": "conversation.created",
  "detail": { "title": "Benefits eligibility enquiry" },
  "timestamp": "2026-03-05T10:00:00.000Z"
}
```

**API Response: `201 Created`**

```json
{
  "id": "conv_01J7Xk9pQ3",
  "status": "active",
  "createdAt": "2026-03-05T10:00:00.000Z"
}
```

---

### Step 1.2 — User sends first message

```
POST /api/v1/conversations/conv_01J7Xk9pQ3/messages
Authorization: Bearer <jwt>
```

```json
{
  "content": "Hi, I'd like to find out if I'm eligible for extended parental leave."
}
```

**Server-side logic:**

```javascript
// 1. Acquire next seq number atomically
const conv = await db.conversations.findOneAndUpdate(
  { _id: "conv_01J7Xk9pQ3" },
  { $inc: { messageCount: 1 }, $set: { updatedAt: now() } },
  { returnDocument: "after" }
);
const seq = conv.messageCount; // 1
```

**Database: INSERT into `messages`**

```json
{
  "_id": "msg_001",
  "conversationId": "conv_01J7Xk9pQ3",
  "seq": 1,
  "role": "user",
  "content": "Hi, I'd like to find out if I'm eligible for extended parental leave.",
  "contentType": "text",
  "analysisRunId": null,
  "createdAt": "2026-03-05T10:00:12.000Z",
  "tokens": 18
}
```

**Database: INSERT into `audit_events`**

```json
{
  "_id": "evt_000002",
  "conversationId": "conv_01J7Xk9pQ3",
  "analysisRunId": null,
  "actor": "usr_42f",
  "action": "message.created",
  "detail": { "messageId": "msg_001", "seq": 1, "role": "user" },
  "timestamp": "2026-03-05T10:00:12.000Z"
}
```

**API Response: `201 Created`**

---

### Step 1.3 — AI bot responds (standard chat, no analysis)

The chat bot generates a reply via a lightweight inference call (separate from the analysis pipeline).

**Database: INSERT into `messages`**

```json
{
  "_id": "msg_002",
  "conversationId": "conv_01J7Xk9pQ3",
  "seq": 2,
  "role": "assistant",
  "content": "Hello Sarah! I'd be happy to help you check your eligibility for extended parental leave. I can run a detailed analysis once you've shared some initial context. Could you tell me a bit about your situation — for example, how long you've been with the company and your current role?",
  "contentType": "text",
  "analysisRunId": null,
  "createdAt": "2026-03-05T10:00:14.500Z",
  "tokens": 52
}
```

**conversations.messageCount** is now `2`.

---

### Step 1.4 — User provides more context (multiple messages)

```
POST /api/v1/conversations/conv_01J7Xk9pQ3/messages
```

```json
{ "content": "I've been at Acme Corp for about 14 months." }
```

**Database: INSERT into `messages`**

```json
{
  "_id": "msg_003",
  "conversationId": "conv_01J7Xk9pQ3",
  "seq": 3,
  "role": "user",
  "content": "I've been at Acme Corp for about 14 months.",
  "contentType": "text",
  "analysisRunId": null,
  "createdAt": "2026-03-05T10:01:30.000Z",
  "tokens": 12
}
```

User sends another message immediately:

```json
{ "content": "I'm a senior software engineer on the platform team." }
```

**Database: INSERT into `messages`**

```json
{
  "_id": "msg_004",
  "conversationId": "conv_01J7Xk9pQ3",
  "seq": 4,
  "role": "user",
  "content": "I'm a senior software engineer on the platform team.",
  "contentType": "text",
  "analysisRunId": null,
  "createdAt": "2026-03-05T10:01:45.000Z",
  "tokens": 11
}
```

AI bot acknowledges:

**Database: INSERT into `messages`**

```json
{
  "_id": "msg_005",
  "conversationId": "conv_01J7Xk9pQ3",
  "seq": 5,
  "role": "assistant",
  "content": "Great, thanks for sharing that! Whenever you're ready, you can click \"AI Analyse\" and I'll run a detailed eligibility check based on everything you've told me.",
  "contentType": "text",
  "analysisRunId": null,
  "createdAt": "2026-03-05T10:01:47.200Z",
  "tokens": 38
}
```

**Current state:**

```
conversations.status    = "active"
conversations.messageCount = 5
messages                = [msg_001 .. msg_005]
analysis_runs           = (none)
```

---

## Phase 2: First "AI Analyse" Trigger (with Single Select question)

### Step 2.1 — User clicks "AI Analyse"

```
POST /api/v1/conversations/conv_01J7Xk9pQ3/analyse
Authorization: Bearer <jwt>
X-Idempotency-Key: idem_client_a1b2c3
```

**Server-side logic:**

```javascript
async function triggerAnalysis(conversationId, idempotencyKey, userId) {
  // 1. Check for existing run with this idempotency key
  const existing = await db.analysis_runs.findOne({ idempotencyKey });
  if (existing) {
    console.log("Idempotent hit — returning existing run");
    return { status: 200, body: existing };
  }

  // 2. Verify conversation is in a triggerable state
  const conv = await db.conversations.findOneAndUpdate(
    { _id: conversationId, status: { $in: ["active"] } },
    { $set: { status: "analysing", updatedAt: now() } },
    { returnDocument: "after" }
  );
  if (!conv) throw new ConflictError("Conversation is not in a state that allows analysis");

  // 3. Determine current message seq
  const latestMsg = await db.messages
    .find({ conversationId })
    .sort({ seq: -1 })
    .limit(1)
    .next();

  // 4. Compute run number
  const runCount = await db.analysis_runs.countDocuments({ conversationId });

  // 5. Insert analysis run
  try {
    const run = {
      _id: "run_v9LkM3",
      conversationId,
      userId,
      runNumber: runCount + 1,           // 1
      status: "pending",
      idempotencyKey,
      triggerMessageSeq: latestMsg.seq,   // 5
      snapshotRange: { fromSeq: 1, toSeq: 5 },
      currentQuestion: null,
      artefact: null,
      error: null,
      langGraphThreadId: "lg_thr_run_v9LkM3",
      createdAt: now(),
      updatedAt: now(),
      completedAt: null,
      durationMs: null
    };
    await db.analysis_runs.insertOne(run);
    await jobQueue.enqueue({ runId: run._id, type: "analysis" });
    return { status: 201, body: run };
  } catch (err) {
    if (err.code === 11000) {
      // Race condition — another request inserted first
      const existing = await db.analysis_runs.findOne({ idempotencyKey });
      // Roll back conversation status
      await db.conversations.updateOne(
        { _id: conversationId },
        { $set: { status: "active" } }
      );
      return { status: 200, body: existing };
    }
    throw err;
  }
}
```

**Database: INSERT into `analysis_runs`**

```json
{
  "_id": "run_v9LkM3",
  "conversationId": "conv_01J7Xk9pQ3",
  "userId": "usr_42f",
  "runNumber": 1,
  "status": "pending",
  "idempotencyKey": "idem_client_a1b2c3",
  "triggerMessageSeq": 5,
  "snapshotRange": { "fromSeq": 1, "toSeq": 5 },
  "currentQuestion": null,
  "artefact": null,
  "error": null,
  "langGraphThreadId": "lg_thr_run_v9LkM3",
  "createdAt": "2026-03-05T10:02:00.000Z",
  "updatedAt": "2026-03-05T10:02:00.000Z",
  "completedAt": null,
  "durationMs": null
}
```

**Database: UPDATE `conversations`**

```javascript
// Already done in findOneAndUpdate above
{ status: "active" } → { status: "analysing" }
```

**Database: INSERT into `audit_events`**

```json
{
  "_id": "evt_000006",
  "conversationId": "conv_01J7Xk9pQ3",
  "analysisRunId": "run_v9LkM3",
  "actor": "usr_42f",
  "action": "analysis.triggered",
  "detail": {
    "idempotencyKey": "idem_client_a1b2c3",
    "triggerMessageSeq": 5,
    "runNumber": 1
  },
  "timestamp": "2026-03-05T10:02:00.000Z"
}
```

**Job enqueued:** `{ runId: "run_v9LkM3", type: "analysis" }`

**API Response: `201 Created`**

```json
{
  "id": "run_v9LkM3",
  "status": "pending",
  "runNumber": 1
}
```

---

### ⚡ Edge Case 2.1a — Double-click / Duplicate trigger

User's browser fires the request twice. Second request arrives 200ms later with the same idempotency key.

```
POST /api/v1/conversations/conv_01J7Xk9pQ3/analyse
X-Idempotency-Key: idem_client_a1b2c3          ← same key
```

**Server-side:** The `findOne({ idempotencyKey })` check at the top of `triggerAnalysis` returns the existing run.

**API Response: `200 OK`** (not 201 — indicates idempotent hit)

```json
{
  "id": "run_v9LkM3",
  "status": "pending",
  "runNumber": 1
}
```

**No new documents created. No job enqueued. No state change.**

---

### ⚡ Edge Case 2.1b — Trigger while already analysing

User somehow sends another analyse request with a *different* idempotency key while the conversation is in `analysing` state.

```
POST /api/v1/conversations/conv_01J7Xk9pQ3/analyse
X-Idempotency-Key: idem_client_DIFFERENT
```

**Server-side:** The `findOneAndUpdate` precondition fails because `status` is `"analysing"`, not `"active"`.

```javascript
const conv = await db.conversations.findOneAndUpdate(
  { _id: conversationId, status: { $in: ["active"] } },  // ← no match
  ...
);
// conv is null
```

**API Response: `409 Conflict`**

```json
{
  "error": "ANALYSIS_IN_PROGRESS",
  "message": "An analysis run is already in progress for this conversation.",
  "activeRunId": "run_v9LkM3"
}
```

---

### Step 2.2 — Worker picks up the job and starts LangGraph

```javascript
// Worker process
async function processAnalysisJob(jobPayload) {
  const { runId } = jobPayload;

  // 1. Transition run from pending → running (atomic with precondition)
  const run = await db.analysis_runs.findOneAndUpdate(
    { _id: runId, status: "pending" },
    { $set: { status: "running", updatedAt: now() } },
    { returnDocument: "after" }
  );
  if (!run) {
    console.log("Run is not pending — skip (idempotent)");
    return;
  }

  // 2. Load conversation messages within snapshot range
  const messages = await db.messages
    .find({
      conversationId: run.conversationId,
      seq: { $gte: run.snapshotRange.fromSeq, $lte: run.snapshotRange.toSeq }
    })
    .sort({ seq: 1 })
    .toArray();

  // 3. Build initial LangGraph state
  const initialState = {
    conversationId: run.conversationId,
    runId: run._id,
    messages: messages.map(m => ({ role: m.role, content: m.content, seq: m.seq })),
    collectedAnswers: {},
    pendingQuestion: null,
    analysisResult: null
  };

  // 4. Invoke LangGraph
  const config = {
    configurable: { thread_id: run.langGraphThreadId }
  };

  try {
    const result = await compiledGraph.invoke(initialState, config);
    // handle result (see steps below — graph will interrupt or complete)
  } catch (err) {
    await handleRunFailure(run, err);
  }
}
```

**Database: UPDATE `analysis_runs`**

```javascript
{ _id: "run_v9LkM3", status: "pending" }
→ { status: "running", updatedAt: "2026-03-05T10:02:01.500Z" }
```

**Database: INSERT into `audit_events`**

```json
{
  "_id": "evt_000007",
  "conversationId": "conv_01J7Xk9pQ3",
  "analysisRunId": "run_v9LkM3",
  "actor": "system",
  "action": "analysis.running",
  "detail": { "workerId": "worker-03", "messageCount": 5 },
  "timestamp": "2026-03-05T10:02:01.500Z"
}
```

---

### Step 2.3 — LangGraph executes: gather_context → decide_action

The graph loads all messages, the `decide_action` node determines that the **contract type** is unknown.

**LangGraph internal — `decide_action` node output:**

```json
{
  "decision": "need_info",
  "reasoning": "User mentioned 14 months tenure and role, but contract type (permanent, fixed-term, casual) is not specified. This is required for eligibility.",
  "questionToAsk": {
    "type": "single_select",
    "text": "What type of employment contract are you on?",
    "options": [
      { "key": "permanent", "label": "Permanent / Ongoing" },
      { "key": "fixed", "label": "Fixed-term contract" },
      { "key": "casual", "label": "Casual / Zero-hours" }
    ]
  }
}
```

The graph routes to the `ask_question` node, which is configured with `interrupt_before`. LangGraph **checkpoints the state** before executing the node and returns control.

**Database: INSERT into `langgraph_checkpoints` (by MongoDBSaver)**

```json
{
  "_id": "chk_001",
  "thread_id": "lg_thr_run_v9LkM3",
  "checkpoint_id": "chk_step_2",
  "parent_checkpoint_id": "chk_step_1",
  "channel_values": {
    "messages": [
      { "role": "user", "content": "Hi, I'd like to find out...", "seq": 1 },
      { "role": "assistant", "content": "Hello Sarah!...", "seq": 2 },
      { "role": "user", "content": "I've been at Acme Corp for about 14 months.", "seq": 3 },
      { "role": "user", "content": "I'm a senior software engineer...", "seq": 4 },
      { "role": "assistant", "content": "Great, thanks for sharing...", "seq": 5 }
    ],
    "collectedAnswers": {},
    "pendingQuestion": {
      "type": "single_select",
      "text": "What type of employment contract are you on?",
      "options": [
        { "key": "permanent", "label": "Permanent / Ongoing" },
        { "key": "fixed", "label": "Fixed-term contract" },
        { "key": "casual", "label": "Casual / Zero-hours" }
      ]
    },
    "analysisResult": null
  },
  "metadata": {
    "step": 2,
    "source": "loop",
    "node": "ask_question",
    "trace": {
      "model": "claude-sonnet-4-20250514",
      "promptTemplateVersion": "v2.3.1",
      "inputTokens": 1240,
      "outputTokens": 180,
      "latencyMs": 1120
    }
  },
  "created_at": "2026-03-05T10:02:03.200Z"
}
```

---

### Step 2.4 — Worker writes the question message and parks the run

After LangGraph returns (interrupted), the worker extracts the pending question and writes it to the database.

```javascript
// Worker — after graph.invoke() returns with interrupted state
const interruptedState = result; // state at interrupt point

if (interruptedState.pendingQuestion) {
  // 1. Write question as an assistant message
  const conv = await db.conversations.findOneAndUpdate(
    { _id: run.conversationId },
    { $inc: { messageCount: 1 }, $set: { updatedAt: now() } },
    { returnDocument: "after" }
  );

  const questionMsg = {
    _id: "msg_006",
    conversationId: run.conversationId,
    seq: conv.messageCount,  // 6
    role: "assistant",
    content: interruptedState.pendingQuestion.text,
    contentType: "text",
    analysisRunId: run._id,
    questionMeta: {
      questionType: interruptedState.pendingQuestion.type,
      options: interruptedState.pendingQuestion.options,
      required: true
    },
    createdAt: now(),
    tokens: 14
  };
  await db.messages.insertOne(questionMsg);

  // 2. Update analysis run → awaiting_input
  await db.analysis_runs.findOneAndUpdate(
    { _id: run._id, status: "running" },
    {
      $set: {
        status: "awaiting_input",
        currentQuestion: {
          messageId: questionMsg._id,
          questionType: "single_select",
          answeredAt: null
        },
        updatedAt: now()
      }
    }
  );
}
```

**Database: INSERT into `messages`**

```json
{
  "_id": "msg_006",
  "conversationId": "conv_01J7Xk9pQ3",
  "seq": 6,
  "role": "assistant",
  "content": "What type of employment contract are you on?",
  "contentType": "text",
  "analysisRunId": "run_v9LkM3",
  "questionMeta": {
    "questionType": "single_select",
    "options": [
      { "key": "permanent", "label": "Permanent / Ongoing" },
      { "key": "fixed", "label": "Fixed-term contract" },
      { "key": "casual", "label": "Casual / Zero-hours" }
    ],
    "required": true
  },
  "createdAt": "2026-03-05T10:02:03.800Z",
  "tokens": 14
}
```

**Database: UPDATE `analysis_runs`**

```javascript
{ _id: "run_v9LkM3", status: "running" }
→ {
    status: "awaiting_input",
    currentQuestion: {
      messageId: "msg_006",
      questionType: "single_select",
      answeredAt: null
    },
    updatedAt: "2026-03-05T10:02:03.800Z"
  }
```

**Database: INSERT into `audit_events`**

```json
{
  "_id": "evt_000008",
  "conversationId": "conv_01J7Xk9pQ3",
  "analysisRunId": "run_v9LkM3",
  "actor": "ai",
  "action": "analysis.question_asked",
  "detail": {
    "messageId": "msg_006",
    "questionType": "single_select",
    "optionCount": 3
  },
  "timestamp": "2026-03-05T10:02:03.800Z"
}
```

**Real-time push to client (WebSocket/SSE):**

```json
{
  "event": "analysis.question",
  "data": {
    "runId": "run_v9LkM3",
    "messageId": "msg_006",
    "questionType": "single_select",
    "text": "What type of employment contract are you on?",
    "options": [
      { "key": "permanent", "label": "Permanent / Ongoing" },
      { "key": "fixed", "label": "Fixed-term contract" },
      { "key": "casual", "label": "Casual / Zero-hours" }
    ]
  }
}
```

**Current state:**

```
conversations.status       = "analysing"
analysis_runs.status       = "awaiting_input"
messages                   = [msg_001 .. msg_006]
langgraph_checkpoints      = [chk_step_1, chk_step_2]
```

---

### Step 2.5 — User answers the single select question

The UI renders the options as buttons. Sarah clicks **"Fixed-term contract"**.

```
POST /api/v1/conversations/conv_01J7Xk9pQ3/messages
Authorization: Bearer <jwt>
```

```json
{
  "content": "Fixed-term contract",
  "contentType": "single_select_response",
  "analysisRunId": "run_v9LkM3",
  "selectedOptions": ["fixed"]
}
```

**Server-side logic:**

```javascript
async function handleAnalysisAnswer(conversationId, body) {
  const run = await db.analysis_runs.findOne({
    _id: body.analysisRunId,
    conversationId,
    status: "awaiting_input"
  });
  if (!run) throw new ConflictError("No active question for this run");

  // 1. Validate answer against question type
  if (run.currentQuestion.questionType === "single_select") {
    if (body.selectedOptions.length !== 1) {
      throw new ValidationError("Single select requires exactly one option");
    }
  }

  // 2. Insert answer message
  const conv = await db.conversations.findOneAndUpdate(
    { _id: conversationId },
    { $inc: { messageCount: 1 }, $set: { updatedAt: now() } },
    { returnDocument: "after" }
  );

  const answerMsg = {
    _id: "msg_007",
    conversationId,
    seq: conv.messageCount,  // 7
    role: "user",
    content: "Fixed-term contract",
    contentType: "single_select_response",
    analysisRunId: run._id,
    createdAt: now(),
    tokens: 3
  };
  await db.messages.insertOne(answerMsg);

  // 3. Mark question as answered
  await db.analysis_runs.findOneAndUpdate(
    { _id: run._id, status: "awaiting_input" },
    {
      $set: {
        "currentQuestion.answeredAt": now(),
        status: "running",
        updatedAt: now()
      }
    }
  );

  // 4. Resume LangGraph from checkpoint — for single/multi select, resume immediately
  await jobQueue.enqueue({
    runId: run._id,
    type: "analysis_resume",
    userInput: { selectedOptions: ["fixed"] }
  });
}
```

**Database: INSERT into `messages`**

```json
{
  "_id": "msg_007",
  "conversationId": "conv_01J7Xk9pQ3",
  "seq": 7,
  "role": "user",
  "content": "Fixed-term contract",
  "contentType": "single_select_response",
  "analysisRunId": "run_v9LkM3",
  "createdAt": "2026-03-05T10:03:15.000Z",
  "tokens": 3
}
```

**Database: UPDATE `analysis_runs`**

```javascript
{
  _id: "run_v9LkM3",
  status: "awaiting_input"
}
→ {
  status: "running",
  "currentQuestion.answeredAt": "2026-03-05T10:03:15.000Z",
  updatedAt: "2026-03-05T10:03:15.000Z"
}
```

**Database: INSERT into `audit_events`**

```json
{
  "_id": "evt_000009",
  "conversationId": "conv_01J7Xk9pQ3",
  "analysisRunId": "run_v9LkM3",
  "actor": "usr_42f",
  "action": "analysis.answer_received",
  "detail": {
    "messageId": "msg_007",
    "questionType": "single_select",
    "selectedOptions": ["fixed"]
  },
  "timestamp": "2026-03-05T10:03:15.000Z"
}
```

---

### Step 2.6 — Worker resumes LangGraph → asks a Multi Select question

```javascript
// Worker — resume job
async function resumeAnalysis(jobPayload) {
  const { runId, userInput } = jobPayload;

  const run = await db.analysis_runs.findOne({ _id: runId });
  const config = { configurable: { thread_id: run.langGraphThreadId } };

  // Resume graph, injecting the user's answer
  const resumeInput = {
    userAnswer: {
      questionType: "single_select",
      selectedOptions: userInput.selectedOptions  // ["fixed"]
    }
  };

  const result = await compiledGraph.invoke(resumeInput, config);
  // Graph resumes from checkpoint chk_step_2, processes answer,
  // loops back to decide_action...
}
```

LangGraph resumes → the `decide_action` node now has the contract type, but decides it needs to know which **benefit categories** the user is interested in. This calls for a **multi select** question.

**LangGraph internal — `decide_action` node output:**

```json
{
  "decision": "need_info",
  "reasoning": "Contract type confirmed as fixed-term. Need to know which benefit categories to evaluate. Multiple may apply.",
  "questionToAsk": {
    "type": "multi_select",
    "text": "Which benefit categories would you like me to check? Select all that apply.",
    "options": [
      { "key": "parental_leave", "label": "Extended parental leave" },
      { "key": "health", "label": "Health & dental coverage" },
      { "key": "pension", "label": "Pension contributions" },
      { "key": "training", "label": "Training & development budget" }
    ]
  }
}
```

Graph interrupts again. New checkpoint saved.

**Database: INSERT into `langgraph_checkpoints`**

```json
{
  "_id": "chk_002",
  "thread_id": "lg_thr_run_v9LkM3",
  "checkpoint_id": "chk_step_4",
  "parent_checkpoint_id": "chk_step_3",
  "channel_values": {
    "messages": [ "... (all 7 messages)" ],
    "collectedAnswers": {
      "contractType": "fixed"
    },
    "pendingQuestion": {
      "type": "multi_select",
      "text": "Which benefit categories would you like me to check? Select all that apply.",
      "options": [ "... (4 options)" ]
    },
    "analysisResult": null
  },
  "metadata": {
    "step": 4,
    "source": "loop",
    "node": "ask_question",
    "trace": {
      "model": "claude-sonnet-4-20250514",
      "promptTemplateVersion": "v2.3.1",
      "inputTokens": 1680,
      "outputTokens": 210,
      "latencyMs": 980
    }
  },
  "created_at": "2026-03-05T10:03:17.100Z"
}
```

**Database: INSERT into `messages`**

```json
{
  "_id": "msg_008",
  "conversationId": "conv_01J7Xk9pQ3",
  "seq": 8,
  "role": "assistant",
  "content": "Which benefit categories would you like me to check? Select all that apply.",
  "contentType": "text",
  "analysisRunId": "run_v9LkM3",
  "questionMeta": {
    "questionType": "multi_select",
    "options": [
      { "key": "parental_leave", "label": "Extended parental leave" },
      { "key": "health", "label": "Health & dental coverage" },
      { "key": "pension", "label": "Pension contributions" },
      { "key": "training", "label": "Training & development budget" }
    ],
    "required": true
  },
  "createdAt": "2026-03-05T10:03:17.500Z",
  "tokens": 22
}
```

**Database: UPDATE `analysis_runs`**

```javascript
{
  status: "running"
}
→ {
  status: "awaiting_input",
  currentQuestion: {
    messageId: "msg_008",
    questionType: "multi_select",
    answeredAt: null
  }
}
```

---

### Step 2.7 — User answers the multi select question

Sarah selects **"Extended parental leave"** and **"Health & dental coverage"**.

```
POST /api/v1/conversations/conv_01J7Xk9pQ3/messages
```

```json
{
  "content": "Extended parental leave, Health & dental coverage",
  "contentType": "multi_select_response",
  "analysisRunId": "run_v9LkM3",
  "selectedOptions": ["parental_leave", "health"]
}
```

**Server-side validation:**

```javascript
if (run.currentQuestion.questionType === "multi_select") {
  if (body.selectedOptions.length < 1) {
    throw new ValidationError("Multi select requires at least one option");
  }
  // Validate all keys exist in the original options
  const validKeys = run.currentQuestion.options?.map(o => o.key);
  // (options fetched from the question message's questionMeta)
}
```

**Database: INSERT into `messages`**

```json
{
  "_id": "msg_009",
  "conversationId": "conv_01J7Xk9pQ3",
  "seq": 9,
  "role": "user",
  "content": "Extended parental leave, Health & dental coverage",
  "contentType": "multi_select_response",
  "analysisRunId": "run_v9LkM3",
  "createdAt": "2026-03-05T10:04:02.000Z",
  "tokens": 7
}
```

**Same flow as Step 2.5:** run transitions `awaiting_input → running`, graph resumes from checkpoint `chk_step_4`.

---

## Phase 3: Free-Text Question Flow

### Step 3.1 — LangGraph resumes → asks a free-text question

After processing the multi-select answer, `decide_action` determines it needs more nuanced context about Sarah's specific situation — a structured question won't suffice.

**LangGraph internal — `decide_action` node output:**

```json
{
  "decision": "need_info",
  "reasoning": "Need specifics about the parental leave situation — expected dates, partner's employment, any previous leave taken. Free-text allows the user to provide rich context.",
  "questionToAsk": {
    "type": "free_text",
    "text": "Could you tell me more about your parental leave plans? For example: when is your expected due date or adoption date, will your partner also be taking leave, and have you taken any parental leave with Acme Corp before?"
  }
}
```

Graph interrupts. Checkpoint saved.

**Database: INSERT into `messages`**

```json
{
  "_id": "msg_010",
  "conversationId": "conv_01J7Xk9pQ3",
  "seq": 10,
  "role": "assistant",
  "content": "Could you tell me more about your parental leave plans? For example: when is your expected due date or adoption date, will your partner also be taking leave, and have you taken any parental leave with Acme Corp before?",
  "contentType": "text",
  "analysisRunId": "run_v9LkM3",
  "questionMeta": {
    "questionType": "free_text",
    "options": null,
    "required": true
  },
  "createdAt": "2026-03-05T10:04:05.200Z",
  "tokens": 48
}
```

**Database: UPDATE `analysis_runs`**

```javascript
→ {
  status: "awaiting_input",
  currentQuestion: {
    messageId: "msg_010",
    questionType: "free_text",
    answeredAt: null
  }
}
```

**Key difference for free-text:** The conversation status transitions back to `active` so the user can send regular chat messages.

**Database: UPDATE `conversations`**

```javascript
{ status: "analysing" } → { status: "active" }
```

**Database: INSERT into `audit_events`**

```json
{
  "_id": "evt_000012",
  "conversationId": "conv_01J7Xk9pQ3",
  "analysisRunId": "run_v9LkM3",
  "actor": "ai",
  "action": "analysis.question_asked",
  "detail": {
    "messageId": "msg_010",
    "questionType": "free_text",
    "conversationReactivated": true
  },
  "timestamp": "2026-03-05T10:04:05.200Z"
}
```

**Real-time push to client:**

```json
{
  "event": "analysis.free_text_input_required",
  "data": {
    "runId": "run_v9LkM3",
    "messageId": "msg_010",
    "hint": "Send your responses, then click \"AI Analyse\" when ready."
  }
}
```

**Current state:**

```
conversations.status       = "active"    ← back to active for free chat
analysis_runs.status       = "awaiting_input"
analysis_runs.currentQuestion.questionType = "free_text"
```

---

### Step 3.2 — User sends free-text messages (multiple)

Sarah sends several messages as regular chat:

```
POST /api/v1/conversations/conv_01J7Xk9pQ3/messages
```

**Message 1:**

```json
{ "content": "My due date is August 15th 2026." }
```

**Database: INSERT into `messages`**

```json
{
  "_id": "msg_011",
  "conversationId": "conv_01J7Xk9pQ3",
  "seq": 11,
  "role": "user",
  "content": "My due date is August 15th 2026.",
  "contentType": "text",
  "analysisRunId": "run_v9LkM3",
  "createdAt": "2026-03-05T10:06:00.000Z",
  "tokens": 9
}
```

> **Note:** Even though the conversation is `active`, these messages still carry `analysisRunId` because they are in response to an active analysis question. The server sets this automatically when a run is in `awaiting_input` with a `free_text` question.

**Message 2:**

```json
{ "content": "My partner works at a different company. He'll be taking 2 weeks off." }
```

```json
{
  "_id": "msg_012",
  "conversationId": "conv_01J7Xk9pQ3",
  "seq": 12,
  "role": "user",
  "content": "My partner works at a different company. He'll be taking 2 weeks off.",
  "contentType": "text",
  "analysisRunId": "run_v9LkM3",
  "createdAt": "2026-03-05T10:06:30.000Z",
  "tokens": 15
}
```

**Message 3:**

```json
{ "content": "I haven't taken any parental leave before — this is my first child!" }
```

```json
{
  "_id": "msg_013",
  "conversationId": "conv_01J7Xk9pQ3",
  "seq": 13,
  "role": "user",
  "content": "I haven't taken any parental leave before — this is my first child!",
  "contentType": "text",
  "analysisRunId": "run_v9LkM3",
  "createdAt": "2026-03-05T10:07:00.000Z",
  "tokens": 14
}
```

**No analysis triggered yet** — the user is still composing their response. The `analysis_runs` document remains in `awaiting_input`. No LangGraph activity.

---

### Step 3.3 — User clicks "AI Analyse" to resume after free-text

```
POST /api/v1/conversations/conv_01J7Xk9pQ3/analyse
X-Idempotency-Key: idem_client_d4e5f6        ← new key (new user action)
```

**Server-side logic — special handling for free-text resume:**

```javascript
async function triggerAnalysis(conversationId, idempotencyKey, userId) {
  // 1. Check idempotency (same as before)
  const existingByKey = await db.analysis_runs.findOne({ idempotencyKey });
  if (existingByKey) return { status: 200, body: existingByKey };

  // 2. Check if there's an existing run awaiting free-text input
  const awaitingRun = await db.analysis_runs.findOne({
    conversationId,
    status: "awaiting_input",
    "currentQuestion.questionType": "free_text"
  });

  if (awaitingRun) {
    // RESUME existing run (not create a new one)
    // 3. Collect free-text messages since the question was asked
    const questionMsg = await db.messages.findOne({ _id: awaitingRun.currentQuestion.messageId });
    const freeTextMessages = await db.messages
      .find({
        conversationId,
        analysisRunId: awaitingRun._id,
        seq: { $gt: questionMsg.seq },
        role: "user"
      })
      .sort({ seq: 1 })
      .toArray();

    if (freeTextMessages.length === 0) {
      throw new ValidationError("Please provide at least one message before resuming analysis.");
    }

    // 4. Transition conversation and run
    await db.conversations.findOneAndUpdate(
      { _id: conversationId, status: "active" },
      { $set: { status: "analysing", updatedAt: now() } }
    );

    await db.analysis_runs.findOneAndUpdate(
      { _id: awaitingRun._id, status: "awaiting_input" },
      {
        $set: {
          status: "running",
          "currentQuestion.answeredAt": now(),
          "snapshotRange.toSeq": freeTextMessages[freeTextMessages.length - 1].seq,
          updatedAt: now()
        }
      }
    );

    // 5. Enqueue resume job with the free-text messages
    await jobQueue.enqueue({
      runId: awaitingRun._id,
      type: "analysis_resume",
      userInput: {
        freeTextMessages: freeTextMessages.map(m => ({
          content: m.content,
          seq: m.seq
        }))
      }
    });

    return { status: 200, body: awaitingRun };
  }

  // ... (else: normal new-run creation as in Step 2.1)
}
```

**Database: UPDATE `conversations`**

```javascript
{ status: "active" } → { status: "analysing" }
```

**Database: UPDATE `analysis_runs`**

```javascript
{
  _id: "run_v9LkM3",
  status: "awaiting_input"
}
→ {
  status: "running",
  "currentQuestion.answeredAt": "2026-03-05T10:08:00.000Z",
  "snapshotRange.toSeq": 13,
  updatedAt: "2026-03-05T10:08:00.000Z"
}
```

**Database: INSERT into `audit_events`**

```json
{
  "_id": "evt_000016",
  "conversationId": "conv_01J7Xk9pQ3",
  "analysisRunId": "run_v9LkM3",
  "actor": "usr_42f",
  "action": "analysis.answer_received",
  "detail": {
    "questionType": "free_text",
    "messageCount": 3,
    "messageIds": ["msg_011", "msg_012", "msg_013"]
  },
  "timestamp": "2026-03-05T10:08:00.000Z"
}
```

**API Response: `200 OK`**

```json
{
  "id": "run_v9LkM3",
  "status": "running",
  "resumed": true,
  "runNumber": 1
}
```

---

### ⚡ Edge Case 3.3a — User clicks "AI Analyse" with no free-text messages

```
POST /api/v1/conversations/conv_01J7Xk9pQ3/analyse
X-Idempotency-Key: idem_client_g7h8i9
```

Server finds the awaiting run, queries for free-text messages, finds zero.

**API Response: `422 Unprocessable Entity`**

```json
{
  "error": "NO_INPUT_PROVIDED",
  "message": "Please type at least one message before clicking AI Analyse."
}
```

---

## Phase 4: Analysis Completion & Artefact Generation

### Step 4.1 — Worker resumes LangGraph → graph completes

```javascript
// Worker — resume with free-text input
const resumeInput = {
  userAnswer: {
    questionType: "free_text",
    freeTextMessages: [
      { content: "My due date is August 15th 2026.", seq: 11 },
      { content: "My partner works at a different company. He'll be taking 2 weeks off.", seq: 12 },
      { content: "I haven't taken any parental leave before — this is my first child!", seq: 13 }
    ]
  }
};

const config = { configurable: { thread_id: run.langGraphThreadId } };
const result = await compiledGraph.invoke(resumeInput, config);
```

LangGraph resumes from checkpoint → `decide_action` now has all required information → routes to `generate_artefact`.

**LangGraph internal — `decide_action` node output:**

```json
{
  "decision": "ready",
  "reasoning": "All required fields gathered: tenure (14mo), contract type (fixed-term), benefit categories (parental leave, health), due date (Aug 2026), partner situation (different employer, 2wk leave), first child. Proceeding to generate eligibility artefact."
}
```

**LangGraph internal — `generate_artefact` node output:**

```json
{
  "artefact": {
    "type": "eligibility_summary",
    "payload": {
      "eligible": true,
      "overallScore": 87,
      "categories": [
        {
          "name": "Extended parental leave",
          "eligible": true,
          "maxWeeks": 16,
          "details": "Fixed-term employees with 12+ months tenure qualify for up to 16 weeks. Pro-rated salary at 80% for first 8 weeks, statutory rate thereafter.",
          "factors": [
            { "name": "tenure", "value": "14 months", "meets_threshold": true, "threshold": "12 months" },
            { "name": "contractType", "value": "fixed-term", "eligible": true },
            { "name": "previousLeave", "value": "none", "note": "Full entitlement available" }
          ]
        },
        {
          "name": "Health & dental coverage",
          "eligible": true,
          "details": "Continues through parental leave period. No change to coverage level.",
          "factors": [
            { "name": "activeContract", "value": true, "note": "Coverage maintained during approved leave" }
          ]
        }
      ],
      "nextSteps": [
        "Notify your line manager at least 15 weeks before the due date (by April 30, 2026).",
        "Submit form PL-1 to HR with your MAT-B1 certificate.",
        "Schedule a keeping-in-touch (KIT) day plan with your manager."
      ],
      "disclaimers": [
        "This analysis is based on current Acme Corp policy v4.2 and UK statutory entitlements.",
        "Actual eligibility is confirmed by HR upon formal application."
      ]
    }
  }
}
```

Graph reaches the finish point. Final checkpoint saved.

---

### Step 4.2 — Worker writes artefact & closes the conversation

```javascript
// Worker — after graph completes successfully
const artefactData = result.artefact;
const durationMs = Date.now() - new Date(run.createdAt).getTime();

// 1. Insert artefact
const artefact = {
  _id: "art_Wn4rP7",
  conversationId: run.conversationId,
  analysisRunId: run._id,
  version: 1,
  type: artefactData.type,
  payload: artefactData.payload,
  createdAt: now()
};
await db.artefacts.insertOne(artefact);

// 2. Write completion message to conversation
const conv = await db.conversations.findOneAndUpdate(
  { _id: run.conversationId },
  { $inc: { messageCount: 1 }, $set: { updatedAt: now() } },
  { returnDocument: "after" }
);

await db.messages.insertOne({
  _id: "msg_014",
  conversationId: run.conversationId,
  seq: conv.messageCount,  // 14
  role: "assistant",
  content: "I've completed the eligibility analysis. Here's your personalised summary.",
  contentType: "text",
  analysisRunId: run._id,
  createdAt: now(),
  tokens: 12
});

// 3. Complete the analysis run
await db.analysis_runs.findOneAndUpdate(
  { _id: run._id, status: "running" },
  {
    $set: {
      status: "completed",
      artefact: artefact._id,
      completedAt: now(),
      durationMs,
      updatedAt: now()
    }
  }
);

// 4. Close the conversation
const retentionDays = 90;
const closedAt = now();
await db.conversations.findOneAndUpdate(
  { _id: run.conversationId },
  {
    $set: {
      status: "closed",
      closedAt,
      ttlExpiresAt: new Date(closedAt.getTime() + retentionDays * 86400000),
      updatedAt: closedAt
    }
  }
);
```

**Database: INSERT into `artefacts`**

```json
{
  "_id": "art_Wn4rP7",
  "conversationId": "conv_01J7Xk9pQ3",
  "analysisRunId": "run_v9LkM3",
  "version": 1,
  "type": "eligibility_summary",
  "payload": {
    "eligible": true,
    "overallScore": 87,
    "categories": [ "... (as above)" ],
    "nextSteps": [ "... (as above)" ],
    "disclaimers": [ "... (as above)" ]
  },
  "createdAt": "2026-03-05T10:08:08.000Z"
}
```

**Database: INSERT into `messages`**

```json
{
  "_id": "msg_014",
  "conversationId": "conv_01J7Xk9pQ3",
  "seq": 14,
  "role": "assistant",
  "content": "I've completed the eligibility analysis. Here's your personalised summary.",
  "contentType": "text",
  "analysisRunId": "run_v9LkM3",
  "createdAt": "2026-03-05T10:08:08.000Z",
  "tokens": 12
}
```

**Database: UPDATE `analysis_runs`**

```javascript
→ {
  status: "completed",
  artefact: "art_Wn4rP7",
  completedAt: "2026-03-05T10:08:08.000Z",
  durationMs: 368000,
  updatedAt: "2026-03-05T10:08:08.000Z"
}
```

**Database: UPDATE `conversations`**

```javascript
→ {
  status: "closed",
  closedAt: "2026-03-05T10:08:08.000Z",
  ttlExpiresAt: "2026-06-03T10:08:08.000Z",   // 90 days
  updatedAt: "2026-03-05T10:08:08.000Z"
}
```

**Database: INSERT into `audit_events` (multiple)**

```json
[
  {
    "_id": "evt_000017",
    "conversationId": "conv_01J7Xk9pQ3",
    "analysisRunId": "run_v9LkM3",
    "actor": "system",
    "action": "analysis.completed",
    "detail": { "artefactId": "art_Wn4rP7", "durationMs": 368000 },
    "timestamp": "2026-03-05T10:08:08.000Z"
  },
  {
    "_id": "evt_000018",
    "conversationId": "conv_01J7Xk9pQ3",
    "analysisRunId": "run_v9LkM3",
    "actor": "system",
    "action": "conversation.closed",
    "detail": { "artefactId": "art_Wn4rP7", "retentionDays": 90 },
    "timestamp": "2026-03-05T10:08:08.000Z"
  }
]
```

---

## Phase 5: Edge Cases & Failure Scenarios

### ⚡ Edge Case 5.1 — Worker crashes mid-analysis

**Scenario:** Worker picks up `run_v9LkM3`, transitions it to `running`, invokes LangGraph, and then the worker process is killed (OOM, deployment, etc.) after checkpoint `chk_step_2` is saved but before the question message is written.

**What happens:**

1. **Job visibility timeout expires** (e.g. 5 minutes). The queue makes the job visible again.
2. A new worker picks up the same job.
3. The new worker tries the atomic transition:

```javascript
const run = await db.analysis_runs.findOneAndUpdate(
  { _id: runId, status: "pending" },   // ← fails: status is "running"
  { $set: { status: "running" } }
);
// run is null — status is already "running"
```

4. The worker detects this and checks how long the run has been in `running`:

```javascript
const run = await db.analysis_runs.findOne({ _id: runId });
const staleDuration = Date.now() - new Date(run.updatedAt).getTime();
if (run.status === "running" && staleDuration > STALE_THRESHOLD_MS) {
  // Reclaim the run — the previous worker is presumed dead
  const reclaimed = await db.analysis_runs.findOneAndUpdate(
    { _id: runId, status: "running", updatedAt: run.updatedAt },  // optimistic lock
    { $set: { status: "running", updatedAt: now() } },            // refresh timestamp
    { returnDocument: "after" }
  );

  if (reclaimed) {
    // Resume LangGraph from last checkpoint — it picks up from chk_step_2
    const config = { configurable: { thread_id: reclaimed.langGraphThreadId } };
    const result = await compiledGraph.invoke(null, config);
    // Graph resumes cleanly from the checkpoint
  }
}
```

**Key insight:** LangGraph's checkpoint is the recovery mechanism. The graph doesn't re-run from scratch — it resumes from `chk_step_2`.

**Audit event:**

```json
{
  "_id": "evt_crash_001",
  "conversationId": "conv_01J7Xk9pQ3",
  "analysisRunId": "run_v9LkM3",
  "actor": "system",
  "action": "analysis.worker_reclaimed",
  "detail": {
    "previousWorkerId": "worker-03",
    "newWorkerId": "worker-07",
    "staleDurationMs": 312000,
    "resumedFromCheckpoint": "chk_step_2"
  },
  "timestamp": "2026-03-05T10:07:12.000Z"
}
```

---

### ⚡ Edge Case 5.2 — LLM call fails during analysis (retryable)

**Scenario:** The `decide_action` node calls the LLM, which returns a 529 (overloaded).

```javascript
// Inside the LangGraph node
async function decideActionNode(state) {
  try {
    const response = await llmClient.complete({
      model: "claude-sonnet-4-20250514",
      messages: buildPrompt(state),
      max_tokens: 1000
    });
    return parseDecision(response);
  } catch (err) {
    if (err.status === 529 || err.status === 500) {
      // Retryable — throw so LangGraph/worker retry logic kicks in
      throw new RetryableError("LLM temporarily unavailable", { cause: err });
    }
    throw err;  // Non-retryable — will fail the run
  }
}
```

**Worker retry logic:**

```javascript
try {
  const result = await compiledGraph.invoke(initialState, config);
} catch (err) {
  if (err instanceof RetryableError && attempt < MAX_RETRIES) {
    // Re-enqueue with exponential backoff
    await jobQueue.enqueue(
      { runId: run._id, type: "analysis", attempt: attempt + 1 },
      { delay: Math.pow(2, attempt) * 1000 }  // 2s, 4s, 8s
    );
    return;
  }
  // Max retries exceeded — fail the run
  await handleRunFailure(run, err);
}
```

**If max retries exceeded — `handleRunFailure`:**

```javascript
async function handleRunFailure(run, err) {
  await db.analysis_runs.findOneAndUpdate(
    { _id: run._id },
    {
      $set: {
        status: "failed",
        error: {
          code: err.code || "INTERNAL_ERROR",
          message: err.message,
          retryable: false
        },
        updatedAt: now()
      }
    }
  );

  // Return conversation to active so user can try again
  await db.conversations.findOneAndUpdate(
    { _id: run.conversationId },
    { $set: { status: "active", updatedAt: now() } }
  );

  // Notify user
  await realtimePush(run.conversationId, {
    event: "analysis.failed",
    data: {
      runId: run._id,
      message: "The analysis couldn't be completed. Please try again.",
      canRetry: true
    }
  });
}
```

**Database: UPDATE `analysis_runs`**

```javascript
→ {
  status: "failed",
  error: {
    code: "LLM_UNAVAILABLE",
    message: "LLM service returned 529 after 3 retries",
    retryable: false
  }
}
```

**Database: UPDATE `conversations`**

```javascript
{ status: "analysing" } → { status: "active" }
```

---

### ⚡ Edge Case 5.3 — User sends a chat message while analysis is running

**Scenario:** The analysis is in `running` state (not `awaiting_input`). Sarah types a message.

```
POST /api/v1/conversations/conv_01J7Xk9pQ3/messages
```

```json
{ "content": "Oh, I also wanted to mention I'm part-time, 4 days a week." }
```

**Server-side logic:**

```javascript
// Check if an analysis run is actively running (not awaiting input)
const activeRun = await db.analysis_runs.findOne({
  conversationId,
  status: "running"
});

if (activeRun) {
  // Option A (recommended): Accept the message but DON'T attach it to the run.
  // It will be visible in the conversation but won't be included in the
  // current analysis snapshot. The user can re-trigger analysis later if needed.
  const msg = {
    _id: "msg_extra",
    conversationId,
    seq: nextSeq,
    role: "user",
    content: body.content,
    contentType: "text",
    analysisRunId: null,  // explicitly NOT part of the active run
    createdAt: now(),
    tokens: 14
  };
  await db.messages.insertOne(msg);

  return {
    status: 201,
    body: {
      ...msg,
      warning: "An analysis is currently running. This message will be included in your next analysis."
    }
  };
}
```

---

### ⚡ Edge Case 5.4 — Free-text question times out (24 hours)

**Scenario:** Sarah is asked the free-text question but never comes back.

**Background timeout job (runs every hour):**

```javascript
async function timeoutStaleRuns() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const staleRuns = await db.analysis_runs.find({
    status: "awaiting_input",
    updatedAt: { $lt: cutoff }
  }).toArray();

  for (const run of staleRuns) {
    await db.analysis_runs.findOneAndUpdate(
      { _id: run._id, status: "awaiting_input" },
      {
        $set: {
          status: "failed",
          error: {
            code: "INPUT_TIMEOUT",
            message: "Timed out waiting for user input after 24 hours",
            retryable: true
          },
          updatedAt: now()
        }
      }
    );

    // Ensure conversation is active (may already be if free-text)
    await db.conversations.findOneAndUpdate(
      { _id: run.conversationId, status: { $in: ["analysing", "active"] } },
      { $set: { status: "active", updatedAt: now() } }
    );

    await db.audit_events.insertOne({
      _id: generateId("evt"),
      conversationId: run.conversationId,
      analysisRunId: run._id,
      actor: "system",
      action: "analysis.failed",
      detail: { reason: "INPUT_TIMEOUT", staleDurationHours: 24 },
      timestamp: now()
    });
  }
}
```

---

### ⚡ Edge Case 5.5 — User tries to send a message after conversation is closed

```
POST /api/v1/conversations/conv_01J7Xk9pQ3/messages
```

```json
{ "content": "Wait, I had one more question!" }
```

**Server-side:**

```javascript
const conv = await db.conversations.findOne({ _id: conversationId });
if (conv.status === "closed") {
  return {
    status: 403,
    body: {
      error: "CONVERSATION_CLOSED",
      message: "This conversation has been closed. Please start a new conversation.",
      artefactId: "art_Wn4rP7"  // reference to the completed artefact
    }
  };
}
```

---

## Phase 6: Failure & Retry — A Second `analysis_run` Is Created

> This phase demonstrates the **1 conversation → N analysis_runs** relationship. We rewind the scenario to the moment just after Phase 2 Step 2.5 (Sarah answered the single-select question) and show what happens when **run 1 fails** and **the user triggers a brand new run 2**.

### Alternate timeline setup

Assume the walkthrough diverges at **Step 2.6**. Instead of successfully asking a multi-select question, the LangGraph `decide_action` node makes an LLM call that fails repeatedly.

---

### Step 6.1 — Run 1 fails after retry exhaustion

The worker resumes the graph after Sarah's single-select answer. The `decide_action` node calls the LLM, which returns 529 three times in a row.

```javascript
// Worker — retry loop exhausted
// attempt 1: LLM 529 → retry after 2s
// attempt 2: LLM 529 → retry after 4s
// attempt 3: LLM 529 → max retries exceeded
```

Worker calls `handleRunFailure`:

**Database: UPDATE `analysis_runs` (run 1 → failed)**

```json
{
  "_id": "run_v9LkM3",
  "conversationId": "conv_01J7Xk9pQ3",
  "userId": "usr_42f",
  "runNumber": 1,
  "status": "failed",
  "idempotencyKey": "idem_client_a1b2c3",
  "triggerMessageSeq": 5,
  "snapshotRange": { "fromSeq": 1, "toSeq": 5 },
  "currentQuestion": {
    "messageId": "msg_006",
    "questionType": "single_select",
    "answeredAt": "2026-03-05T10:03:15.000Z"
  },
  "artefact": null,
  "error": {
    "code": "LLM_UNAVAILABLE",
    "message": "LLM service returned 529 after 3 retries",
    "retryable": true
  },
  "langGraphThreadId": "lg_thr_run_v9LkM3",
  "createdAt": "2026-03-05T10:02:00.000Z",
  "updatedAt": "2026-03-05T10:03:30.000Z",
  "completedAt": null,
  "durationMs": null
}
```

**Database: UPDATE `conversations` (back to active)**

```javascript
{ status: "analysing" } → { status: "active", updatedAt: "2026-03-05T10:03:30.000Z" }
```

**Database: INSERT into `audit_events`**

```json
{
  "_id": "evt_F00001",
  "conversationId": "conv_01J7Xk9pQ3",
  "analysisRunId": "run_v9LkM3",
  "actor": "system",
  "action": "analysis.failed",
  "detail": {
    "errorCode": "LLM_UNAVAILABLE",
    "retryAttempts": 3,
    "lastCheckpoint": "chk_step_3"
  },
  "timestamp": "2026-03-05T10:03:30.000Z"
}
```

**Real-time push to client (WebSocket):**

```json
{
  "event": "analysis.failed",
  "data": {
    "runId": "run_v9LkM3",
    "runNumber": 1,
    "message": "The analysis couldn't be completed due to a temporary issue. Please try again.",
    "canRetry": true
  }
}
```

**Current state:**

```
conversations.status     = "active"          ← user can interact again
analysis_runs (run 1)    = "failed"          ← terminal state, never touched again
messages                 = [msg_001 .. msg_007]  (includes the Q&A from run 1)
```

---

### Step 6.2 — User adds more context, then clicks "AI Analyse" again

Sarah sees the failure notification. She decides to add a bit more information before retrying.

```
POST /api/v1/conversations/conv_01J7Xk9pQ3/messages
```

```json
{ "content": "Oh, I should also mention I'm on a 4-day work week arrangement." }
```

**Database: INSERT into `messages`**

```json
{
  "_id": "msg_015",
  "conversationId": "conv_01J7Xk9pQ3",
  "seq": 8,
  "role": "user",
  "content": "Oh, I should also mention I'm on a 4-day work week arrangement.",
  "contentType": "text",
  "analysisRunId": null,
  "createdAt": "2026-03-05T10:10:00.000Z",
  "tokens": 14
}
```

> **Note:** `analysisRunId` is `null` — this message is not tied to any run yet. It's a regular conversation message. The conversation is `active`, so standard messaging rules apply.

Now Sarah clicks "AI Analyse":

```
POST /api/v1/conversations/conv_01J7Xk9pQ3/analyse
Authorization: Bearer <jwt>
X-Idempotency-Key: idem_client_x7y8z9       ← NEW key (new user action)
```

**Server-side logic — the trigger function runs again:**

```javascript
async function triggerAnalysis(conversationId, idempotencyKey, userId) {
  // 1. Idempotency check — no match (new key)
  const existingByKey = await db.analysis_runs.findOne({ idempotencyKey });
  // existingByKey = null ← new key, not a duplicate

  // 2. Check for free-text resume — no match (run 1 is "failed", not "awaiting_input")
  const awaitingRun = await db.analysis_runs.findOne({
    conversationId,
    status: "awaiting_input",
    "currentQuestion.questionType": "free_text"
  });
  // awaitingRun = null ← no active run awaiting input

  // 3. Proceed to create a NEW run (standard path)
  const conv = await db.conversations.findOneAndUpdate(
    { _id: conversationId, status: { $in: ["active"] } },   // ✓ matches
    { $set: { status: "analysing", updatedAt: now() } },
    { returnDocument: "after" }
  );

  // 4. Latest message seq
  const latestMsg = await db.messages
    .find({ conversationId })
    .sort({ seq: -1 })
    .limit(1)
    .next();
  // latestMsg.seq = 8 (the new message Sarah just sent)

  // 5. Count existing runs to compute runNumber
  const runCount = await db.analysis_runs.countDocuments({ conversationId });
  // runCount = 1 (the failed run_v9LkM3)

  // 6. Insert NEW analysis run
  const run = {
    _id: "run_Bq2wN8",                            // ← new run ID
    conversationId,
    userId,
    runNumber: runCount + 1,                        // ← runNumber: 2
    status: "pending",
    idempotencyKey: "idem_client_x7y8z9",          // ← new idempotency key
    triggerMessageSeq: 8,                           // ← includes Sarah's new message
    snapshotRange: { fromSeq: 1, toSeq: 8 },       // ← WIDER range than run 1
    currentQuestion: null,
    artefact: null,
    error: null,
    langGraphThreadId: "lg_thr_run_Bq2wN8",        // ← new LangGraph thread
    createdAt: now(),
    updatedAt: now(),
    completedAt: null,
    durationMs: null
  };
  await db.analysis_runs.insertOne(run);
  await jobQueue.enqueue({ runId: run._id, type: "analysis" });
  return { status: 201, body: run };
}
```

**Database: INSERT into `analysis_runs` (run 2)**

```json
{
  "_id": "run_Bq2wN8",
  "conversationId": "conv_01J7Xk9pQ3",
  "userId": "usr_42f",
  "runNumber": 2,
  "status": "pending",
  "idempotencyKey": "idem_client_x7y8z9",
  "triggerMessageSeq": 8,
  "snapshotRange": { "fromSeq": 1, "toSeq": 8 },
  "currentQuestion": null,
  "artefact": null,
  "error": null,
  "langGraphThreadId": "lg_thr_run_Bq2wN8",
  "createdAt": "2026-03-05T10:10:30.000Z",
  "updatedAt": "2026-03-05T10:10:30.000Z",
  "completedAt": null,
  "durationMs": null
}
```

**Key differences between run 1 and run 2:**

```
Field                  run_v9LkM3 (run 1)           run_Bq2wN8 (run 2)
─────────────────────  ──────────────────────────    ──────────────────────────
_id                    run_v9LkM3                    run_Bq2wN8
runNumber              1                             2
status                 failed                        pending
idempotencyKey         idem_client_a1b2c3            idem_client_x7y8z9
triggerMessageSeq      5                             8
snapshotRange          { fromSeq: 1, toSeq: 5 }     { fromSeq: 1, toSeq: 8 }
langGraphThreadId      lg_thr_run_v9LkM3             lg_thr_run_Bq2wN8
error                  { code: "LLM_UNAVAILABLE" }   null
```

> **Critical observation:** Run 2 gets a **fresh LangGraph thread** (`lg_thr_run_Bq2wN8`). It does NOT resume from run 1's checkpoints. This is intentional — run 1's graph state may be inconsistent due to the failure, and the wider snapshot range (1–8 vs 1–5) means run 2 has different input. Starting fresh is the safe choice.

**Database: UPDATE `conversations`**

```javascript
{ status: "active" } → { status: "analysing" }
```

**Database: INSERT into `audit_events`**

```json
{
  "_id": "evt_F00002",
  "conversationId": "conv_01J7Xk9pQ3",
  "analysisRunId": "run_Bq2wN8",
  "actor": "usr_42f",
  "action": "analysis.triggered",
  "detail": {
    "idempotencyKey": "idem_client_x7y8z9",
    "triggerMessageSeq": 8,
    "runNumber": 2,
    "previousRunId": "run_v9LkM3",
    "previousRunStatus": "failed"
  },
  "timestamp": "2026-03-05T10:10:30.000Z"
}
```

**API Response: `201 Created`**

```json
{
  "id": "run_Bq2wN8",
  "status": "pending",
  "runNumber": 2
}
```

---

### Step 6.3 — Worker picks up run 2, LangGraph starts fresh

```javascript
// Worker — same processAnalysisJob function as before
const run = await db.analysis_runs.findOneAndUpdate(
  { _id: "run_Bq2wN8", status: "pending" },
  { $set: { status: "running", updatedAt: now() } },
  { returnDocument: "after" }
);

// Load ALL messages in the wider snapshot range (1–8)
const messages = await db.messages
  .find({
    conversationId: run.conversationId,
    seq: { $gte: 1, $lte: 8 }
  })
  .sort({ seq: 1 })
  .toArray();
// Returns 8 messages: msg_001 through msg_007 + msg_015
// This includes the single-select Q&A from run 1 AND Sarah's new message
```

**What run 2's graph "sees" as input:**

```json
{
  "conversationId": "conv_01J7Xk9pQ3",
  "runId": "run_Bq2wN8",
  "messages": [
    { "seq": 1, "role": "user",      "content": "Hi, I'd like to find out..." },
    { "seq": 2, "role": "assistant",  "content": "Hello Sarah!..." },
    { "seq": 3, "role": "user",      "content": "I've been at Acme Corp for about 14 months." },
    { "seq": 4, "role": "user",      "content": "I'm a senior software engineer on the platform team." },
    { "seq": 5, "role": "assistant",  "content": "Great, thanks for sharing..." },
    { "seq": 6, "role": "assistant",  "content": "What type of employment contract are you on?",
      "questionMeta": { "questionType": "single_select", "..." : "..." } },
    { "seq": 7, "role": "user",      "content": "Fixed-term contract",
      "contentType": "single_select_response" },
    { "seq": 8, "role": "user",      "content": "Oh, I should also mention I'm on a 4-day work week arrangement." }
  ],
  "collectedAnswers": {},
  "pendingQuestion": null,
  "analysisResult": null
}
```

> **Note:** Run 2's `gather_context` node can see that a single-select question was asked and answered in messages 6–7 (from run 1). A well-designed prompt template will instruct the LLM to extract structured answers from prior Q&A, avoiding re-asking the same question.

**LangGraph — `decide_action` in run 2 recognises existing answers:**

```json
{
  "decision": "need_info",
  "reasoning": "Contract type already answered in conversation history (fixed-term, seq 7). 4-day work week noted (seq 8). Still need: benefit categories of interest. Asking as multi-select.",
  "extractedFromHistory": {
    "contractType": "fixed"
  },
  "questionToAsk": {
    "type": "multi_select",
    "text": "Which benefit categories would you like me to check? Select all that apply.",
    "options": [
      { "key": "parental_leave", "label": "Extended parental leave" },
      { "key": "health", "label": "Health & dental coverage" },
      { "key": "pension", "label": "Pension contributions" },
      { "key": "training", "label": "Training & development budget" }
    ]
  }
}
```

Graph interrupts → checkpoint saved under the **new** thread `lg_thr_run_Bq2wN8`.

**Database: INSERT into `langgraph_checkpoints`**

```json
{
  "_id": "chk_R2_001",
  "thread_id": "lg_thr_run_Bq2wN8",
  "checkpoint_id": "chk_r2_step_2",
  "parent_checkpoint_id": "chk_r2_step_1",
  "channel_values": {
    "messages": [ "... (all 8 messages)" ],
    "collectedAnswers": {
      "contractType": "fixed",
      "workPattern": "4-day week"
    },
    "pendingQuestion": {
      "type": "multi_select",
      "text": "Which benefit categories would you like me to check?...",
      "options": [ "... (4 options)" ]
    },
    "analysisResult": null
  },
  "metadata": {
    "step": 2,
    "node": "ask_question",
    "trace": {
      "model": "claude-sonnet-4-20250514",
      "inputTokens": 1920,
      "outputTokens": 195,
      "latencyMs": 1050
    }
  },
  "created_at": "2026-03-05T10:10:32.500Z"
}
```

**Database: INSERT into `messages`**

```json
{
  "_id": "msg_016",
  "conversationId": "conv_01J7Xk9pQ3",
  "seq": 9,
  "role": "assistant",
  "content": "Which benefit categories would you like me to check? Select all that apply.",
  "contentType": "text",
  "analysisRunId": "run_Bq2wN8",
  "questionMeta": {
    "questionType": "multi_select",
    "options": [
      { "key": "parental_leave", "label": "Extended parental leave" },
      { "key": "health", "label": "Health & dental coverage" },
      { "key": "pension", "label": "Pension contributions" },
      { "key": "training", "label": "Training & development budget" }
    ],
    "required": true
  },
  "createdAt": "2026-03-05T10:10:33.000Z",
  "tokens": 22
}
```

> **Note:** `msg_016.analysisRunId = "run_Bq2wN8"` — this question belongs to run 2, not run 1.

**Database: UPDATE `analysis_runs` (run 2)**

```javascript
{ _id: "run_Bq2wN8", status: "running" }
→ {
  status: "awaiting_input",
  currentQuestion: {
    messageId: "msg_016",
    questionType: "multi_select",
    answeredAt: null
  }
}
```

---

### Step 6.4 — User answers, run 2 proceeds to completion

Sarah answers the multi-select, and this time the LLM calls succeed. For brevity, the remaining flow mirrors Phases 3–4 from the original walkthrough: the graph asks a free-text question (msg_017), Sarah responds (msg_018, msg_019, msg_020), clicks "AI Analyse" to resume, the graph generates an artefact, and the conversation closes.

**Database: INSERT into `artefacts`**

```json
{
  "_id": "art_Jm7kR2",
  "conversationId": "conv_01J7Xk9pQ3",
  "analysisRunId": "run_Bq2wN8",
  "version": 1,
  "type": "eligibility_summary",
  "payload": {
    "eligible": true,
    "overallScore": 84,
    "categories": [
      {
        "name": "Extended parental leave",
        "eligible": true,
        "maxWeeks": 16,
        "details": "Fixed-term employees with 12+ months tenure qualify. Pro-rated for 4-day work pattern at 80% of full-time equivalent.",
        "factors": [
          { "name": "tenure", "value": "14 months", "meets_threshold": true },
          { "name": "contractType", "value": "fixed-term", "eligible": true },
          { "name": "workPattern", "value": "4-day week", "note": "Pro-rata applies" }
        ]
      },
      {
        "name": "Health & dental coverage",
        "eligible": true,
        "details": "Continues unchanged through approved leave period."
      }
    ],
    "nextSteps": [ "..." ],
    "disclaimers": [ "..." ]
  },
  "createdAt": "2026-03-05T10:16:45.000Z"
}
```

> **Note:** The artefact from run 2 has a **different `_id`** (`art_Jm7kR2` vs `art_Wn4rP7` from the original walkthrough) and references `run_Bq2wN8`. The `overallScore` is 84 instead of 87 — the 4-day work week information led to a slightly different pro-rata calculation.

**Database: UPDATE `analysis_runs` (run 2 → completed)**

```json
{
  "_id": "run_Bq2wN8",
  "status": "completed",
  "artefact": "art_Jm7kR2",
  "completedAt": "2026-03-05T10:16:45.000Z",
  "durationMs": 375000
}
```

**Database: UPDATE `conversations`**

```javascript
→ { status: "closed", closedAt: "2026-03-05T10:16:45.000Z" }
```

---

### Step 6.5 — Final state with both runs side by side

**`analysis_runs` — 2 documents for 1 conversation:**

```
Field                  run_v9LkM3 (run 1)           run_Bq2wN8 (run 2)
─────────────────────  ──────────────────────────    ──────────────────────────
_id                    run_v9LkM3                    run_Bq2wN8
runNumber              1                             2
status                 failed                        completed
idempotencyKey         idem_client_a1b2c3            idem_client_x7y8z9
triggerMessageSeq      5                             8
snapshotRange          { fromSeq: 1, toSeq: 5 }     { fromSeq: 1, toSeq: 8 }
langGraphThreadId      lg_thr_run_v9LkM3             lg_thr_run_Bq2wN8
currentQuestion        (single_select, answered)     (multi_select, answered)
artefact               null                          art_Jm7kR2
error                  { code: "LLM_UNAVAILABLE" }   null
completedAt            null                          2026-03-05T10:16:45.000Z
```

**`artefacts` — 1 document** (only run 2 produced one):

```
_id           analysisRunId   version   overallScore
────────────  ──────────────  ────────  ────────────
art_Jm7kR2    run_Bq2wN8     1         84
```

**`messages` — messages tagged by which run they belong to:**

```
seq  role       contentType               analysisRunId    context
───  ─────────  ────────────────────────  ───────────────  ──────────────────────────────
1    user       text                      null             Pre-analysis chat
2    assistant  text                      null             Pre-analysis chat
3    user       text                      null             Pre-analysis chat
4    user       text                      null             Pre-analysis chat
5    assistant  text                      null             Pre-analysis chat
6    assistant  text + questionMeta       run_v9LkM3       ← Run 1: single select question
7    user       single_select_response    run_v9LkM3       ← Run 1: answer
8    user       text                      null             Between runs (new context)
9    assistant  text + questionMeta       run_Bq2wN8       ← Run 2: multi select question
10   user       multi_select_response     run_Bq2wN8       ← Run 2: answer
11   assistant  text + questionMeta       run_Bq2wN8       ← Run 2: free text question
12   user       text                      run_Bq2wN8       ← Run 2: free text answer
13   user       text                      run_Bq2wN8       ← Run 2: free text answer
14   user       text                      run_Bq2wN8       ← Run 2: free text answer
15   assistant  text                      run_Bq2wN8       ← Run 2: completion message
```

**`langgraph_checkpoints` — two separate threads:**

```
thread_id                checkpoints     notes
───────────────────────  ──────────────  ─────────────────────────────────
lg_thr_run_v9LkM3       ~3 checkpoints  Run 1's graph state (orphaned, safe to GC)
lg_thr_run_Bq2wN8       ~6 checkpoints  Run 2's graph state (complete history)
```

**`audit_events` — interleaved trail showing both runs:**

```
#   action                         analysisRunId  actor    timestamp
──  ─────────────────────────────  ─────────────  ───────  ──────────────
1   conversation.created           null           usr_42f  10:00:00
2   message.created (seq 1)        null           usr_42f  10:00:12
..  ... (messages 2–5)             ...            ...      ...
7   analysis.triggered             run_v9LkM3     usr_42f  10:02:00  ← Run 1 starts
8   analysis.running               run_v9LkM3     system   10:02:01
9   analysis.question_asked (SS)   run_v9LkM3     ai       10:02:03
10  analysis.answer_received (SS)  run_v9LkM3     usr_42f  10:03:15
11  analysis.failed                run_v9LkM3     system   10:03:30  ← Run 1 fails
12  message.created (seq 8)        null           usr_42f  10:10:00  ← user adds context
13  analysis.triggered             run_Bq2wN8     usr_42f  10:10:30  ← Run 2 starts
14  analysis.running               run_Bq2wN8     system   10:10:31
15  analysis.question_asked (MS)   run_Bq2wN8     ai       10:10:33
16  analysis.answer_received (MS)  run_Bq2wN8     usr_42f  10:11:00
17  analysis.question_asked (FT)   run_Bq2wN8     ai       10:11:02
18  analysis.answer_received (FT)  run_Bq2wN8     usr_42f  10:15:00
19  analysis.completed             run_Bq2wN8     system   10:16:45  ← Run 2 succeeds
20  conversation.closed            run_Bq2wN8     system   10:16:45
```

---

### Querying runs for a conversation

The API endpoint for listing runs returns both, most recent first:

```
GET /api/v1/conversations/conv_01J7Xk9pQ3/analysis-runs
```

```javascript
// Uses index: { conversationId: 1, status: 1, createdAt: -1 }
const runs = await db.analysis_runs
  .find({ conversationId: "conv_01J7Xk9pQ3" })
  .sort({ createdAt: -1 })
  .toArray();
```

**API Response: `200 OK`**

```json
{
  "conversationId": "conv_01J7Xk9pQ3",
  "runs": [
    {
      "id": "run_Bq2wN8",
      "runNumber": 2,
      "status": "completed",
      "snapshotRange": { "fromSeq": 1, "toSeq": 8 },
      "artefactId": "art_Jm7kR2",
      "createdAt": "2026-03-05T10:10:30.000Z",
      "completedAt": "2026-03-05T10:16:45.000Z",
      "durationMs": 375000,
      "error": null
    },
    {
      "id": "run_v9LkM3",
      "runNumber": 1,
      "status": "failed",
      "snapshotRange": { "fromSeq": 1, "toSeq": 5 },
      "artefactId": null,
      "createdAt": "2026-03-05T10:02:00.000Z",
      "completedAt": null,
      "durationMs": null,
      "error": {
        "code": "LLM_UNAVAILABLE",
        "message": "LLM service returned 529 after 3 retries",
        "retryable": true
      }
    }
  ]
}
```

This gives the client (and internal dashboards) full visibility into every analysis attempt — what was tried, what failed, what succeeded, and over which message window.

---

## Final State Summary

After the complete flow, here is the state of every collection:

### `conversations` — 1 document

```json
{
  "_id": "conv_01J7Xk9pQ3",
  "orgId": "org_abc",
  "userId": "usr_42f",
  "title": "Benefits eligibility enquiry",
  "status": "closed",
  "messageCount": 15,
  "createdAt": "2026-03-05T10:00:00.000Z",
  "updatedAt": "2026-03-05T10:16:45.000Z",
  "closedAt": "2026-03-05T10:16:45.000Z",
  "ttlExpiresAt": "2026-06-03T10:16:45.000Z"
}
```

### `messages` — 15 documents

```
seq  role       contentType               analysisRunId    summary
───  ─────────  ────────────────────────  ───────────────  ──────────────────────────────
1    user       text                      null             "Hi, I'd like to find out..."
2    assistant  text                      null             "Hello Sarah!..."
3    user       text                      null             "I've been at Acme Corp..."
4    user       text                      null             "I'm a senior software eng..."
5    assistant  text                      null             "Great, thanks for sharing..."
6    assistant  text + questionMeta       run_v9LkM3       Run 1: Single select question
7    user       single_select_response    run_v9LkM3       Run 1: "Fixed-term contract"
8    user       text                      null             (between runs) "4-day work week"
9    assistant  text + questionMeta       run_Bq2wN8       Run 2: Multi select question
10   user       multi_select_response     run_Bq2wN8       Run 2: "parental_leave, health"
11   assistant  text + questionMeta       run_Bq2wN8       Run 2: Free text question
12   user       text                      run_Bq2wN8       Run 2: "My due date is Aug 15th..."
13   user       text                      run_Bq2wN8       Run 2: "My partner works at..."
14   user       text                      run_Bq2wN8       Run 2: "I haven't taken any..."
15   assistant  text                      run_Bq2wN8       Run 2: "I've completed the analysis..."
```

### `analysis_runs` — 2 documents

```json
[
  {
    "_id": "run_v9LkM3",
    "runNumber": 1,
    "status": "failed",
    "snapshotRange": { "fromSeq": 1, "toSeq": 5 },
    "artefact": null,
    "error": { "code": "LLM_UNAVAILABLE" }
  },
  {
    "_id": "run_Bq2wN8",
    "runNumber": 2,
    "status": "completed",
    "snapshotRange": { "fromSeq": 1, "toSeq": 8 },
    "artefact": "art_Jm7kR2",
    "durationMs": 375000,
    "completedAt": "2026-03-05T10:16:45.000Z"
  }
]
```

### `artefacts` — 1 document (only run 2 succeeded)

```json
{
  "_id": "art_Jm7kR2",
  "type": "eligibility_summary",
  "analysisRunId": "run_Bq2wN8",
  "payload": { "eligible": true, "overallScore": 84, "..." : "..." }
}
```

### `audit_events` — 20 documents

```
#   action                         analysisRunId  actor    timestamp
──  ─────────────────────────────  ─────────────  ───────  ──────────────
1   conversation.created           null           usr_42f  10:00:00
2–6 message.created (seq 1–5)     null           mixed    10:00–10:01
7   analysis.triggered             run_v9LkM3     usr_42f  10:02:00
8   analysis.running               run_v9LkM3     system   10:02:01
9   analysis.question_asked (SS)   run_v9LkM3     ai       10:02:03
10  analysis.answer_received (SS)  run_v9LkM3     usr_42f  10:03:15
11  analysis.failed                run_v9LkM3     system   10:03:30
12  message.created (seq 8)        null           usr_42f  10:10:00
13  analysis.triggered             run_Bq2wN8     usr_42f  10:10:30
14  analysis.running               run_Bq2wN8     system   10:10:31
15  analysis.question_asked (MS)   run_Bq2wN8     ai       10:10:33
16  analysis.answer_received (MS)  run_Bq2wN8     usr_42f  10:11:00
17  analysis.question_asked (FT)   run_Bq2wN8     ai       10:11:02
18  analysis.answer_received (FT)  run_Bq2wN8     usr_42f  10:15:00
19  analysis.completed             run_Bq2wN8     system   10:16:45
20  conversation.closed            run_Bq2wN8     system   10:16:45
```

### `langgraph_checkpoints` — ~9 documents across 2 threads

```
thread_id                checkpoints     status
───────────────────────  ──────────────  ─────────────────────────
lg_thr_run_v9LkM3       ~3 checkpoints  Orphaned (run 1 failed)
lg_thr_run_Bq2wN8       ~6 checkpoints  Complete (run 2 succeeded)
```

---

## API Summary

| # | Method | Endpoint | Purpose | Key response |
|---|--------|----------|---------|-------------|
| 1 | `POST` | `/api/v1/conversations` | Create conversation | `201` + conv id |
| 2 | `POST` | `/api/v1/conversations/:id/messages` | Send message | `201` + message |
| 3 | `GET` | `/api/v1/conversations/:id/messages?after=seq&limit=50` | Paginate messages | `200` + message array |
| 4 | `POST` | `/api/v1/conversations/:id/analyse` | Trigger / resume analysis | `201` (new) or `200` (idempotent / resume) |
| 5 | `GET` | `/api/v1/conversations/:id/analysis-runs` | List all runs | `200` + run array |
| 6 | `GET` | `/api/v1/conversations/:id/analysis-runs/:runId` | Get run status | `200` + run detail |
| 7 | `GET` | `/api/v1/artefacts/:id` | Get artefact | `200` + artefact |
| 8 | `GET` | `/api/v1/conversations/:id/audit` | Get audit trail | `200` + event array |
| 9 | WebSocket | `/ws/conversations/:id` | Real-time updates | Push events |
