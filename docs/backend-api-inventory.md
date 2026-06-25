# Backend API Repository Inventory

> Repo-wide structural map of the NestJS backend (`apps/api`). Generated from a full scan of `src/**`, root config, and operational files.
> **Note:** The backend is not yet deployed — there are no Docker, CI/CD, Kubernetes, or migration/seed files anywhere in the repo.

## 1. High-level architecture summary

**Application:** A NestJS backend (`apps/api`) in a pnpm/Turborepo monorepo, serving a medical-training portfolio product. All routes are prefixed `/api`.

**Entry points & bootstrap:**
- [src/main.ts](../apps/api/src/main.ts) — bootstrap. Loads `instrument.ts` (Sentry) then `tracing.ts` (OpenTelemetry) **before** `NestFactory`. Configures helmet, whitelist CORS, global `ZodValidationPipe`, `/api` prefix, trust-proxy hops, graceful shutdown (SIGTERM/SIGINT, 2 s force-exit). Dev-only 1 s latency simulation.
- [src/app.module.ts](../apps/api/src/app.module.ts) — root module wiring config, database, metrics, event-emitter, schedule, throttler, pino logger, and **global providers**: `SentryGlobalFilter`, `ThrottlerGuard`, `JwtAuthGuard`, `RolesGuard`, `QuotaGuard`, `DevOnlyGuard`, `QuotaInterceptor`.

**Module organization:** ~28 feature/infra modules under `src/`. Feature modules follow a strict layered pattern: **Controller → Service → Repository (interface + impl) → Mongoose Schema**, with Zod DTOs and dedicated `mappers/` for DTO transformation.

**Database/persistence:** MongoDB via Mongoose. All repositories return a `Result<T, DBError>` (never throw); services translate to NestJS exceptions. External id (`xid`, 21-char nanoid) is exposed; internal `_id` never leaves the persistence layer. Ownership predicates (`userId`) are enforced in the repository filter (defence-in-depth). `TransactionService` wraps multi-doc writes with exponential-backoff retry on transient transaction errors.

**Major infrastructure patterns:**
- **LangGraph state machine** (`portfolio-graph`) — 14-node AI analysis graph, MongoDB-checkpointed, with 4 interrupt points.
- **Transactional outbox** (`outbox`) — in-process 500 ms poller, batch of 5, 10-min locks, exponential-backoff retries, drives async graph analysis & message processing.
- **Quota** — dual-window (4 h rolling + weekly fixed) rate limiting via guard + interceptor.
- **Soft-delete tombstones** + entity-agnostic version history with snapshot-before-edit.
- **Scheduled cron** — daily account cleanup (anonymization) and hourly orphaned-media sweeper.

**Cross-cutting concerns:** JWT/Passport auth with refresh-token rotation & replay detection; Zod validation everywhere; Sentry error capture; OpenTelemetry traces/metrics → OTLP; pino structured logging with request correlation; PII redaction pipeline for transcribed audio.

---

## 2. Module-by-module inventory

### Module: `artefacts`

**Purpose:** Core domain — CRUD and lifecycle of portfolio artefacts (entries), including reviews, notes, status transitions, finalisation, duplication, and version history.

**Module file(s):**

| File | Purpose |
| ---- | ------- |
| [artefacts.module.ts](../apps/api/src/artefacts/artefacts.module.ts) | Registers schema, repo, service; exports `ArtefactsService`, `ARTEFACTS_REPOSITORY`. Imports Media, Conversations (forwardRef), AnalysisRuns, VersionHistory, PdpGoals, Outbox (forwardRef) |

**Controllers:**

| File | Controller | Main routes/responsibilities |
| ---- | ---------- | ---------------------------- |
| [artefacts.controller.ts](../apps/api/src/artefacts/artefacts.controller.ts) | `ArtefactsController` | POST `/`, DELETE `/:id`, GET `/`, GET `/:id`, PATCH `/:id`, PUT `/:id/review`, PUT `/:id/notes`, PUT `/:id/status`, POST `/:id/finalise`, POST `/:id/duplicate`, GET `/:id/versions`, POST `/:id/versions/restore` → `ArtefactsService` |

**Services:**

| File | Service | Responsibility |
| ---- | ------- | -------------- |
| [artefacts.service.ts](../apps/api/src/artefacts/artefacts.service.ts) | `ArtefactsService` | Artefact lifecycle, quota/guest-limit enforcement, transactions, emits `ARTEFACT_STATE_CHANGED`. Uses ArtefactsRepository, ConversationsRepository, PdpGoalsRepository, VersionHistoryService, ConversationsService, AnalysisRunsService, EventEmitter2 |

**Repositories / Data access:**

| File | Class | Responsibility |
| ---- | ---------------------------- | -------------- |
| [artefacts.repository.ts](../apps/api/src/artefacts/artefacts.repository.ts) | `ArtefactsRepository` | CRUD, status filtering, tombstone, version tracking; `ARTEFACT_LIVE_FILTER` excludes DELETED |
| [artefacts.repository.interface.ts](../apps/api/src/artefacts/artefacts.repository.interface.ts) | `IArtefactsRepository`, `ARTEFACTS_REPOSITORY` | Contract + data types |

**Mongoose Models / Schemas:**

| File | Model/Schema | Collection | Purpose |
| ---- | ------------ | ---------- | ------- |
| [schemas/artefact.schema.ts](../apps/api/src/artefacts/schemas/artefact.schema.ts) | `Artefact` (+ embedded `Capability`, `ComposedSection`, `Completeness`, `ArtefactReview`, `Note`) | `artefacts` | xid (unique), composite `artefactId` (`{userId}_{clientId}`), specialty, trainingStage, status, capabilities, completeness, readinessScore, composedDocument, review, notes |

**DTOs / Validators:** [dto/](../apps/api/src/artefacts/dto/) — `CreateArtefactDto`, `EditArtefactDto`, `FinaliseArtefactDto`, `ListArtefactsDto`, `RestoreArtefactVersionDto`, `UpdateArtefactStatusDto`, `UpdateNotesDto`, `UpsertArtefactReviewDto` (all Zod, wrapping `@acme/shared` schemas).

**Utilities / Helpers:**

