# PortfolioPulse — Architecture Overview

An AI-powered portfolio builder for UK medical trainees (primarily GPs). A conversational AI bot guides users through capturing clinical experiences and producing structured, submission-ready portfolio entries.

---

## What the AI Bot Does

The bot turns spoken or typed clinical experiences into formal portfolio entries through a multi-step, human-in-the-loop pipeline:

1. **Capture** — User dictates or types a clinical experience (e.g. a patient encounter).
2. **Transcribe & Clean** — Audio is transcribed (AssemblyAI) with automatic PII redaction, then an LLM fixes medical terminology and removes filler words.
3. **Classify** — AI suggests an entry type ("Case Review", "Teaching Session", etc.) with confidence scores. The user confirms or picks an alternative.
4. **Check Completeness & Follow Up** — AI identifies missing sections and asks targeted follow-up questions (up to 2 rounds).
5. **Tag Capabilities** — AI maps the experience to demonstrated curriculum competencies (e.g. "C-06: Effective Prescribing"). The user confirms.
6. **Reflect** — AI generates a structured, portfolio-ready reflection matching specialty templates.
7. **Generate PDP Goals** — AI creates 1–2 SMART development goals with actionable steps.
8. **Review & Finalise** — User reviews, edits, and finalises the entry.

---

## Tech Stack

### LangGraph — AI State Machine

The core intelligence is a LangGraph state machine, not simple prompt chaining. It defines a directed graph of processing nodes.

The entry type is **chosen by the trainee at artefact creation** and seeded into state at
start, so there is nothing to classify — the graph opens straight into the elicitation loop.

```
START
  → gather_context
  → check_completeness
    ├─ (not a portfolio entry, first pass only) → reject_entry   [INTERRUPT — terminal] → END
    ├─ (gaps remain) → generate_followup → ask_followup  [INTERRUPT] → gather_context  (loop)
    └─ (rubric met / exhausted) → tag_capabilities
  → present_capabilities      [INTERRUPT — user confirms capabilities]
    ├─ (no capabilities confirmed) → END
    └─ elicit_justification → reflect → refine → generate_pdp → save → END
```

Key properties:

- **3 interrupt points** where the graph pauses and writes a message. Two are questions
  (`ask_followup`, `present_capabilities`) and resume from exactly that checkpoint when the
  user responds. The third, `reject_entry`, is **terminal** — it presents no answerable
  question and the API refuses to resume it, so the run ends there and the trainee starts a
  new conversation.
- **Looping** — follow-up questions loop back to `gather_context` to incorporate new
  information. The round cap is derived per run (`maxFollowupRounds` = askable probes ×
  `ATTEMPT_LIMIT`), not a fixed number.
- **Two paths produce no entry** — a first-pass irrelevance verdict (`reject_entry`) and a
  run that confirms no capabilities. Both are enforced by the topology rather than by guards
  in downstream nodes.
- **Checkpoint persistence** — graph state is snapshotted to MongoDB after every node, so it survives crashes and can be inspected or replayed.

### MongoDB — Persistence & Checkpointing

- Stores all domain data: conversations, messages, artefacts (portfolio entries), capabilities, PDP goals.
- Acts as the LangGraph checkpoint store — graph state snapshots are persisted per conversation.
- Supports transactions for atomic multi-document operations (e.g. creating a message and queuing an analysis job together).

### LLM Backbone

- All LLM calls use **structured outputs** via Zod schemas — responses are type-safe by design, no parsing needed.
- The model per stage is **not fixed**: `LLM_VARIANT` selects a provider mix, resolved through
  per-pool credentials and rate limits (`llm/llm-pools.ts`, `llm/model-variants.ts`).
- Temperature is set per stage in `STAGE_POLICY` (`llm/llm-stage-policy.ts`) — broadly 0.1 for
  extraction and grading, 0.3 for generative stages, 0 for `refine`.

> The authoritative, source-verified stage → model / temperature / schema map is
> [docs/llm/llm-pipeline-stages.md](llm/llm-pipeline-stages.md). It is deliberately not
> duplicated here — the table that used to sit in this section drifted from the code.

### AssemblyAI — Audio Transcription

- Universal-3 Pro model with UK English and medical terminology prompts.
- **Automatic PII redaction** — names, NHS numbers, dates, and locations are stripped before any LLM processing.
- Returns confidence scores, word counts, and duration metadata.

### NestJS — Backend API

- REST API with JWT authentication, role-based guards, and Zod request validation.
- **Outbox pattern** for durable async execution — analysis jobs are queued in MongoDB and polled every 1 second. Jobs survive crashes and support retries.
- **Result pattern** — repository methods return `Result<T, DBError>` (never throw). Services translate DB errors to HTTP exceptions.
- Three-stage message pipeline: `rawContent` (original) → `cleanedContent` (post-processing) → `content` (final display).

