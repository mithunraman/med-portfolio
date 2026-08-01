# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Deployment Status

**The backend and mobile app are not yet live.** There are no production users, no production data, and no deployed environments to maintain compatibility with.

**Implications when making changes:**
- **No backfill scripts needed** for schema changes — just update the schema.
- **No backward-compatibility shims** for API / DTO changes — breaking changes are fine.
- **No data migrations** — breaking changes to Mongoose schemas are acceptable; local dev data can be dropped and recreated.
- **No deprecation periods** for field renames, removals, or enum changes.
- Feature flags, version gates, and phased rollouts are not needed for the code itself (though they may be part of a product feature's behavior).

Keep the solution lean: avoid writing code purely to handle state that doesn't exist yet.

## Build & Development Commands

This is a pnpm monorepo using Turborepo. Always use `pnpm` (not npm) for package management.

```bash
# Install dependencies
pnpm install

# Build all packages (required before dev — shared/api-client must compile first)
pnpm build

# Development
pnpm dev          # All apps except mobile
pnpm dev:api      # API only (NestJS watch mode, port 3001)
pnpm dev:mobile   # Mobile only (Expo dev server)

# Lint & typecheck
pnpm lint
pnpm typecheck
```

### Testing (API)

```bash
cd apps/api
./node_modules/.bin/jest --config jest.unit.config.ts                    # Unit tests (.spec.ts)
./node_modules/.bin/jest --config jest.config.ts                         # Integration tests (.integration.spec.ts)
./node_modules/.bin/jest --config jest.unit.config.ts -- path/to/file    # Single test file
npm test                                                                 # Both unit + integration
```

Unit test timeout: 10s. Integration test timeout: 30s.

### Building packages after changes

After modifying `packages/shared` or `packages/api-client`, rebuild before running dependent apps:

```bash
cd packages/api-client && pnpm build   # Compiles to dist/, required for mobile to pick up changes
cd packages/shared && pnpm build       # Compiles to dist/
```

## Architecture

**Monorepo structure:** `apps/api` (NestJS), `apps/mobile` (Expo/React Native), `apps/web` (Vite/React/Mantine), `packages/shared` (Zod schemas, DTOs, enums), `packages/api-client` (typed HTTP client with adapter pattern).

### Backend (`apps/api`)

NestJS with MongoDB (Mongoose). All routes prefixed with `/api`. Global guards: JwtAuthGuard + RolesGuard. Request validation via ZodValidationPipe.

**Key modules:** auth (JWT/Passport), artefacts, conversations, portfolio-graph, items, media, storage (S3/R2), llm, processing, dashboard, review-periods, pdp-goals, outbox, analysis-runs.

**LangGraph integration** (`portfolio-graph/`): State machine for AI-driven portfolio analysis with MongoDB-checkpointed graph. Three interrupt points: `ask_followup` and `present_capabilities` (each resumed with typed values), plus the terminal `reject_entry` (never resumed — the API refuses to resume terminal questions). Node implementations in `portfolio-graph/nodes/`.

The entry type is **chosen by the trainee at artefact creation**, not inferred — `POST /artefacts` requires `entryType`, validates it against the specialty config (`isValidEntryType`), persists it as `artefact.artefactType`, and it is seeded into graph state at start. There is no classification node. `entryType` is immutable for a run: no node writes it, and `artefactType` is absent from `UpdateArtefactData`, so nothing can write it back from graph state after creation — the trainee's choice is the artefact's identity, and that is enforced by the type rather than by convention.

A run that confirms no capabilities produces no entry. `present_capabilities` interrupts with a terminal message (unresumable, so the run parks there), and `capabilitiesRouter` routes a zero-capability run to `END` rather than into the compose chain. That edge — not a sentinel value or per-node guards — is what makes the bail-out skip cleanly.

Because the trainee now picks the type, they can pick the wrong one; the mitigation, if it ever proves necessary, is a soft "this reads more like a CCR" nudge rather than restoring a classifier. The per-entry-type signal phrases that primed the old classifier were deleted along with it — recover them with `git log -S classificationSignals -- apps/api/src/specialties` if that feature lands.

Relevance and prompt-injection screening lives in `check_completeness` (a leading `isRelevant` field on its schema), not in a separate node. The verdict is acted on **only at follow-up round 0** — both in the node and in `completenessRouter` (→ `reject_entry`); later rounds ignore it so one noisy verdict can't kill a journey mid-flight. It fails open: a failed grading call returns `isRelevant: true`.

Separately, `check_completeness` bails on a **globally empty partition after round 0** (`assignments.length === 0`), returning no state update. This is load-bearing: grading an empty partition floors every probe to `missing`, and `ratchetTiers` deliberately honours `missing` as a structural re-partition rather than noise — so it would also overwrite `bestTierByProbe` and wipe the record of everything the trainee had already cleared. The guard is scoped to rounds > 0 because at round 0 that same `missing` floor is exactly what puts every section into the elicitation loop.

**LLM service** (`llm/`): OpenAI structured outputs via `invokeStructured<T>()` with Zod schemas. AssemblyAI for audio transcription with UK-compliant PII redaction.

**Config** (`config/app.config.ts`): Environment variables validated at startup with Zod. Required: MONGODB_URI, JWT_SECRET (32+ chars), S3 credentials, plus credentials for whichever LLM pools the active `LLM_VARIANT` uses (see below).

**LLM credentials are per-pool, for every provider.** There is no provider-specific env var: all of them use `<PREFIX>_API_KEY_<i>` / `<PREFIX>_BASE_URL_<i>` (i = 1..8), with the prefix coming from `POOL_SPECS` in `llm/llm-pools.ts` — `OPENAI`, `OPENROUTER`, `AZURE_FOUNDRY_INTERACTIVE`, `AZURE_FOUNDRY_ANALYSIS`. Variant A therefore needs `OPENAI_API_KEY_1` + `OPENAI_BASE_URL_1`, **not** a bare `OPENAI_API_KEY`. Each pool also has a cap (`LLM_RPM_<POOL>`), which **does** default (60 / 35 / 18) — omitting one boots at that value rather than failing, so set it explicitly if you provisioned your own quota. Credentials are different: `ModelConfigService` fails startup for any pool in use that lacks endpoints, which is what lets `LlmEndpointResolver.resolveBucket` return a non-optional endpoint.

### Mobile (`apps/mobile`)

Expo SDK 54, React Native 0.81, React 19. File-based routing via Expo Router with typed routes. Route groups: `(auth)`, `(entry)`, `(tabs)`, `(messages)`, `(pdp-goal)`, `(review-period)`.

State management: Redux Toolkit with 9 slices (artefacts, auth, conversations, messages, onboarding, nudge, dashboard, pdpGoals, reviewPeriods).

### Shared packages

- `packages/shared`: Zod schemas, DTOs, enums, types, specialty configs, error classes. No external deps beyond Zod.
- `packages/api-client`: `createApiClient(config)` factory producing typed clients (Artefacts, Auth, Conversations, Items, Media, Dashboard, PdpGoals, ReviewPeriods). Platform-agnostic via fetch adapter.

## Key Patterns

### Result pattern (repositories)

All repository methods return `Result<T, DBError>` — they never throw. Services check `isErr()` and translate to NestJS exceptions (NotFoundException, etc.). Controllers never see DB errors directly.

### Ownership predicate at the persistence layer (defence in depth)

Any repository method that **reads or mutates a user-owned record must scope its query by `userId`**, even when the only current caller has already verified ownership. The owner predicate belongs in the filter (`findOne({ xid, userId })`, `findOneAndUpdate({ _id, userId }, …)`), not solely in caller discipline — a future caller that forgets the pre-check (e.g. wiring a method to a new controller route) would otherwise turn a "safe" method into an IDOR with no compiler or test signal.

- A non-matching `(id, userId)` filter must surface as `NOT_FOUND` (e.g. `matchedCount === 0` or a null result), never a silent no-op.
- Do **not** add unscoped sibling methods (`findByXidInternal(xid)`); if a genuine system/no-user caller ever needs one, name it to scream the hazard and document why.
- Reference implementations: `saveGoal` / `updateGoal` (`pdp-goals.repository.ts`), `updateArtefactById` (`artefacts.repository.ts`), `updateStatus` / `findByXid` (`media.repository.ts`).

### ID strategy

- **xid**: external id, 21-char nanoid (`nanoidAlphanumeric()`), visible to customers in API routes and responses.
- **_id**: internal id, used for relations and repo queries. Backed by MongoDB's `ObjectId` today, but that's an infrastructure detail — treat `_id` as an opaque internal identity, not a Mongo concept.
- Responses always return xid, never _id.

### Service layer must not know about MongoDB driver types

Services are the domain/application layer. Keep Mongo driver vocabulary out of them:

- **Do not** use `Types.ObjectId`, `new Types.ObjectId(...)`, or `isValidObjectId()` inside service files. These are persistence concerns that belong in the repository.
- **Do not** validate id shape (hex length, ObjectId format) in services. If an id reached the service, the controller/guard layer is responsible for having validated it.
- Services should pass ids to repositories as the type the repository interface declares (typically `string` for xids, or a branded domain id). The repository performs any conversion to storage-native types internally.
- When adding a new repository method, design the interface in domain terms (`findByXid(xid: string)`, `upsertDismissal(userId: string, noticeId: string)`) — never leak `Types.ObjectId` through the interface.

Existing services have drift on this rule (e.g. `new Types.ObjectId(userId)` sprinkled through `artefacts.service.ts`, `pdp-goals.service.ts`). Don't propagate that pattern into new code; when touching an existing service, prefer pushing the conversion down into the repository rather than adding another call site.

### Auth decorators

All routes are protected by default (global JwtAuthGuard + RolesGuard). Use `@Public()` to bypass JWT auth on specific routes. `@Roles()` uses ordinal comparison (`user.role >= requiredRole`). `@CurrentUser()` extracts the JWT user from the request.

### Transactions

`TransactionService.withTransaction()` wraps operations atomically. The callback receives a `ClientSession` that **must** be passed to every database operation within it — reads AND writes — or those calls execute outside the transaction. This includes guard reads (e.g., checking if an active record exists before creating one). Before passing `session` to a repository method, verify the method's interface and implementation actually accept and forward `session?: ClientSession` to the underlying Mongoose query; if they don't, update interface + implementation + call site together.

### Message processing pipeline

Messages have three content fields: `rawContent` (original input) → `cleanedContent` (post-processing) → `content` (final for display). Audio messages go through AssemblyAI transcription with automatic PII redaction before cleaning.

### Outbox pattern

In-process polling (not a distributed queue). Services create outbox entries; a consumer polls every `DEFAULT_POLL_INTERVAL_MS` (100ms) and runs up to `MAX_CONCURRENCY` (5) jobs at once — a concurrency cap, not a batch size. Used to trigger async portfolio graph analysis (`AnalysisStartHandler`, `AnalysisResumeHandler`).

Claimed jobs hold a lock for `DEFAULT_LOCK_DURATION_MS` (`outbox.service.ts`, currently 10 minutes). `resetStaleLocks()` runs each tick and frees only entries whose `lockedUntil` has already passed, so the recovery delay *is* the lock duration — there is no separate stale-lock timer. Prefer citing these constants by name: the previous values here (1s / 30s) had drifted from the code by 10–20×, and comments elsewhere had built risk arguments on the wrong numbers.

### Version history

Snapshot-before-edit: editing an artefact first snapshots the current state. Restoring a version also snapshots current state first, enabling undo. Entity-agnostic service.

### Mobile logging

Never use raw `console.log/info/warn/error` in mobile app code. Use the structured logger at `apps/mobile/src/utils/logger/` which provides scoped loggers, log-level filtering, and sensitive data redaction. Create a scoped logger per module: `const myLogger = logger.createScope('MyModule')`. For error reporting, use `Sentry.captureException()` with `tags` (static, filterable) and `extra` (dynamic, searchable context).

### Mobile environment

`EXPO_PUBLIC_API_URL` must use your machine's local IP (not `localhost`), since Expo runs on a physical device or emulator. JWT tokens stored in Expo SecureStore (native OS keychain), not AsyncStorage.

## Code Style

- TypeScript strict mode. Unused vars prefixed with `_`.
- Prettier: single quotes, trailing commas (es5), semicolons, 100 char width.
- ESLint: `no-explicit-any` is warn (not error).
- NestJS backend uses CommonJS modules; everything else uses ESNext.
- Experimental decorators enabled in API tsconfig.
