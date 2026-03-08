# Phase 4: Standalone PDP Goal Management — Backend API + API Client

## Context

Phase 1 created the `pdp_goals` data model with embedded actions and wired it into the LangGraph pipeline and existing consumers (artefacts, dashboard). Currently, PDP goals can only be created automatically via the AI analysis pipeline. Phase 4 adds CRUD API endpoints so trainees can create, view, update, and archive PDP goals independently of portfolio entries.

**Scope:** Backend API (NestJS) + `api-client` package only. Mobile UI is a separate phase.

**Key decisions:**
- Soft delete (archive) — DELETE sets `status: ARCHIVED`, does not remove the document
- Page-based pagination (page + limit), matching the items pattern
- PUT for updates (not PATCH), per earlier decision
- `xid` is the external ID used in API paths (not `_id`)

---

## Step 1: Add shared request/response DTOs

**File to create:** `packages/shared/src/dto/pdp-goal.dto.ts`

Defines Zod schemas for requests and responses. The response schemas (`PdpGoalSchema`, `PdpGoalActionSchema`) already exist in `artefact.dto.ts` — reuse them via import.

```typescript
// ── Request schemas ──

CreatePdpGoalActionRequestSchema = z.object({
  action: z.string().min(1).max(500),
  intendedEvidence: z.string().max(500).default(''),
  dueDate: z.string().datetime().nullable().optional(),
});

CreatePdpGoalRequestSchema = z.object({
  goal: z.string().min(1).max(500),
  reviewDate: z.string().datetime().nullable().optional(),
  actions: z.array(CreatePdpGoalActionRequestSchema).min(1).max(10),
});

UpdatePdpGoalRequestSchema = z.object({
  goal: z.string().min(1).max(500).optional(),
  status: z.nativeEnum(PdpGoalStatus).optional(),
  reviewDate: z.string().datetime().nullable().optional(),
  completionReview: z.string().max(2000).nullable().optional(),
});

AddPdpGoalActionRequestSchema = z.object({
  action: z.string().min(1).max(500),
  intendedEvidence: z.string().max(500).default(''),
  dueDate: z.string().datetime().nullable().optional(),
});

UpdatePdpGoalActionRequestSchema = z.object({
  action: z.string().min(1).max(500).optional(),
  intendedEvidence: z.string().max(500).optional(),
  status: z.nativeEnum(PdpGoalStatus).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  completionReview: z.string().max(2000).nullable().optional(),
});

// ── Response schema ──

PdpGoalListResponseSchema = z.object({
  items: z.array(PdpGoalSchema),  // reuse from artefact.dto.ts
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});
```

Export types for all schemas.

**File to modify:** `packages/shared/src/dto/index.ts` — add `export * from './pdp-goal.dto'`

---

## Step 2: Add repository methods for CRUD

**File to modify:** `apps/api/src/pdp-goals/pdp-goals.repository.interface.ts`

Add these new interfaces and methods to `IPdpGoalsRepository`:

```
// New data interfaces:
CreateStandalonePdpGoalData {
  userId: Types.ObjectId;
  artefactId: null;
  goal: string;
  reviewDate: Date | null;
  actions: { action: string; intendedEvidence: string; dueDate: Date | null }[];
}

UpdatePdpGoalData {
  goal?: string;
  status?: PdpGoalStatus;
  reviewDate?: Date | null;
  completionReview?: string | null;
}

ListPdpGoalsQuery {
  userId: Types.ObjectId;
  status?: PdpGoalStatus;
  page: number;
  limit: number;
}

ListPdpGoalsResult {
  items: PdpGoal[];
  total: number;
}

// New methods on IPdpGoalsRepository:
findByXid(xid: string, userId: Types.ObjectId): Promise<Result<PdpGoal | null, DBError>>;
listByUserId(query: ListPdpGoalsQuery): Promise<Result<ListPdpGoalsResult, DBError>>;
updateByXid(xid: string, userId: Types.ObjectId, data: UpdatePdpGoalData): Promise<Result<PdpGoal | null, DBError>>;
addAction(xid: string, userId: Types.ObjectId, action: { action: string; intendedEvidence: string; dueDate: Date | null }): Promise<Result<PdpGoal | null, DBError>>;
updateAction(goalXid: string, actionXid: string, userId: Types.ObjectId, data: { action?: string; intendedEvidence?: string; status?: PdpGoalStatus; dueDate?: Date | null; completionReview?: string | null }): Promise<Result<PdpGoal | null, DBError>>;
removeAction(goalXid: string, actionXid: string, userId: Types.ObjectId): Promise<Result<PdpGoal | null, DBError>>;
```

