# Move Leaked DTOs — Implementation Plan

## Background

The `packages/shared` package should only contain types that cross the **mobile ↔ API boundary** — types that appear in API responses consumed by the mobile app or api-client. Currently, ~50% of its exports are backend-only internals that leaked in. This inflates the shared package surface area, couples mobile to API implementation details, and makes it harder to reason about what constitutes the public contract.

### The Rule

**If deleting a type from shared would only break the API (not mobile or api-client), it's a leaked internal.**

There is one exception: **sub-schemas composed into boundary types**. A schema that isn't directly imported by mobile but is embedded in a schema that IS (e.g., `FreeTextPromptSchema` is composed into `FreeTextQuestionSchema` which mobile uses) must remain in shared for Zod composition to work.

---

## Audit Results

### Composition Chain Analysis (conversation.dto.ts)

Before moving anything, I traced the Zod schema composition to identify sub-schemas that MUST stay:

```
MessageSchema (mobile uses)
  ├── MessageMediaSchema        ← composed in, MUST KEEP
  ├── QuestionSchema            ← composed in, MUST KEEP
  │     ├── SingleSelectQuestionSchema (mobile uses directly)
  │     │     └── QuestionOptionSchema  ← composed in, MUST KEEP
  │     ├── MultiSelectQuestionSchema (mobile uses directly)
  │     │     └── QuestionOptionSchema  ← composed in, MUST KEEP
  │     └── FreeTextQuestionSchema (mobile uses directly)
  │           └── FreeTextPromptSchema  ← composed in, MUST KEEP
  └── AnswerSchema              ← composed in, MUST KEEP
        ├── SingleSelectAnswerSchema (mobile uses directly)
        └── MultiSelectAnswerSchema (mobile uses directly)

ConversationContextSchema (mobile uses)
  ├── ConversationPhaseSchema   ← composed in, MUST KEEP
  ├── ActionStateSchema         ← composed in, MUST KEEP
  ├── QuestionTypeSchema        ← composed in, MUST KEEP
  ├── AnalysisRunStatus (enum)  ← used in inline object, MUST KEEP
  └── ThinkingStep (enum)       ← used in inline object, MUST KEEP

ArtefactSchema (mobile uses)
  ├── ReflectionSectionSchema   ← composed in, MUST KEEP
  ├── PdpGoalSchema (mobile uses directly)
  │     └── PdpGoalActionSchema ← composed in, MUST KEEP
  ├── CapabilitySchema          ← composed in, MUST KEEP
  └── ActiveConversationSchema  ← composed in, MUST KEEP

CoverageResponseSchema (mobile uses)
  ├── CoverageSummarySchema     ← composed in, MUST KEEP
  └── DomainCoverageSchema      ← composed in, MUST KEEP
        └── CapabilityCoverageSchema ← composed in, MUST KEEP

DashboardResponseSchema (mobile uses)
  └── ActiveReviewPeriodSummarySchema ← composed in, MUST KEEP

SpecialtyOptionSchema (api-client uses)
  └── TrainingStageSchema       ← composed in, MUST KEEP

ArtefactVersionHistoryResponseSchema (mobile uses)
  └── ArtefactVersionSchema     ← composed in, MUST KEEP

FinaliseArtefactRequestSchema (mobile uses via PdpGoalSelection)
  └── PdpGoalActionSelectionSchema ← composed in, MUST KEEP
```

### What to MOVE (confirmed API-only, not composed into any boundary schema)

#### conversation.dto.ts — 3 schemas to move

| Schema | Why it's API-only |
|---|---|
| `ClassificationOptionSchema` / `ClassificationOption` | Graph interrupt payload. Service layer transforms it into `QuestionOption` for the `SingleSelectQuestion` message. Mobile never sees this type. |
| `CapabilityOptionSchema` / `CapabilityOption` | Graph interrupt payload. Same pattern — transformed into `QuestionOption` for `MultiSelectQuestion`. |
| `FollowupQuestionSchema` / `FollowupQuestion` | Graph interrupt payload. Transformed into `FreeTextPrompt` for `FreeTextQuestion`. |

Also move these schemas that are only used in API route handlers:

| Schema | Why it's API-only |
|---|---|
| `SendMessageRequestSchema` / `SendMessageRequest` | Request validation in conversation controller. Mobile sends JSON; never imports the schema. |
| `AnalysisActionRequestSchema` / `AnalysisActionRequest` | Request validation in analysis controller. |
| `ConversationListResponseSchema` / `ConversationListResponse` | Response shape for `GET /conversations`. Api-client parses JSON without this schema. |
| `MessageListResponseSchema` / `MessageListResponse` | Response shape for `GET /messages`. Mobile uses `Message[]` and `ConversationContext` directly, not this wrapper. |
| `AnalysisRunSchema` / `AnalysisRun` | Internal analysis run tracking. Not rendered by mobile. |
| `AnalysisRunListResponseSchema` / `AnalysisRunListResponse` | API response for listing runs. |
| `SnapshotRangeSchema` / `SnapshotRange` | Sub-schema of AnalysisRun (which is also being moved). |
| `AnalysisRunErrorSchema` / `AnalysisRunError` | Sub-schema of AnalysisRun. |

#### auth.dto.ts — 2 schemas to move

| Schema | Why it's API-only |
|---|---|
| `LoginRequestSchema` / `LoginRequest` | Request validation. Api-client sends raw JSON, doesn't import the schema. |
| `RegisterRequestSchema` / `RegisterRequest` | Request validation. Same pattern. |

#### artefact.dto.ts — 3 schemas to move

| Schema | Why it's API-only |
|---|---|
| `CreateArtefactRequestSchema` / `CreateArtefactRequest` | Request validation in artefact controller. |
| `UpdateArtefactStatusRequestSchema` / `UpdateArtefactStatusRequest` | Request validation. |
| `RestoreArtefactVersionRequestSchema` / `RestoreArtefactVersionRequest` | Request validation. |
| `ArtefactListResponseSchema` / `ArtefactListResponse` | API list response wrapper. |

#### pdp-goal.dto.ts — 4 schemas to move

| Schema | Why it's API-only |
|---|---|
| `ListPdpGoalsResponseSchema` / `ListPdpGoalsResponse` | API list response wrapper. |
| `UpdatePdpGoalRequestSchema` / `UpdatePdpGoalRequest` | Request validation. |
| `AddPdpGoalActionRequestSchema` / `AddPdpGoalActionRequest` | Request validation. |
| `UpdatePdpGoalActionRequestSchema` / `UpdatePdpGoalActionRequest` | Request validation. |

#### review-period.dto.ts — 1 schema to move

| Schema | Why it's API-only |
|---|---|
| `ReviewPeriodListResponseSchema` / `ReviewPeriodListResponse` | API list response wrapper. |

#### specialty types — 5 interfaces to move

| Type | Why it's API-only |
|---|---|
| `SpecialtyConfig` | Backend-only config that drives the graph. Mobile never sees it. |
| `CapabilityDefinition` | Backend-only curriculum data. |
| `EntryTypeDefinition` | Backend-only entry type config with classification signals. |
| `ArtefactTemplate` | Backend-only template config with promptHints and weights. |
| `TemplateSection` | Backend-only section definitions. |

`TrainingStageDefinition` and `SpecialtyOption` stay — they're used by `SpecialtyOptionSchema` which api-client consumes.

#### errors.ts — entire file to move

| Type | Why it's API-only |
|---|---|
| `AppError`, `ValidationError`, `NotFoundError`, `UnauthorizedError`, `ForbiddenError` | Server-side error classes. Mobile has its own error handling. |

#### types/api.types.ts — entire file to move

| Type | Why it's API-only |
|---|---|
| `ApiResponse`, `ApiErrorResponse`, `PaginationParams`, `PaginatedResponse` | API infrastructure types. Not used by mobile or api-client. |

#### Enums — 4 to move

| Enum | Why it's API-only |
|---|---|
| `MediaStatus` | Internal media processing state. |
| `MediaRefCollection` | Internal DB collection reference. |
| `OutboxStatus` | Internal outbox processing state. |
| `ReviewPeriodStatus` | Used in `ReviewPeriodSchema` which mobile uses — **WAIT**, need to check. |

Actually, `ReviewPeriodStatus` is used in `ReviewPeriodSchema` (line 10: `status: z.nativeEnum(ReviewPeriodStatus)`), which mobile uses. **KEEP.**

Corrected enum moves: **3 enums** (MediaStatus, MediaRefCollection, OutboxStatus).

---

## Implementation Plan

### Phase 1: Create destination structure in API

Create a `shared-internal` directory in the API app to receive moved types. This keeps them organised separately from NestJS module code.

**File:** `apps/api/src/shared-internal/`