### Expo / React Native — Mobile App

- Redux Toolkit for state management (9 slices).
- **Polling-based real-time updates** — interval varies by phase (2s during analysis, 10s when awaiting input).
- Inline question UI: single-select, multi-select, and free-text rendered inside chat message bubbles.
- Optimistic messaging with retry and client-generated idempotency keys.

### Shared Packages

- **`packages/shared`** — Zod schemas, DTOs, enums, and types shared between API and mobile.
- **`packages/api-client`** — Typed HTTP client with adapter pattern, platform-agnostic via fetch.

---

## Key Architectural Patterns

### Message Processing Pipeline

Every message goes through three content stages:

| Stage          | Audio                                                        | Text                     |
| -------------- | ------------------------------------------------------------ | ------------------------ |
| `rawContent`   | AssemblyAI transcript (may have fillers, spelling errors)    | User's typed text as-is  |
| `cleanedContent` | LLM fixes medical terminology, removes filler words       | LLM cleaned              |
| `content`      | Final for display                                            | Final for display        |

Processing is async — audio messages transition through statuses: `PENDING → TRANSCRIBING → CLEANING → COMPLETE`.

### Outbox Pattern

Instead of immediately running the graph, the system queues work reliably:

1. User taps "Continue Analysis".
2. `OutboxService` creates a job atomically within the same transaction as the message.
3. `OutboxConsumer` polls every `DEFAULT_POLL_INTERVAL_MS` (100ms), running at most `MAX_CONCURRENCY` (5) jobs concurrently, locks the job, and invokes the appropriate handler (`AnalysisStartHandler` or `AnalysisResumeHandler`).
4. Job is marked completed or failed (with retry). A claimed job holds its lock for `DEFAULT_LOCK_DURATION_MS` (`outbox.service.ts`, currently 10 minutes); `resetStaleLocks()` frees only entries whose `lockedUntil` has passed, so the crash-recovery delay *is* the lock duration.

This ensures no lost jobs on crash and safe retries via idempotency.

### Result Pattern

All repository methods return `Result<T, DBError>` — they never throw. Services check `isErr()` and translate to NestJS exceptions (`NotFoundException`, etc.). Controllers never see DB errors directly.

### ID Strategy

- **xid** (21-char nanoid): used in all API routes and responses (public-facing).
- **_id** (MongoDB ObjectId): used internally for relations and repository queries.
- Services convert xid → _id for lookups. Responses always return xid, never _id.

### ConversationContext

A single API response that tells the mobile app exactly what to render:

```typescript
{
  artefactId: string,
  actions: { sendMessage, sendAudio, startAnalysis, resumeAnalysis },
  phase: "composing" | "analysing" | "awaiting_input" | "completed" | "closed",
  activeQuestion?: { messageId, questionType },
  analysisRun?: { id, status, thinkingReason }
}
```

The mobile app uses this to determine enabled buttons, polling intervals, question UI, and thinking-step display.

---

## Monorepo Structure

```
apps/
  api/          — NestJS backend (MongoDB, LangGraph, LLM, AssemblyAI)
  mobile/       — Expo / React Native mobile app
  web/          — Vite / React / Mantine web app
packages/
  shared/       — Zod schemas, DTOs, enums, types
  api-client/   — Typed HTTP client (adapter pattern)
```

Build tool: **Turborepo** with **pnpm** workspaces.

---

## Data Flow (Happy Path)

1. User picks an **entry type** and `POST /artefacts` creates the artefact. The type is
   validated against the specialty config here (`isValidEntryType`) and persisted as
   `artefact.artefactType` — this is the only place it is ever set.
2. User sends a message → message created (`PENDING`).
3. `ProcessingService` runs async → audio transcribed and cleaned → message `COMPLETE`.
4. User taps "Continue Analysis" → `OutboxService` enqueues `analysis.start` job.
5. `OutboxConsumer` picks up job → `PortfolioGraphService.startGraph()`, seeding the stored
   entry type into graph state.
6. Graph runs → `gather_context` → `check_completeness` → `generate_followup` →
   `ask_followup` (pauses, writes assistant message with free-text prompts).
7. Mobile polls → gets assistant message + `ConversationContext` with `activeQuestion`.
8. User answers → API calls `resumeGraph()` → loops back to `gather_context` until the rubric
   is met, the probes are exhausted, or the round cap is hit.
9. `tag_capabilities` → `present_capabilities` (pauses) → user confirms capabilities.
10. Graph continues → `elicit_justification` → `reflect` → `refine` → `generate_pdp` → `save`.
11. `AnalysisRun` → `COMPLETED` → mobile switches to "Entry ready for review".