| File | Name | Purpose |
| ---- | ---- | ------- |
| [mappers/artefact.mapper.ts](../apps/api/src/artefacts/mappers/artefact.mapper.ts) | `toArtefactDto`, `toActiveConversationDto` | Schema → client DTO |
| [utils/artefact-id.util.ts](../apps/api/src/artefacts/utils/artefact-id.util.ts) | `extractArtefactClientId`, `createInternalArtefactId` | Composite-id parse/build |
| [utils/notes-reconcile.util.ts](../apps/api/src/artefacts/utils/notes-reconcile.util.ts) | `reconcileNotes` | Reconciles incoming notes against persisted state, server-mints xids |

**Tests:** `__tests__/` — `artefacts.service.spec.ts`, `artefacts.repository.integration.spec.ts`, `notes-reconcile.spec.ts`, `tombstone.spec.ts`, `update-notes.schema.spec.ts`.

**Dependencies:** Controller → ArtefactsService → repositories + VersionHistoryService + ConversationsService + AnalysisRunsService. Emits `ARTEFACT_STATE_CHANGED` (consumed by review-periods). Participates in transactions, quota (guest limit), outbox (forwardRef).

---

### Module: `conversations`

**Purpose:** Message lifecycle (send/edit/delete/list), triggering AI analysis, and computing the `ConversationContext` that drives mobile UI state.

**Module file(s):** [conversations.module.ts](../apps/api/src/conversations/conversations.module.ts) — exports `ConversationsService`, `ConversationContextService`, `CONVERSATIONS_REPOSITORY`. Imports Media, Artefacts (forwardRef), AnalysisRuns, PdpGoals, Outbox (forwardRef), PortfolioGraph (forwardRef).

**Controllers:**

| File | Controller | Main routes |
| ---- | ---------- | ----------- |
| [conversations.controller.ts](../apps/api/src/conversations/conversations.controller.ts) | `ConversationsController` | DELETE `/:cid/messages/:mid` (204), PATCH `/:cid/messages/:mid`, POST `/:cid/messages` (quota: `message`), POST `/:cid/analysis` (quota: `analysis`), GET `/:cid/messages` |

**Services:**

| File | Service | Responsibility |
| ---- | ------- | -------------- |
| [conversations.service.ts](../apps/api/src/conversations/conversations.service.ts) | `ConversationsService` | Message lifecycle, analysis triggering via outbox, `assertModifiableUserMessage` guard ladder. Uses ConversationsRepository, ArtefactsRepository, MediaRepository/Service, TransactionService, PortfolioGraphService, AnalysisRunsService, OutboxService, ConversationContextService |
| [conversation-context.service.ts](../apps/api/src/conversations/conversation-context.service.ts) | `ConversationContextService` | Builds `ConversationContext` DTO from conversation/artefact/analysis/outbox state |

**Repositories:** [conversations.repository.ts](../apps/api/src/conversations/conversations.repository.ts) (`ConversationsRepository`, tombstones conversation + message) + [interface](../apps/api/src/conversations/conversations.repository.interface.ts).

**Mongoose Models:**

| File | Model | Collection | Purpose |
| ---- | ----- | ---------- | ------- |
| [schemas/conversation.schema.ts](../apps/api/src/conversations/schemas/conversation.schema.ts) | `Conversation` | `conversations` | xid, userId, artefact ref, status (ACTIVE/CLOSED/DELETED) |
| [schemas/message.schema.ts](../apps/api/src/conversations/schemas/message.schema.ts) | `Message` | `messages` | xid, role, rawContent→cleanedContent→content pipeline, media ref, Q&A data, transcription metadata, `idempotencyKey` (unique/user), `editedAt` |

**DTOs:** `SendMessageDto`, `EditMessageDto`, `AnalysisActionPipe` (custom Zod transform pipe). **Mapper:** [message.mapper.ts](../apps/api/src/conversations/mappers/message.mapper.ts).

**Tests:** 8 specs + `helpers/` (test-setup, factories, llm-mock) — incl. `conversations.integration.spec.ts`, `arcp-readiness.integration.spec.ts`, delete/edit-message specs, `conversation-context.service.spec.ts`, `tombstone.spec.ts`.

**Dependencies:** Heavy hub — bridges artefacts, media, analysis-runs, portfolio-graph, outbox. Enqueues outbox entries for async graph analysis.

---

### Module: `items`

**Purpose:** Generic CRUD module (appears to be a template/example resource — isolated, no cross-module imports). **Note:** purpose is somewhat **Unclear** as a product feature; it's a clean reference CRUD slice with no domain ties.

| Layer | File / detail |
| ---- | ---- |
| Module | [items.module.ts](../apps/api/src/items/items.module.ts) — exports `ItemsService`, `ITEMS_REPOSITORY` |
| Controller | [items.controller.ts](../apps/api/src/items/items.controller.ts) — POST `/`, GET `/`, GET `/:id`, PATCH `/:id`, PATCH `/:id/status`, DELETE `/:id` |
| Service | [items.service.ts](../apps/api/src/items/items.service.ts) — Result-unwrapping + mapping |
| Repository | [items.repository.ts](../apps/api/src/items/items.repository.ts) + [interface](../apps/api/src/items/items.repository.interface.ts) |
| Schema | [schemas/item.schema.ts](../apps/api/src/items/schemas/item.schema.ts) — `Item` (`items`): userId, name, description, status; indexes (userId,status), (userId,createdAt) |
| DTOs | `CreateItemDto`, `UpdateItemDto`, `UpdateItemStatusDto`, `ListItemsDto` (page/limit) |
| Mapper | [item.mapper.ts](../apps/api/src/items/mappers/item.mapper.ts) |

No tests. No cross-module dependencies.

---

### Module: `media`

**Purpose:** Media upload workflow — presigned S3/R2 URLs, validation, and orphaned-media garbage collection.

| Layer | File / detail |
| ---- | ---- |
| Module | [media.module.ts](../apps/api/src/media/media.module.ts) — imports Database, Storage; exports `MediaService`, `MEDIA_REPOSITORY` |
| Controller | [media.controller.ts](../apps/api/src/media/media.controller.ts) — POST `/media/initiate` (quota: `upload`), GET `/:mediaId` |
| Service | [media.service.ts](../apps/api/src/media/media.service.ts) — presigned URLs (1 h), validates ≤100 MB; uses StorageService + MediaRepository |
| **Cron** | [media-sweeper.service.ts](../apps/api/src/media/media-sweeper.service.ts) — `@Cron('0 0 * * * *')` hourly; sweeps orphaned/pending-delete media, dead-letters after 24 failed attempts |
| Repository | [media.repository.ts](../apps/api/src/media/media.repository.ts) + [interface](../apps/api/src/media/media.repository.interface.ts) |
| Schema | [schemas/media.schema.ts](../apps/api/src/media/schemas/media.schema.ts) — `Media` (`media`): xid, bucket, key, status, polymorphic `refCollection`+`refDocumentId`, mediaType, sizeBytes, durationMs |
| DTO | `InitiateUploadDto` |
| Tests | `media.service.spec.ts`, `media.repository.integration.spec.ts`, `media-sweeper.service.spec.ts` |