```
apps/api/src/shared-internal/
  ├── dto/
  │   ├── conversation-internal.dto.ts   ← graph interrupt payloads, request/response schemas
  │   ├── auth-internal.dto.ts           ← LoginRequest, RegisterRequest
  │   ├── artefact-internal.dto.ts       ← Create/Update/Restore requests, list response
  │   ├── pdp-goal-internal.dto.ts       ← List response, update/add requests
  │   └── review-period-internal.dto.ts  ← List response
  ├── types/
  │   ├── api.types.ts                   ← ApiResponse, PaginationParams, etc.
  │   └── specialty.types.ts             ← SpecialtyConfig, ArtefactTemplate, TemplateSection, etc.
  ├── enums/
  │   ├── media-status.enum.ts
  │   ├── media-ref-collection.enum.ts
  │   └── outbox-status.enum.ts
  ├── errors.ts                          ← AppError, ValidationError, etc.
  └── index.ts                           ← barrel export
```

### Phase 2: Move types and update imports

For each type being moved:

1. Copy the schema/type/interface to the destination file in `shared-internal/`
2. Remove it from the shared package source file
3. Update ALL import paths in `apps/api/src/` from `@acme/shared` to the new local path
4. Verify no imports remain in `packages/api-client/` or `apps/mobile/`
5. Update the shared package barrel export (`packages/shared/src/dto/index.ts`, `packages/shared/src/index.ts`)

**Order of operations** (to avoid circular dependencies):

1. **Enums first** — no dependencies, simple moves
2. **errors.ts and api.types.ts** — standalone files, no schema dependencies
3. **Specialty types** (TemplateSection, ArtefactTemplate, etc.) — used by graph nodes
4. **Graph interrupt payloads** (ClassificationOption, CapabilityOption, FollowupQuestion) — used only in graph nodes and service
5. **Request/response schemas** — used in controllers and services

### Phase 3: Rebuild and verify

```bash
# Rebuild shared package (now smaller)
cd packages/shared && pnpm build

# Rebuild api-client (should still compile — no removed types it depends on)
cd packages/api-client && pnpm build

# Verify API compiles with new import paths
cd apps/api && pnpm typecheck

# Verify mobile still compiles (should be unaffected)
cd apps/mobile && pnpm typecheck

# Run API tests
cd apps/api && npm test
```

### Phase 4: Clean up shared package

- Remove empty sections from DTO files (e.g., if all request schemas were removed from a file, remove the section comment)
- Update the `packages/shared/src/dto/index.ts` barrel to only export what remains
- Remove `packages/shared/src/errors.ts` (fully moved)
- Remove `packages/shared/src/types/api.types.ts` (fully moved)
- Remove the 3 moved enum files from `packages/shared/src/enums/`
- Update `packages/shared/src/enums/index.ts`

---

## Summary: What Moves

| Source | Symbols Moving | Symbols Staying |
|---|---|---|
| `conversation.dto.ts` | 11 schemas (graph payloads, requests, responses, analysis runs) | 16 schemas (Message, Question variants, Answers, Context) |
| `auth.dto.ts` | 2 schemas (LoginRequest, RegisterRequest) | 7 schemas (AuthUser, OTP, LoginResponse, UpdateProfile) |
| `artefact.dto.ts` | 4 schemas (Create/Update/Restore requests, list response) | 11 schemas (Artefact, PdpGoal, sub-schemas, Edit, Finalise, Versions) |
| `pdp-goal.dto.ts` | 4 schemas (list response, update/add requests) | 1 schema (PdpGoalResponse) |
| `review-period.dto.ts` | 1 schema (list response) | 7 schemas (ReviewPeriod, requests, coverage) |
| `specialty/types.ts` | 5 interfaces (Config, Template, Section, EntryType, Capability) | 2 interfaces (SpecialtyOption, TrainingStageDefinition) |
| `errors.ts` | 5 classes (entire file) | 0 |
| `types/api.types.ts` | 4 interfaces (entire file) | 0 |
| enums | 3 enums (MediaStatus, MediaRefCollection, OutboxStatus) | 13 enums |

**Total: ~34 symbols moved out, ~57 remain. Shared package surface area reduced by ~37%.**

---

## Risks & Tradeoffs

- **Import churn**: Many API files will need updated imports. Use a global find-and-replace for `import { X } from '@acme/shared'` → `import { X } from '../shared-internal'`. Run typecheck to catch any missed updates.
- **No functional change**: This is a pure refactor. No runtime behaviour changes. All types stay identical — only their location changes.
- **Specialty types are the trickiest**: `TemplateSection` and `ArtefactTemplate` are imported in many graph node files. Make sure the new import path is consistent.

## Code Guidance

- Use a barrel export in `shared-internal/index.ts` so API imports stay clean: `import { FollowupQuestion, SpecialtyConfig } from '../shared-internal'`
- Don't create one file per type — group by domain (conversation, artefact, auth, etc.) to mirror the shared package structure
- Keep Zod schemas and their inferred types together (same file) — don't split `XSchema` from `type X`
