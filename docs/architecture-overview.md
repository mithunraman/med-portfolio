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

The core intelligence is a LangGraph state machine, not simple prompt chaining. It defines a directed graph of processing nodes:

```
START
  → gather_context
  → classify
  → present_classification   [INTERRUPT — user picks entry type]
  → check_completeness
    ├─ (missing sections) → ask_followup → gather_context  (loop, max 2 rounds)
    └─ (complete) → tag_capabilities
  → present_capabilities      [INTERRUPT — user confirms capabilities]
  → reflect
  → generate_pdp
  → save
  → END
```

Key properties:

- **3 interrupt points** where the graph pauses, writes a question message, and waits for the user's decision. When the user responds, the graph resumes from exactly that checkpoint.
- **Looping** — follow-up questions loop back to `gather_context` to incorporate new information, up to 2 rounds.
- **Checkpoint persistence** — graph state is snapshotted to MongoDB after every node, so it survives crashes and can be inspected or replayed.

### MongoDB — Persistence & Checkpointing

- Stores all domain data: conversations, messages, artefacts (portfolio entries), capabilities, PDP goals.
- Acts as the LangGraph checkpoint store — graph state snapshots are persisted per conversation.
- Supports transactions for atomic multi-document operations (e.g. creating a message and queuing an analysis job together).

### OpenAI GPT-4.1 — LLM Backbone

- All LLM calls use **structured outputs** via Zod schemas — responses are type-safe by design, no parsing needed.
- Different temperatures per task: 0.1 for classification (deterministic), 0.4 for reflection writing (creative).
- Confidence scores are calibrated down for short transcripts or weak signals to counter LLM overconfidence.

| Node              | Temperature | Purpose                           |
| ----------------- | ----------- | --------------------------------- |
| Classify          | 0.1         | Entry type (deterministic)        |
| CheckCompleteness | 0.1         | Section coverage (deterministic)  |
| AskFollowup       | 0.3         | Question generation (constrained) |
| TagCapabilities   | 0.1         | Capability extraction             |
| Reflect           | 0.4         | Reflection writing (creative)     |
| GeneratePDP       | 0.2         | Goal generation                   |

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
3. `OutboxConsumer` polls every 1s (batch size 5), locks the job, and invokes the appropriate handler (`AnalysisStartHandler` or `AnalysisResumeHandler`).
4. Job is marked completed or failed (with retry). Stale locks reset after 30s.

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

1. User sends a message → message created (`PENDING`).
2. `ProcessingService` runs async → audio transcribed and cleaned → message `COMPLETE`.
3. User taps "Continue Analysis" → `OutboxService` enqueues `analysis.start` job.
4. `OutboxConsumer` picks up job → `PortfolioGraphService.startGraph()`.
5. Graph runs → `classify` → `present_classification` (pauses, writes assistant message with options).
6. Mobile polls → gets assistant message + `ConversationContext` with `activeQuestion`.
7. User selects entry type → API calls `resumeGraph()` with the selection.
8. Graph resumes → `check_completeness` → `ask_followup` (if missing sections) or `tag_capabilities`.
9. Loop repeats for follow-ups, then capabilities confirmation.
10. Graph continues → `reflect` → `generate_pdp` → `save`.
11. `AnalysisRun` → `COMPLETED` → mobile switches to "Entry ready for review".