Note: The existing `create()` method is used by the graph pipeline (batch insert, artefactId required). Standalone creation will use the same `create()` method but with `artefactId: null` — no separate method needed. However, `CreatePdpGoalData.artefactId` must be updated to `Types.ObjectId | null` (currently requires ObjectId).

**File to modify:** `apps/api/src/pdp-goals/pdp-goals.repository.ts`

Implement the new methods following the items repository pattern (`apps/api/src/items/items.repository.ts`):
- `findByXid()` — `findOne({ xid, userId }).lean()`
- `listByUserId()` — `find({ userId, status? }).sort({ createdAt: -1 }).skip().limit().lean()` + `countDocuments()`
- `updateByXid()` — `findOneAndUpdate({ xid, userId }, { $set: data }, { new: true }).lean()`
- `addAction()` — `findOneAndUpdate({ xid, userId }, { $push: { actions: actionData } }, { new: true }).lean()`, then recalculate `nextActionDueDate`
- `updateAction()` — `findOneAndUpdate({ xid, userId, 'actions.xid': actionXid }, { $set: { 'actions.$.<fields>' } }, { new: true }).lean()`, then recalculate `nextActionDueDate`
- `removeAction()` — `findOneAndUpdate({ xid, userId }, { $pull: { actions: { xid: actionXid } } }, { new: true }).lean()`; reject if last action

Add a private `recalcNextDueDate(goal: PdpGoal)` helper that computes `min(actions.filter(a => a.status < COMPLETED).map(a => a.dueDate))` and writes it to the document. Call it after addAction, updateAction, and removeAction.

**Important:** The repository's `create()` method already generates `xid` for goals and actions via `nanoidAlphanumeric()` (the caller does not provide them). The same pattern must be followed for `addAction()` — generate `xid` for the new action in the repository before inserting.

---

## Step 3: Create PDP goals service

**File to create:** `apps/api/src/pdp-goals/pdp-goals.service.ts`

Follow the items service pattern (`apps/api/src/items/items.service.ts`):
- Inject `PDP_GOALS_REPOSITORY`
- Each method: call repository → check `isErr()` → throw `InternalServerErrorException` or `NotFoundException` → map to DTO via mapper

Methods:
```
create(userId: string, dto: CreatePdpGoalRequest): Promise<PdpGoal>
findById(userId: string, goalId: string): Promise<PdpGoal>
list(userId: string, query: ListPdpGoalsDto): Promise<PdpGoalListResponse>
update(userId: string, goalId: string, dto: UpdatePdpGoalRequest): Promise<PdpGoal>
archive(userId: string, goalId: string): Promise<void>
addAction(userId: string, goalId: string, dto: AddPdpGoalActionRequest): Promise<PdpGoal>
updateAction(userId: string, goalId: string, actionId: string, dto: UpdatePdpGoalActionRequest): Promise<PdpGoal>
removeAction(userId: string, goalId: string, actionId: string): Promise<PdpGoal>
```

---

## Step 4: Create PDP goal mapper

**File to create:** `apps/api/src/pdp-goals/mappers/pdp-goal.mapper.ts`