---

### Module: `dashboard`

**Purpose:** Read-only aggregation of dashboard data for a user.

| Layer | File / detail |
| ---- | ---- |
| Module | [dashboard.module.ts](../apps/api/src/dashboard/dashboard.module.ts) — imports Artefacts, PdpGoals, ReviewPeriods |
| Service | [dashboard.service.ts](../apps/api/src/dashboard/dashboard.service.ts) — aggregates recent artefacts (5), active PDP goals (due ≤30 d), goal count, active review-period coverage summary |

No controller of its own (consumed by `init`). No schema/repo.

---

### Module: `llm`

**Purpose:** Abstraction over OpenAI (structured outputs via LangChain) and AssemblyAI transcription.

| Layer | File / detail |
| ---- | ---- |
| Module | [llm.module.ts](../apps/api/src/llm/llm.module.ts) — exports `LLMService` |
| Service | [llm.service.ts](../apps/api/src/llm/llm.service.ts) — `invokeStructured<T>(messages, schema, opts)` w/ exponential-backoff retry; `transcribeAudio(url)` w/ PII redaction + timeout; records LLM metrics |
| Helper | [medical-keyterms.ts](../apps/api/src/llm/medical-keyterms.ts) — `MEDICAL_KEYTERMS`, `TRANSCRIPTION_TIMEOUT_MS`, `NHS_NUMBER_PATTERN` for AssemblyAI keyterms prompt |

Depends on LangChain, AssemblyAI SDK, ConfigService, Sentry, MetricsService.

---

### Module: `processing`

**Purpose:** Message-content pipeline: (audio → transcribe → clean → redact) or (text → clean → redact).

