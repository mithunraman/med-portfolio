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

**LangGraph integration** (`portfolio-graph/`): State machine for AI-driven portfolio analysis with MongoDB-checkpointed graph. Three interrupt points: `present_classification`, `ask_followup`, `present_capabilities` — each resumed with typed values. Node implementations in `portfolio-graph/nodes/`.

**LLM service** (`llm/`): OpenAI structured outputs via `invokeStructured<T>()` with Zod schemas. AssemblyAI for audio transcription with UK-compliant PII redaction.

**Config** (`config/app.config.ts`): Environment variables validated at startup with Zod. Required: MONGODB_URI, JWT_SECRET (32+ chars), OPENAI_API_KEY, S3 credentials.

### Mobile (`apps/mobile`)

Expo SDK 54, React Native 0.81, React 19. File-based routing via Expo Router with typed routes. Route groups: `(auth)`, `(entry)`, `(tabs)`, `(messages)`, `(pdp-goal)`, `(review-period)`.

State management: Redux Toolkit with 9 slices (artefacts, auth, conversations, messages, onboarding, nudge, dashboard, pdpGoals, reviewPeriods).

### Shared packages

- `packages/shared`: Zod schemas, DTOs, enums, types, specialty configs, error classes. No external deps beyond Zod.
- `packages/api-client`: `createApiClient(config)` factory producing typed clients (Artefacts, Auth, Conversations, Items, Media, Dashboard, PdpGoals, ReviewPeriods). Platform-agnostic via fetch adapter.

## Key Patterns

### Result pattern (repositories)

All repository methods return `Result<T, DBError>` — they never throw. Services check `isErr()` and translate to NestJS exceptions (NotFoundException, etc.). Controllers never see DB errors directly.

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

In-process polling (not a distributed queue). Services create outbox entries; a consumer polls every 1s in batches of 5. Used to trigger async portfolio graph analysis (`AnalysisStartHandler`, `AnalysisResumeHandler`). Stale locks reset after 30s.

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