A standalone mapper for the PDP goals controller. Reuses the same mapping logic as `artefact.mapper.ts` but standalone:

```typescript
function toPdpGoalDto(doc: PdpGoalDocument): PdpGoal {
  return {
    id: doc.xid,
    goal: doc.goal,
    status: doc.status,
    reviewDate: doc.reviewDate?.toISOString() ?? null,
    completionReview: doc.completionReview,
    actions: doc.actions.map(a => ({
      id: a.xid,
      action: a.action,
      intendedEvidence: a.intendedEvidence,
      status: a.status,
      dueDate: a.dueDate?.toISOString() ?? null,
      completionReview: a.completionReview,
    })),
  };
}
```

---

## Step 5: Create controller DTOs

**Files to create in** `apps/api/src/pdp-goals/dto/`:

- `create-pdp-goal.dto.ts` — `class CreatePdpGoalDto extends createZodDto(CreatePdpGoalRequestSchema) {}`
- `update-pdp-goal.dto.ts` — `class UpdatePdpGoalDto extends createZodDto(UpdatePdpGoalRequestSchema) {}`
- `list-pdp-goals.dto.ts` — local Zod schema with `z.coerce.number()` for query params (page, limit, status)
- `add-pdp-goal-action.dto.ts` — `class AddPdpGoalActionDto extends createZodDto(AddPdpGoalActionRequestSchema) {}`
- `update-pdp-goal-action.dto.ts` — `class UpdatePdpGoalActionDto extends createZodDto(UpdatePdpGoalActionRequestSchema) {}`
- `index.ts` — re-export all

---

## Step 6: Create PDP goals controller

**File to create:** `apps/api/src/pdp-goals/pdp-goals.controller.ts`

Follow the items controller pattern (`apps/api/src/items/items.controller.ts`):

```
@Controller('pdp-goals')

POST   /pdp-goals                              → create
GET    /pdp-goals                              → list (query: page, limit, status)
GET    /pdp-goals/:id                          → findById
PUT    /pdp-goals/:id                          → update
DELETE /pdp-goals/:id  @HttpCode(204)          → archive (soft delete)
POST   /pdp-goals/:id/actions                  → addAction
PUT    /pdp-goals/:id/actions/:actionId        → updateAction
DELETE /pdp-goals/:id/actions/:actionId        → removeAction (returns updated goal)
```

All endpoints use `@CurrentUser() user: CurrentUserPayload` for auth. No special roles needed.

---

## Step 7: Update PDP goals module

**File to modify:** `apps/api/src/pdp-goals/pdp-goals.module.ts`

Add controller and service:
```typescript
@Module({
  imports: [MongooseModule.forFeature(...)],
  controllers: [PdpGoalsController],
  providers: [
    PdpGoalsService,
    { provide: PDP_GOALS_REPOSITORY, useClass: PdpGoalsRepository },
  ],
  exports: [PDP_GOALS_REPOSITORY],
})
```

---

## Step 8: Register module in AppModule

**File to modify:** `apps/api/src/app.module.ts`

Add `PdpGoalsModule` to the imports array. Currently `PdpGoalsModule` is only imported transitively via `ArtefactsModule` and `DashboardModule` — it needs to be in `AppModule` directly for its controller to be registered.

---

## Step 9: Create API client

**File to create:** `packages/api-client/src/clients/pdp-goals.client.ts`

Follow the items client pattern (`packages/api-client/src/clients/items.client.ts`):

```typescript
class PdpGoalsClient {
  constructor(private readonly client: BaseApiClient) {}

  async create(dto: CreatePdpGoalRequest): Promise<PdpGoal>
  async list(params?: { page?: number; limit?: number; status?: PdpGoalStatus }): Promise<PdpGoalListResponse>
  async getById(id: string): Promise<PdpGoal>
  async update(id: string, dto: UpdatePdpGoalRequest): Promise<PdpGoal>
  async archive(id: string): Promise<void>
  async addAction(goalId: string, dto: AddPdpGoalActionRequest): Promise<PdpGoal>
  async updateAction(goalId: string, actionId: string, dto: UpdatePdpGoalActionRequest): Promise<PdpGoal>
  async removeAction(goalId: string, actionId: string): Promise<PdpGoal>
}
```