| Layer | File / detail |
| ---- | ---- |
| Module | [processing.module.ts](../apps/api/src/processing/processing.module.ts) — imports LLM, Media, Conversations, Artefacts |
| Service | [processing.service.ts](../apps/api/src/processing/processing.service.ts) — orchestrates stages, idempotent on message status, handles tombstone race |
| Stages | [transcription.stage.ts](../apps/api/src/processing/stages/transcription.stage.ts), [cleaning.stage.ts](../apps/api/src/processing/stages/cleaning.stage.ts), [redaction.stage.ts](../apps/api/src/processing/stages/redaction.stage.ts) (regex + LLM two-layer PII) + [stage.interface.ts](../apps/api/src/processing/stages/stage.interface.ts) |
| Prompts | [cleaning.prompt.ts](../apps/api/src/processing/prompts/cleaning.prompt.ts), [redaction.prompt.ts](../apps/api/src/processing/prompts/redaction.prompt.ts) |
| Util | [pii-regex.ts](../apps/api/src/processing/utils/pii-regex.ts) — `redactStructuredPii` (NHS#, NI#, passport, card, email, UK phone, postcode, dates) |
| Tests | `processing.service.spec.ts`, `redaction.stage.spec.ts`, `pii-regex.spec.ts` |

Invoked via outbox `message.process` handler.

---

### Module: `analysis-runs`

**Purpose:** Lifecycle/state tracking of AI analysis runs (one per conversation analysis), with idempotency and optimistic locking. **No `userId`** — owned transitively via `conversationId` (documented system-context carve-out).

| Layer | File / detail |
| ---- | ---- |
| Module | [analysis-runs.module.ts](../apps/api/src/analysis-runs/analysis-runs.module.ts) |
| Service | [analysis-runs.service.ts](../apps/api/src/analysis-runs/analysis-runs.service.ts) — `createRun` (idempotency key + `langGraphThreadId`), `transitionStatus` (optimistic lock), find/list, cascade delete |
| Repository | [analysis-runs.repository.ts](../apps/api/src/analysis-runs/analysis-runs.repository.ts) + [interface](../apps/api/src/analysis-runs/analysis-runs.repository.interface.ts) — partial unique index enforcing ≤1 active run/conversation |
| **Event listener** | [analysis-run.listener.ts](../apps/api/src/analysis-runs/analysis-run.listener.ts) — listens `ANALYSIS_STEP_STARTED`, updates `currentStep` (fire-and-forget) |
| Schema | [schemas/analysis-run.schema.ts](../apps/api/src/analysis-runs/schemas/analysis-run.schema.ts) — `AnalysisRun` (`analysis_runs`): xid, conversationId, runNumber, status, snapshotRange, currentQuestion, idempotencyKey, langGraphThreadId, reflectTrace/refineTrace (immutable debug) |
| Tests | `tombstone.spec.ts` |

---

### Module: `portfolio-graph` (largest — 42 files)

**Purpose:** LangGraph-based AI analysis state machine that classifies a portfolio entry, checks completeness, asks follow-ups, tags capabilities, and composes a reflective document + PDP goals.

**Graph structure:** `buildPortfolioGraph` ([portfolio-graph.builder.ts](../apps/api/src/portfolio-graph/portfolio-graph.builder.ts)) defines a 14-node `StateGraph`. Checkpointed in MongoDB via `MongoDBSaver` (`checkpoints`, `checkpoint_writes`). Thread id = `${conversationId}:${runNumber}`.

**Flow:** START → gather_context → classify → **present_classification** (interrupt) → check_completeness → {generate_followup → **ask_followup** (interrupt) → loop} OR tag_capabilities → **present_capabilities** (interrupt) → elicit_justification → reflect → refine → generate_pdp → save → END. Fourth interrupt: **ask_clarification** (low-confidence/irrelevant).

**Core files:**

| File | Symbol | Purpose |
| ---- | ------ | ------- |
| [portfolio-graph.service.ts](../apps/api/src/portfolio-graph/portfolio-graph.service.ts) | `PortfolioGraphService` | `startGraph`, `resumeGraph<N>`, `getPausedNode`, `getInterruptPayload`, `getFinalState`; manages checkpointer |
| [portfolio-graph.builder.ts](../apps/api/src/portfolio-graph/portfolio-graph.builder.ts) | `buildPortfolioGraph` + routers, `MAX_FOLLOWUP_ROUNDS`, `CONFIDENCE_THRESHOLD`, `MAX_CLARIFICATION_ROUNDS` | Graph topology |
| [portfolio-graph.state.ts](../apps/api/src/portfolio-graph/portfolio-graph.state.ts) | `PortfolioState` (Annotation.Root) | Identity, content, classification, completeness, readiness, capabilities, reflection state |
| [graph-deps.ts](../apps/api/src/portfolio-graph/graph-deps.ts) | `GraphDeps`, `ANALYSIS_STEP_STARTED` | DI object + node-progress event |
| [completeness.ts](../apps/api/src/portfolio-graph/completeness.ts) | `deriveCompleteness` | Pure: state → Completeness |
| [readiness-snapshot.ts](../apps/api/src/portfolio-graph/readiness-snapshot.ts) | `buildReadinessSnapshot` | Pure: state → Entry-Card snapshot |

**Nodes** ([nodes/](../apps/api/src/portfolio-graph/nodes/)) — factory pattern (`createXxxNode`): gather-context, classify, present-classification, ask-clarification, check-completeness, generate-followup, ask-followup, tag-capabilities, present-capabilities, elicit-justification, reflect, refine, generate-pdp, save.

**Node utilities:** [capability-grading.util.ts](../apps/api/src/portfolio-graph/nodes/capability-grading.util.ts) (tier vocab + quote matching), [text-tokens.util.ts](../apps/api/src/portfolio-graph/nodes/text-tokens.util.ts) (tokenisation), [compose-verify.util.ts](../apps/api/src/portfolio-graph/nodes/compose-verify.util.ts) (fabrication tripwire on novel numbers/words).

**Tests:** ~21 specs (routers, completeness, + 18 node specs incl. schema-field-order, compose-verify, capability-grading).

**Dependencies:** Imports Artefacts, Conversations, Database, LLM, PdpGoals (forwardRef). Nodes emit `ANALYSIS_STEP_STARTED`; invoked by outbox `AnalysisStartHandler`/`AnalysisResumeHandler`.

---

### Module: `pdp-goals`

**Purpose:** Personal Development Plan goals + actions, with cursor pagination and artefact-cascade anonymization.

| Layer | File / detail |
| ---- | ---- |
| Module | [pdp-goals.module.ts](../apps/api/src/pdp-goals/pdp-goals.module.ts) |
| Controller | [pdp-goals.controller.ts](../apps/api/src/pdp-goals/pdp-goals.controller.ts) — DELETE/`:xid`, GET `/`, GET `/:xid`, PATCH `/:xid`, POST `/:xid/actions`, PATCH `/:xid/actions/:actionXid` |
| Service | [pdp-goals.service.ts](../apps/api/src/pdp-goals/pdp-goals.service.ts) |
| Repository | [pdp-goals.repository.ts](../apps/api/src/pdp-goals/pdp-goals.repository.ts) (`pdpGoalTombstoneUpdate`; reference impl for ownership-scoped queries) + [interface](../apps/api/src/pdp-goals/pdp-goals.repository.interface.ts) |
| Schema | [schemas/pdp-goal.schema.ts](../apps/api/src/pdp-goals/schemas/pdp-goal.schema.ts) — `PdpGoal` (`pdp_goals`), embeds `PdpGoalAction`; indexes userId+status+reviewDate, artefactId |
| Util | [cursor.util.ts](../apps/api/src/pdp-goals/cursor.util.ts) — keyset cursor `isoDate__objectId` |
| DTOs | `ListPdpGoalsDto`, `UpdatePdpGoalDto`, `AddPdpGoalActionDto`, `UpdatePdpGoalActionDto` |
| Tests | repository integration, service, tombstone |

---

### Module: `review-periods`

**Purpose:** Review periods (e.g. ARCP windows) with capability-coverage computation, LRU-cached and event-invalidated.

| Layer | File / detail |
| ---- | ---- |
| Module | [review-periods.module.ts](../apps/api/src/review-periods/review-periods.module.ts) — imports Artefacts, Database, User schema |
| Controller | [review-periods.controller.ts](../apps/api/src/review-periods/review-periods.controller.ts) — POST `/`, GET `/`, GET `/:xid`, PATCH `/:xid`, DELETE `/:xid` (archive), GET `/:xid/coverage` |
| Service | [review-periods.service.ts](../apps/api/src/review-periods/review-periods.service.ts) — LRU coverage cache, listens `ARTEFACT_STATE_CHANGED` for invalidation, transactional CRUD |
| Repository | [review-periods.repository.ts](../apps/api/src/review-periods/review-periods.repository.ts) + [interface](../apps/api/src/review-periods/review-periods.repository.interface.ts) |
| Schema | [schemas/review-period.schema.ts](../apps/api/src/review-periods/schemas/review-period.schema.ts) — `ReviewPeriod` (`review_periods`) |
| Tests | repository integration, service |

**Consumes** the `ARTEFACT_STATE_CHANGED` event emitted by `artefacts`.

---

### Module: `version-history`

**Purpose:** Entity-agnostic snapshot-before-edit versioning (used by artefacts; reusable for any entity).

| Layer | File / detail |
| ---- | ---- |
| Module | [version-history.module.ts](../apps/api/src/version-history/version-history.module.ts) |
| Service | [version-history.service.ts](../apps/api/src/version-history/version-history.service.ts) — `createVersion` (incrementing counter per entity), `getVersions/getVersion/countVersions`, `anonymizeByEntity` |
| Repository | [version-history.repository.ts](../apps/api/src/version-history/version-history.repository.ts) + [interface](../apps/api/src/version-history/version-history.repository.interface.ts) — userId ownership predicate at every query |
| Schema | [schemas/version-history.schema.ts](../apps/api/src/version-history/schemas/version-history.schema.ts) — `VersionHistory` (`version_history`): entityType, entityId, userId, version, snapshot |
| Tests | repository integration, service |

**Note:** restore logic lives in the consuming `ArtefactsService` (snapshot-before-restore enables undo); this module only stores/retrieves snapshots.

---

### Module: `version-policy`

**Purpose:** Client (mobile) version-gating — mandatory/recommended update evaluation via semver.

| Layer | File / detail |
| ---- | ---- |
| Module | [version-policy.module.ts](../apps/api/src/version-policy/version-policy.module.ts) |
| Controller | [version-policy.admin.controller.ts](../apps/api/src/version-policy/version-policy.admin.controller.ts) — `@Roles(ADMIN)`: GET `/`, PUT `/:platform` |
| Service | [version-policy.service.ts](../apps/api/src/version-policy/version-policy.service.ts) — `evaluate(platform, clientVersion)` → MANDATORY/RECOMMENDED |
| Repository | [version-policy.repository.ts](../apps/api/src/version-policy/version-policy.repository.ts) |
| Schema | [schemas/version-policy.schema.ts](../apps/api/src/version-policy/schemas/version-policy.schema.ts) — `VersionPolicy` (`version_policies`): platform (unique), min/recommended/latest versions, storeUrl |
| DTO | `UpsertVersionPolicyDto` |
| Tests | service, admin controller, repository, integration |

`evaluate` is consumed by `init`.

---

### Module: `specialties`

**Purpose:** Static configuration/data registry for medical specialties (entry types, capabilities, templates, training stages). Pure config — no DB.

| File | Symbol | Purpose |
| ---- | ------ | ------- |
| [specialties.module.ts](../apps/api/src/specialties/specialties.module.ts) | `SpecialtiesModule` | Exports controller |
| [specialties.controller.ts](../apps/api/src/specialties/specialties.controller.ts) | `SpecialtiesController` | **Public** GET `/specialties` (active specialties — GP only) |
| [specialty.registry.ts](../apps/api/src/specialties/specialty.registry.ts) | `getSpecialtyConfig`, `getAllSpecialtyOptions`, `getTemplateForEntryType`, `isValidTrainingStage` | Central registry; GP active, IM & Psychiatry present but inactive |
| [stage-context.ts](../apps/api/src/specialties/stage-context.ts) | `getStageContext`, `STAGE_CONTEXTS` | LLM prompt context per (specialty, stage) |
| [gp/](../apps/api/src/specialties/gp/) | `GP_SPECIALTY_CONFIG` + training-stages, entry-types (10), capabilities (14+), 8 templates (CCR, LEA/SEA, feedback, leadership, QIP, QIA, prescribing, reflective) | GP config bundle |
| [internal-medicine/](../apps/api/src/specialties/internal-medicine/) | `IM_SPECIALTY_CONFIG` (+ stages/entry-types/capabilities/templates) | Inactive |
| [psychiatry/](../apps/api/src/specialties/psychiatry/) | `PSYCHIATRY_SPECIALTY_CONFIG` (CT1–ST6) | Inactive |
| Tests | stage-context, registry, controller, `descriptor-criteria.integrity.spec.ts` |

---

### Module: `auth`

**Purpose:** OTP-based authentication, guest accounts, JWT issuance, refresh-token rotation with replay detection, session management, profile, account-deletion request.

| Layer | File / detail |
| ---- | ---- |
| Module | [auth.module.ts](../apps/api/src/auth/auth.module.ts) — imports Passport, JWT, OTP; exports services + `SESSION_REPOSITORY` |
| Controller | [auth.controller.ts](../apps/api/src/auth/auth.controller.ts) — `/auth/otp/send`, `/otp/verify`, `/claim`, `/refresh`, `/logout`, `/logout-all`, `/sessions` (GET/DELETE), `/guest`, `/me`, `/me/request-deletion`, `/me/cancel-deletion` |
| Services | [auth.service.ts](../apps/api/src/auth/auth.service.ts) (core flows), [token.service.ts](../apps/api/src/auth/token.service.ts) (JWT sign HS256, refresh SHA256 hashing, rotation family) |
| Repository | [sessions.repository.ts](../apps/api/src/auth/sessions.repository.ts) — atomic CAS rotate, replay detection via `previousHashes` + [interface](../apps/api/src/auth/sessions.repository.interface.ts) |
| Strategy | [strategies/jwt.strategy.ts](../apps/api/src/auth/strategies/jwt.strategy.ts) — pinned HS256, session-revocation + token-session mismatch checks |
| Schemas | [user.schema.ts](../apps/api/src/auth/schemas/user.schema.ts) (`users`: email unique, role, specialty, deletion fields, anonymizedAt); [session.schema.ts](../apps/api/src/auth/schemas/session.schema.ts) (`sessions`: xid, refreshTokenHash unique, family, previousHashes, TTL on expiresAt) |
| DTOs | `OtpSendDto`, `OtpVerifyDto`, `OtpClaimDto`, `RefreshTokenDto`, `UpdateProfileDto` |

Imports OTP. Roles use ordinal numeric comparison (`USER_GUEST < USER < ADMIN`).

---

### Module: `otp`

**Purpose:** One-time-passcode generation, hashing, rate-limiting, lockout.

| Layer | File / detail |
| ---- | ---- |
| Module | [otp.module.ts](../apps/api/src/otp/otp.module.ts) |
| Service | [otp.service.ts](../apps/api/src/otp/otp.service.ts) — 6-digit code, SHA256 hash, timing-safe compare, fire-and-forget email; `@logdit.app` test OTP in dev |
| Repository | [otp.repository.ts](../apps/api/src/otp/otp.repository.ts) + [interface](../apps/api/src/otp/otp.repository.interface.ts) |
| Service | [email-lockout.service.ts](../apps/api/src/otp/email-lockout.service.ts) — in-memory LRU; locks email after 3 failures for 10 min (`TooManyVerifyAttemptsException`) |
| Schema | [schemas/otp.schema.ts](../apps/api/src/otp/schemas/otp.schema.ts) — `Otp` (`otps`): email, codeHash, attempts, TTL on expiresAt |

Imports Email.

---

### Module: `acknowledgements`

**Purpose:** Records user acknowledgement of legal/medical notices (UK trainee + anonymise-patients consent), with re-ack policy.

| Layer | File / detail |
| ---- | ---- |
| Module | [acknowledgements.module.ts](../apps/api/src/acknowledgements/acknowledgements.module.ts) |
| Controller | [acknowledgements.controller.ts](../apps/api/src/acknowledgements/acknowledgements.controller.ts) — POST `/acknowledgements` (captures IP + UA) |
| Service | [acknowledgements.service.ts](../apps/api/src/acknowledgements/acknowledgements.service.ts) — idempotent by (userId, noticeVersion) |
| Repository | [acknowledgements.repository.ts](../apps/api/src/acknowledgements/acknowledgements.repository.ts) |
| Schema | [schemas/acknowledgement.schema.ts](../apps/api/src/acknowledgements/schemas/acknowledgement.schema.ts) — `Acknowledgement` (`acknowledgements`): unique (userId, noticeVersion) |
| Config | [registry.ts](../apps/api/src/acknowledgements/registry.ts) (`NOTICE_REGISTRY`), [notices/v1.0.ts](../apps/api/src/acknowledgements/notices/v1.0.ts) (`NOTICE_V1_0`) |
| Policy | [notice-policy.ts](../apps/api/src/acknowledgements/notice-policy.ts) — `computeNeedsReAck` (first_time / material_change / unknown) |
| DTO | `CreateAcknowledgementDto` |

Consumed by `init`. (Distinct from the `notices` module below.)

---

### Module: `notices`

**Purpose:** In-app notices/banners with audience targeting + per-user dismissal; admin CRUD.

| Layer | File / detail |
| ---- | ---- |
| Module | [notices.module.ts](../apps/api/src/notices/notices.module.ts) |
| Controllers | [notices.controller.ts](../apps/api/src/notices/notices.controller.ts) — POST `/notices/:id/dismiss`; [notices.admin.controller.ts](../apps/api/src/notices/notices.admin.controller.ts) — `@Roles(ADMIN)` `admin/notices` CRUD |
| Service | [notices.service.ts](../apps/api/src/notices/notices.service.ts) — active+audience filter, excludes dismissed, max 5, sort by priority/severity |
| Repository | [notices.repository.ts](../apps/api/src/notices/notices.repository.ts) |
| Schemas | [notice.schema.ts](../apps/api/src/notices/schemas/notice.schema.ts) (`notices`), [notice-dismissal.schema.ts](../apps/api/src/notices/schemas/notice-dismissal.schema.ts) (`notice_dismissals`, unique (userId, noticeId)) |
| DTOs | `CreateNoticeDto`, `UpdateNoticeDto` |

---

### Module: `account-cleanup`

**Purpose:** GDPR account deletion — daily cron anonymization + dev manual trigger.

| Layer | File / detail |
| ---- | ---- |
| Module | [account-cleanup.module.ts](../apps/api/src/account-cleanup/account-cleanup.module.ts) — imports Auth, Artefacts, Conversations, Media, PdpGoals, ReviewPeriods, AnalysisRuns, Items, VersionHistory, Outbox |
| Controller | [account-cleanup.controller.ts](../apps/api/src/account-cleanup/account-cleanup.controller.ts) — POST `/dev/account-cleanup/:userId` (`@DevOnly()` + `@Public()`) |
| **Cron** | [account-cleanup.service.ts](../apps/api/src/account-cleanup/account-cleanup.service.ts) — `@Cron('0 0 5 * * *')` daily 5 AM UTC; 3-step: lock+PII-wipe → parallel purge of 9 repos → mark anonymized; idempotent, safety-gated |

---

### Module: `email`

**Purpose:** SMTP (nodemailer) email delivery — currently OTP only.

| Layer | File / detail |
| ---- | ---- |
| Module | [email.module.ts](../apps/api/src/email/email.module.ts) — **global** |
| Service | [email.service.ts](../apps/api/src/email/email.service.ts) — `sendOtp`, fire-and-forget, disabled if SMTP unconfigured |
| Template | [templates/otp.template.ts](../apps/api/src/email/templates/otp.template.ts) — `buildOtpEmail` (HTML + plain-text) |

---

### Module: `quota`

**Purpose:** Dual-window usage quota (4 h rolling + weekly fixed), enforced via guard/interceptor.

| Layer | File / detail |
| ---- | ---- |
| Module | [quota.module.ts](../apps/api/src/quota/quota.module.ts) |
| Controller | [quota.controller.ts](../apps/api/src/quota/quota.controller.ts) — **Public** GET `/quota/info` (cached) |
| Service | [quota.service.ts](../apps/api/src/quota/quota.service.ts) — `checkQuota` (429 + `QuotaExceededPayload`), `recordEvent`, `getQuotaStatus` |
| Repository | [quota.repository.ts](../apps/api/src/quota/quota.repository.ts) + [interface](../apps/api/src/quota/quota.repository.interface.ts) |
| Schema | [schemas/usage-event.schema.ts](../apps/api/src/quota/schemas/usage-event.schema.ts) — `UsageEvent` (`usage_events`): TTL 90 days |
| Config | [quota-info.config.ts](../apps/api/src/quota/quota-info.config.ts) — static UI items |

---

### Module: `init`

**Purpose:** Single onboarding/bootstrap endpoint aggregating everything the client needs at startup.

| Layer | File / detail |
| ---- | ---- |
| Module | [init.module.ts](../apps/api/src/init/init.module.ts) — imports Auth, Dashboard, Quota, VersionPolicy, Notices, Acknowledgements, Artefacts |
| Controller | [init.controller.ts](../apps/api/src/init/init.controller.ts) — GET `/init` (reads platform/appVersion headers) |
| Service | [init.service.ts](../apps/api/src/init/init.service.ts) — assembles user, dashboard, quota, version policy, notices, latest acknowledgement, guest limit |

---

## 3. Shared and common code (`src/common`)

**Guards** ([common/guards/](../apps/api/src/common/guards/)):

| File | Item | Purpose |
| ---- | ---- | ------- |
| jwt-auth.guard.ts | `JwtAuthGuard` | Passport JWT; honours `@Public()` |
| roles.guard.ts | `RolesGuard` | Ordinal `user.role >= required` |
| quota.guard.ts | `QuotaGuard` | Enforces `@UseQuota(type)`, throws 429 |
| dev-only.guard.ts | `DevOnlyGuard` | `@DevOnly()` → 404 in prod |

**Decorators** ([common/decorators/](../apps/api/src/common/decorators/)): `Public`/`IS_PUBLIC_KEY`, `Roles`/`ROLES_KEY`, `CurrentUser`/`CurrentUserPayload`, `UseQuota`/`QUOTA_TYPE_KEY`, `DevOnly`/`IS_DEV_ONLY_KEY`, `DeviceInfoHeaders`/`DeviceInfo`.

**Interceptors:** [quota.interceptor.ts](../apps/api/src/common/interceptors/quota.interceptor.ts) — records usage post-request, sets `X-Quota-*` headers.

**Metrics** ([common/metrics/](../apps/api/src/common/metrics/)): `MetricsService` — OTel instruments for outbox jobs (active/duration/failed/queue-depth) and LLM (duration/retries).

**Utilities** ([common/utils/](../apps/api/src/common/utils/)):

| File | Item | Purpose |
| ---- | ---- | ------- |
| result.util.ts | `Result`, `ok`, `err`, `isOk`, `isErr`, `DBError`, `unwrapVoid` | Railway-oriented result type |
| mongo-errors.util.ts | `isMongoDuplicateKeyError`, `isTransientTransactionError` | Driver error guards |
| nanoid.util.ts | `generateXid`, `nanoidAlphanumeric` | 21-char external ids |
| objectid.util.ts | `objectIdsEqual` | Id equality coercion |
| type-guards.util.ts | `isNotNull` | Array null filter |
| date.util.ts | `toISOStringOrNull` | Safe ISO serialization |
| run-with-session.util.ts | `runWithSession` | Sequential-if-session, parallel-if-not |
| sleep.util.ts | `sleep` | Delay promise |

**Cache:** [common/cache/lru-cache.ts](../apps/api/src/common/cache/lru-cache.ts) — `AppLruCache<K,V>` wrapper.

**Events:** [common/events/artefact.events.ts](../apps/api/src/common/events/artefact.events.ts) — `ARTEFACT_STATE_CHANGED` + `ArtefactStateChangedEvent`.

---

## 4. Infrastructure and cross-cutting concerns

### Environment and configuration ([src/config](../apps/api/src/config/))
- [config.module.ts](../apps/api/src/config/config.module.ts) — `@nestjs/config` w/ `appConfig` loader.
- [app.config.ts](../apps/api/src/config/app.config.ts) — Zod `envSchema` + `validateEnv()`. **Required:** `MONGODB_URI`, `JWT_ACCESS_SECRET` (≥32), `S3_ACCESS_KEY_ID/SECRET/BUCKET_MEDIA`, `OPENAI_API_KEY`, `ASSEMBLYAI_API_KEY`, `SENTRY_DSN`. Optional/defaulted: `PORT` (3001), `ALLOWED_ORIGINS`, `TRUST_PROXY_HOPS`, OTP & SMTP settings, OTEL endpoints.
- [quota.config.ts](../apps/api/src/config/quota.config.ts) — plans per role, `GUEST_ARTEFACT_LIMIT`, window helpers.
- [rate-limit.config.ts](../apps/api/src/config/rate-limit.config.ts) — throttler rules (20/10 s, 60/60 s).
- `.env` / `.env.example` at api root.

### Database and persistence ([src/database](../apps/api/src/database/))
- [database.module.ts](../apps/api/src/database/database.module.ts) — `MongooseModule.forRootAsync` from `MONGODB_URI`.
- [transaction.service.ts](../apps/api/src/database/transaction.service.ts) — `withTransaction()`, 3 retries, exponential backoff, transient-error detection.
- Schemas/repositories per feature module (see §2). No migrations/seeds (greenfield).

### Authentication and authorization
- `auth` + `otp` modules (§2); global `JwtAuthGuard` + `RolesGuard`.
- JWT HS256, refresh rotation w/ family + `previousHashes` replay detection, session TTL index.
- Decorators: `@Public`, `@Roles`, `@CurrentUser`, `@DevOnly`.

### Observability
- [src/instrument.ts](../apps/api/src/instrument.ts) — Sentry (error-only, `tracesSampleRate:0`, PII off).
- [src/tracing.ts](../apps/api/src/tracing.ts) — OpenTelemetry NodeSDK, selective auto-instrumentation (Express/NestJS/Mongoose/Pino/RuntimeNode), OTLP exporters, 60 s metric interval, graceful shutdown.
- Pino logger (in `app.module.ts`) — trace_id/span_id/reqId correlation, `X-Request-Id`, header redaction, ignores `/api/health`.
- `MetricsService` (§3). Health: [src/health/](../apps/api/src/health/) — `HealthController` (Mongo + Storage indicators), `O11yDemoController` (dev-only).

### Messaging, events, queues, and outbox ([src/outbox](../apps/api/src/outbox/))
- [outbox.schema.ts](../apps/api/src/outbox/schemas/outbox.schema.ts) — `OutboxEntry`: status, attempts/maxAttempts, processAfter, lockedUntil.
- [outbox.consumer.ts](../apps/api/src/outbox/outbox.consumer.ts) — polls every 500 ms, max concurrency 5, resetStaleLocks → claimBatch → processEntry; OTel metrics.
- [outbox.repository.ts](../apps/api/src/outbox/outbox.repository.ts) — atomic claim, backoff `2^attempts*1000ms`, FAILED after maxAttempts.
- [outbox.service.ts](../apps/api/src/outbox/outbox.service.ts) — `enqueue` (session-aware), claim/markCompleted/markFailed, cancel.
- Handlers: [analysis-start.handler.ts](../apps/api/src/outbox/handlers/analysis-start.handler.ts), [analysis-resume.handler.ts](../apps/api/src/outbox/handlers/analysis-resume.handler.ts), [message-processing.handler.ts](../apps/api/src/outbox/handlers/message-processing.handler.ts).
- [analysis-completion.service.ts](../apps/api/src/outbox/analysis-completion.service.ts) — atomic post-graph persistence (artefact + PDP goals + run status).
- **EventEmitter2** (in-process): `ARTEFACT_STATE_CHANGED` (artefacts → review-periods), `ANALYSIS_STEP_STARTED` (graph nodes → analysis-run listener).

### Error handling and validation
- Global `ZodValidationPipe` (request validation); per-DTO Zod schemas wrapping `@acme/shared`.
- `Result`/`DBError` pattern in repositories; services map to NestJS exceptions.
- `SentryGlobalFilter` (global exception filter). Mongo duplicate-key/transient guards in `common/utils`.

### Deployment and runtime
- **No Docker, compose, Kubernetes, or CI/CD files exist** (backend not deployed).
- Build via `nest build` (SWC). `nest-cli.json`, `tsconfig.json` (CommonJS, ES2022, decorators).
- **Package scripts** ([apps/api/package.json](../apps/api/package.json)): `build` (`nest build`), `dev` (`nest start --watch`), `start`, `start:prod` (`node dist/main`), `lint`, `typecheck` (`tsc --noEmit`), `clean`, `test` (unit then integration `--runInBand`), `test:unit`, `test:integration`, `db:dump`.
- Debug script: [scripts/dump-artefact.js](../apps/api/scripts/dump-artefact.js) — dumps an artefact + linked data; flags `--full`, `--out`, `--section`.

---

## 5. Entry points and bootstrapping

- **Bootstrap:** [src/main.ts](../apps/api/src/main.ts) → loads Sentry then OTel, `NestFactory.create`.
- **Root module:** [src/app.module.ts](../apps/api/src/app.module.ts).
- **Global pipe:** `ZodValidationPipe`.
- **Global filter:** `SentryGlobalFilter`.
- **Global guards:** `ThrottlerGuard`, `JwtAuthGuard`, `RolesGuard`, `QuotaGuard`, `DevOnlyGuard`.
- **Global interceptor:** `QuotaInterceptor`.
- **CORS:** whitelist from `ALLOWED_ORIGINS`; non-browser (no Origin) allowed; credentials on.
- **Prefix:** `/api`. **No Swagger/OpenAPI** and **no NestJS versioning** detected.
- **Graceful shutdown:** SIGTERM/SIGINT → `app.close()` w/ 2 s force-exit.

---

## 6. Architectural observations

- **Major modules / domain boundaries:** Identity (`auth`, `otp`), content authoring (`artefacts`, `conversations`, `media`, `processing`), AI analysis (`portfolio-graph`, `analysis-runs`, `llm`), development planning (`pdp-goals`, `review-periods`), governance (`acknowledgements`, `notices`, `quota`, `version-policy`), lifecycle (`account-cleanup`, `version-history`), aggregation (`dashboard`, `init`).
- **Repeated patterns (consistent):** Controller→Service→Repository(interface+impl)→Schema; `Result` returns; Zod DTOs; `mappers/`; `xid` vs `_id`; userId-scoped repository filters; tombstone soft-delete.
- **Circular dependencies:** Several resolved via `forwardRef` — Artefacts↔Conversations, Artefacts↔Outbox, Conversations↔PortfolioGraph/Outbox, PortfolioGraph↔PdpGoals. Functional but a sign of tight coupling around the analysis pipeline; worth watching.
- **Two "notice" concepts:** `acknowledgements` (legal consent) vs `notices` (in-app banners) — similarly named, distinct purposes; could confuse newcomers.
- **`items` module:** appears to be a scaffolding/reference CRUD slice with no domain ties and **no tests** — verify whether it's still needed or should be removed.
- **CLAUDE.md drift (documented):** `Types.ObjectId` usage leaks into some services (`artefacts.service.ts`, `pdp-goals.service.ts`) against the "no Mongo types in services" rule.
- **Missing tests:** `items` (none), `dashboard` (none), `init` (none), `email`, `notices`, `account-cleanup`, `auth`/`otp` (no specs surfaced) — auth and account-cleanup are security/PII-critical and would benefit from coverage.
- **No API documentation:** no Swagger/OpenAPI; API surface is only discoverable via controllers + the `@acme/shared` Zod schemas.

---

## 7. Final repository map

```
portfolio/ (pnpm + Turborepo monorepo — package.json, turbo.json, pnpm-workspace.yaml, tsconfig.base.json)
├── apps/api/                      NestJS backend (this inventory) — NOT deployed; no Docker/CI
│   ├── src/
│   │   ├── main.ts                Bootstrap (Sentry → OTel → Nest), CORS, /api, shutdown
│   │   ├── app.module.ts          Root module; global guards/filter/interceptor, pino, throttler
│   │   ├── instrument.ts          Sentry init (error-only)
│   │   ├── tracing.ts             OpenTelemetry NodeSDK + OTLP exporters
│   │   ├── config/                Zod env validation, quota & rate-limit config
│   │   ├── database/              Mongoose connection + TransactionService
│   │   ├── common/                Guards, decorators, interceptors, metrics, utils, cache, events
│   │   ├── auth/ + otp/ + email/  Identity: OTP login, JWT rotation, sessions, SMTP
│   │   ├── artefacts/             Core domain: portfolio entries (CRUD, review, notes, versions)
│   │   ├── conversations/         Messages + analysis trigger + ConversationContext
│   │   ├── media/                 Presigned S3/R2 uploads + hourly orphan sweeper (cron)
│   │   ├── processing/            Transcribe → clean → redact (PII) pipeline
│   │   ├── llm/                   OpenAI structured output + AssemblyAI transcription
│   │   ├── portfolio-graph/       LangGraph 14-node AI state machine (4 interrupts, MongoDB ckpt)
│   │   ├── analysis-runs/         Analysis run lifecycle, idempotency, step listener
│   │   ├── outbox/                Transactional outbox: poller, handlers, completion service
│   │   ├── pdp-goals/             Development-plan goals + actions (cursor pagination)
│   │   ├── review-periods/        Review windows + cached capability coverage
│   │   ├── version-history/       Entity-agnostic snapshot versioning
│   │   ├── version-policy/        Mobile version gating (admin)
│   │   ├── specialties/           Static specialty config/data (GP active; IM, Psychiatry inactive)
│   │   ├── acknowledgements/      Legal/medical consent records + re-ack policy
│   │   ├── notices/               In-app notices + dismissals (admin CRUD)
│   │   ├── quota/                 Dual-window usage quota (guard + interceptor)
│   │   ├── account-cleanup/       GDPR deletion (daily cron + dev trigger)
│   │   ├── dashboard/ + init/      Aggregation endpoints for client startup
│   │   └── health/                Terminus health checks + o11y demo (dev)
│   ├── scripts/dump-artefact.js   Debug dump utility
│   ├── jest.config.ts / jest.unit.config.ts / jest.setup.ts
│   └── nest-cli.json / tsconfig.json / package.json / .env(.example)
├── apps/mobile/                   Expo/React Native (out of scope)
├── apps/web/                      Vite/React/Mantine (out of scope)
└── packages/shared/, packages/api-client/   Zod schemas/DTOs/enums; typed client (out of scope)
```

---

## Caveats / evidence gaps

- The `items` module's product purpose is **Unclear** (no domain ties, no tests) — flagged, not guessed.
- Internal-medicine and psychiatry specialty configs exist but are marked inactive in the registry; their template/capability files were inventoried by filename but not all deeply read.
- Test lists per module reflect files surfaced during the scan; the largest module (portfolio-graph) had its ~21 specs summarized rather than individually enumerated.