**File to modify:** `packages/api-client/src/clients/index.ts` — add export
**File to modify:** `packages/api-client/src/index.ts` — add `pdpGoals: new PdpGoalsClient(baseClient)` to `createApiClient()`

---

## Step 10: Build packages

Run `cd packages/shared && npm run build` then `cd packages/api-client && npm run build` so downstream consumers (mobile) can pick up the new types and client.

---

## File Summary

| Action | File |
|--------|------|
| Create | `packages/shared/src/dto/pdp-goal.dto.ts` |
| Modify | `packages/shared/src/dto/index.ts` |
| Modify | `apps/api/src/pdp-goals/pdp-goals.repository.interface.ts` |
| Modify | `apps/api/src/pdp-goals/pdp-goals.repository.ts` |
| Create | `apps/api/src/pdp-goals/pdp-goals.service.ts` |
| Create | `apps/api/src/pdp-goals/mappers/pdp-goal.mapper.ts` |
| Create | `apps/api/src/pdp-goals/dto/create-pdp-goal.dto.ts` |
| Create | `apps/api/src/pdp-goals/dto/update-pdp-goal.dto.ts` |
| Create | `apps/api/src/pdp-goals/dto/list-pdp-goals.dto.ts` |
| Create | `apps/api/src/pdp-goals/dto/add-pdp-goal-action.dto.ts` |
| Create | `apps/api/src/pdp-goals/dto/update-pdp-goal-action.dto.ts` |
| Create | `apps/api/src/pdp-goals/dto/index.ts` |
| Create | `apps/api/src/pdp-goals/pdp-goals.controller.ts` |
| Modify | `apps/api/src/pdp-goals/pdp-goals.module.ts` |
| Modify | `apps/api/src/app.module.ts` |
| Create | `packages/api-client/src/clients/pdp-goals.client.ts` |
| Modify | `packages/api-client/src/clients/index.ts` |
| Modify | `packages/api-client/src/index.ts` |

---

## Reference Patterns

These existing files serve as the primary patterns to follow:

- **Controller:** `apps/api/src/items/items.controller.ts`
- **Service:** `apps/api/src/items/items.service.ts`
- **Repository interface:** `apps/api/src/items/items.repository.interface.ts`
- **Repository implementation:** `apps/api/src/items/items.repository.ts`
- **Mapper:** `apps/api/src/items/mappers/item.mapper.ts`
- **DTOs (shared):** `packages/shared/src/dto/item.dto.ts`
- **DTOs (controller):** `apps/api/src/items/dto/`
- **API client:** `packages/api-client/src/clients/items.client.ts`

---

## Verification

1. **Unit tests:** `cd apps/api && ./node_modules/.bin/jest --config jest.unit.config.ts`
2. **Integration tests:** `cd apps/api && ./node_modules/.bin/jest --config jest.config.ts`
3. **Build check:** `cd packages/shared && npm run build && cd ../api-client && npm run build`
4. **Smoke test:** Start the API and use curl/httpie to verify:
   - `POST /pdp-goals` creates a standalone goal
   - `GET /pdp-goals` lists goals with pagination
   - `GET /pdp-goals/:id` returns a single goal
   - `PUT /pdp-goals/:id` updates goal fields
   - `DELETE /pdp-goals/:id` archives the goal (returns 204)
   - `POST /pdp-goals/:id/actions` adds an action
   - `PUT /pdp-goals/:id/actions/:actionId` updates an action
   - `DELETE /pdp-goals/:id/actions/:actionId` removes an action
