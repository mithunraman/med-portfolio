# PDP Rearchitecture Roadmap

## Context

Our current PDP implementation only captures **actions** (with timeframe and status). The requirements call for a richer **Goal → Actions → Evidence → Review** structure. This roadmap fills those gaps.

### Key Design Decisions

| Decision | Answer |
|---|---|
| Can a goal have multiple actions? | **Yes** — multiple SMART actions grouped under one learning need |
| Are goals tied to entries? | **Both** — auto-generated from portfolio entries AND creatable independently |
| Who writes completion reviews? | **Trainee only** (supervisor review is a future phase) |
| Intended evidence field | **AI-suggested, trainee-editable** |
| Storage model | **Embedded** — actions are subdocuments inside PdpGoal (no separate collection) |
| Date model | **Both levels** — goal has a review date, each action has its own due date |

---

## Current State

```
pdp_actions collection (flat, per artefact)
├── action: string
├── timeframe: string
├── status: PENDING | ACTIVE | COMPLETED | ARCHIVED
├── dueDate: Date | null
├── userId
└── artefactId
```

### Current Queries

| Query | Filter | Sort | Used By |
|---|---|---|---|
| `findByArtefactId()` | `{ artefactId }` | — | artefacts.service (single entry) |
| `findByArtefactIds()` | `{ artefactId: {$in} }` | — | artefacts.service (list entries) |
| `findByUserId()` | `{ userId, status: {$in} }` | `dueDate asc`, limit 5 | dashboard.service |
| `countByUserId()` | `{ userId, status: {$in} }` | — | dashboard.service |
| `create()` | — | — | save.node (batch insert) |

No "about to expire" query exists — dashboard just sorts by `dueDate` ascending.

## Target State

```
pdp_goals collection (single collection, actions embedded)
├── xid: string                      # Unique external identifier
├── goal: string                     # Learning need / development objective
├── userId: ObjectId
├── artefactId: ObjectId | null      # Optional link to triggering entry
├── status: PENDING | ACTIVE | COMPLETED | ARCHIVED
├── reviewDate: Date | null          # When should this goal be reviewed/achieved by?
├── nextActionDueDate: Date | null   # Denormalized: earliest action dueDate (for dashboard sorting)
├── completionReview: string | null  # Trainee's narrative review on completion
├── actions: [                       # Embedded subdocument array
│     {
│       xid: string                  # Unique ID for the action within the goal
│       action: string               # SMART action text
│       intendedEvidence: string     # AI-suggested, trainee-editable
│       status: PENDING | ACTIVE | COMPLETED | ARCHIVED
│       dueDate: Date | null         # Action-level deadline
│       completionReview: string | null
│     }
│   ]
├── createdAt: Date
└── updatedAt: Date
```

### Indexes

- `{ userId: 1, status: 1 }` — dashboard queries
- `{ artefactId: 1 }` — entry-linked lookups
- `{ userId: 1, nextActionDueDate: 1 }` — "due soon" dashboard sorting
- `{ xid: 1 }` — unique, external ID lookups

### Query Migration

| Current Query | New Equivalent | Notes |
|---|---|---|
| `findByArtefactId()` | `PdpGoal.find({ artefactId })` | Actions come embedded — simpler |
| `findByArtefactIds()` | `PdpGoal.find({ artefactId: {$in} })` | Simpler |
| `findByUserId()` + sort by dueDate | `PdpGoal.find({ userId, status: {$in} }).sort({ nextActionDueDate: 1 })` | Uses denormalized field — no aggregation needed |
| `countByUserId()` | `PdpGoal.countDocuments({ userId, status: {$in} })` | Counts goals instead of actions |
| `create()` | `PdpGoal.insertMany()` with embedded actions | Single write per goal |

### Denormalization: `nextActionDueDate`

To avoid `$unwind` aggregation on every dashboard load, the `nextActionDueDate` field on PdpGoal is kept in sync:
- **On action dueDate change:** recalculate as `min(actions.filter(a => a.status < COMPLETED).map(a => a.dueDate))`
- **On action completion:** recalculate (completed actions are excluded)
- **Null if:** no actions have due dates, or all actions are completed

---

## Phase 1: Data Model

**Objective:** Create the `pdp_goals` collection with embedded actions, delete the old `pdp_actions` collection and all related code.

### Tasks

1. **Create `PdpGoal` schema** (Mongoose) with all fields from Target State above
2. **Create `PdpGoalsRepository`** with methods:
   - `create(goals)` — insert goals with embedded actions
   - `findByArtefactId(id)` / `findByArtefactIds(ids)` — entry-linked lookups
   - `findByUserId(userId, statuses, options?)` — dashboard query with sort/limit
   - `countByUserId(userId, statuses)` — dashboard count
   - `findById(xid)` — single goal lookup
   - `updateGoal(xid, updates)` — update goal fields
   - `addAction(goalXid, action)` — push to actions array
   - `updateAction(goalXid, actionXid, updates)` — update embedded action
   - `recalcNextDueDate(goalXid)` — sync denormalized field
3. **Create `PdpGoalsModule`** (NestJS) — register schema, provide repository
4. **Update shared types** in `packages/shared` — new `PdpGoal` and updated `PdpAction` types
5. **Update all consumers** — swap `PdpActionsRepository` for `PdpGoalsRepository` in artefacts.service, dashboard.service, graph-deps
6. **Delete old PDP code** — full cleanup listed below

### Old PDP Code Removal

**Delete entirely (4 files):**
- `apps/api/src/pdp-actions/pdp-actions.module.ts`
- `apps/api/src/pdp-actions/pdp-actions.repository.ts`
- `apps/api/src/pdp-actions/pdp-actions.repository.interface.ts`
- `apps/api/src/pdp-actions/schemas/pdp-action.schema.ts`

**Remove old shared types (2 files):**
- `packages/shared/src/enums/pdp-action-status.enum.ts` — replace with new `PdpGoalStatus` enum (or rename/reuse if statuses stay the same)
- `packages/shared/src/dto/artefact.dto.ts` — remove `PdpActionSchema` and `PdpAction` type, replace with `PdpGoal`/`PdpGoalAction` types
- `packages/shared/src/dto/dashboard.dto.ts` — update `pdpActionsDue` to new goal-based shape

**Remove old imports and DI wiring (6 files):**
- `apps/api/src/dashboard/dashboard.module.ts` — remove `PdpActionsModule` import
- `apps/api/src/dashboard/dashboard.service.ts` — remove `PDP_ACTIONS_REPOSITORY` injection, swap to `PdpGoalsRepository`
- `apps/api/src/artefacts/artefacts.module.ts` — remove `PdpActionsModule` import
- `apps/api/src/artefacts/artefacts.service.ts` — remove `PDP_ACTIONS_REPOSITORY` injection, swap to `PdpGoalsRepository`
- `apps/api/src/artefacts/mappers/artefact.mapper.ts` — update `PdpAction` type to new goal-based types

**Update graph system (6 files):**
- `apps/api/src/portfolio-graph/portfolio-graph.module.ts` — remove `PdpActionsModule` import
- `apps/api/src/portfolio-graph/portfolio-graph.service.ts` — remove `PDP_ACTIONS_REPOSITORY` injection, swap to `PdpGoalsRepository`
- `apps/api/src/portfolio-graph/graph-deps.ts` — replace `pdpActionsRepository` with `pdpGoalsRepository` in `GraphDeps`
- `apps/api/src/portfolio-graph/portfolio-graph.state.ts` — replace `PdpAction` interface and `pdpActions` channel with `PdpGoal`/`pdpGoals`
- `apps/api/src/portfolio-graph/nodes/generate-pdp.node.ts` — updated in Phase 2
- `apps/api/src/portfolio-graph/nodes/save.node.ts` — updated in Phase 2

**Update tests (3 files):**
- `apps/api/src/conversations/__tests__/helpers/test-setup.ts` — remove PDP actions model/repository registration, add PDP goals setup
- `apps/api/src/conversations/__tests__/helpers/factories.ts` — remove `pdpActionModel` and `getPdpActionsForArtefact()`, add goal-based equivalents
- `apps/api/src/conversations/__tests__/conversations.integration.spec.ts` — update assertions to verify PDP goals instead of flat actions

**Update mobile (3 files):**
- `apps/mobile/app/(tabs)/index.tsx` — update `PdpAction` imports and `PdpDueSoonModule` to use goal-based types
- `apps/mobile/app/(entry)/[artefactId].tsx` — update PDP actions section to render goals with nested actions
- `apps/mobile/src/store/slices/dashboard/thunks.ts` — update `pdpActionsDue` references to new shape

---

## Phase 2: AI Generation Updates

**Objective:** Update the LangGraph pipeline to generate goals with nested actions and intended evidence.

### Tasks

1. **Update `generate-pdp.node.ts`** prompt and Zod schema:
   ```
   Output shape: {
     goals: [{
       goal: string,             # Learning need
       actions: [{
         action: string,         # SMART action text
         intendedEvidence: string # What evidence will show completion
       }]
     }]
   }
   ```
   - Max 2 goals per entry, max 3 actions per goal
   - Temperature stays at 0.2
   - Dates are NOT AI-generated — trainee sets `reviewDate` and `dueDate` manually
2. **Update graph state** (`portfolio-graph.state.ts`):
   - `pdpActions` → `pdpGoals` (with nested actions)
3. **Update `save.node.ts`**:
   - Insert `PdpGoal` documents with embedded actions (single write per goal)
4. **Update unit tests** for generate-pdp and save nodes

---

## Phase 3: API & Mobile — Entry-Linked PDP Display

**Objective:** Surface the new goal-grouped PDP structure in the API responses and mobile app.

### Tasks

1. **Update artefact mapper** — return `pdpGoals` (with nested actions) instead of flat `pdpActions`
2. **Update API response DTOs** in `packages/shared`
3. **Update `ArtefactsService`** — use `PdpGoalsRepository.findByArtefactId/Ids` instead of old repository
4. **Update `DashboardService`** — query goals instead of flat actions, use `nextActionDueDate` for sorting
5. **Update mobile completion card** to show:
   - Goal statement as a header with review date
   - Actions listed underneath with intended evidence
6. **Add "edit intended evidence" capability** — trainee can modify AI suggestions before finalising
7. **Rebuild `packages/api-client`** after shared type changes

---

## Phase 4: Standalone Goal Creation

**Objective:** Allow trainees to create PDP goals independently of portfolio entries.

### Tasks

1. **New API endpoints**:
   - `POST /pdp-goals` — create a standalone goal with actions
   - `GET /pdp-goals` — list all goals for user (filter by status)
   - `GET /pdp-goals/:id` — get single goal
   - `PUT /pdp-goals/:id` — update goal (text, reviewDate, status)
   - `DELETE /pdp-goals/:id` — archive a goal
2. **Action management endpoints**:
   - `POST /pdp-goals/:id/actions` — add action to existing goal
   - `PUT /pdp-goals/:id/actions/:actionId` — update action (text, dueDate, intendedEvidence, status)
   - `DELETE /pdp-goals/:id/actions/:actionId` — remove action
3. **Mobile UI**:
   - "Add PDP Goal" screen accessible from dashboard or dedicated PDP tab
   - Form for goal + review date + actions (each with dueDate, intended evidence)
   - Optional linking to existing artefacts

---

## Phase 5: Review & Completion Flow

**Objective:** Enable trainees to write reflective reviews when completing actions/goals.

### Tasks

1. **Action completion flow**:
   - `PUT /pdp-goals/:id/actions/:actionId` accepts `completionReview` + `status: COMPLETED`
   - Mobile UI: prompt for short review when marking action complete ("What did you learn? What evidence did you produce?")
   - Recalculate `nextActionDueDate` on completion
2. **Goal completion flow**:
   - Goal status auto-derives from actions OR trainee manually completes
   - When all actions complete (or trainee marks goal done), prompt for goal-level review
   - `PUT /pdp-goals/:id` accepts `completionReview`
3. **Mobile UI**:
   - Review text input on completion
   - Display completed goals with their reviews in a "Completed" section

---

## Phase 6: Holistic PDP View

**Objective:** Provide a cross-entry "My PDP" view spanning the trainee's entire development plan.

### Tasks

1. **Dedicated PDP screen** in mobile app:
   - All goals grouped by status (Active, Pending, Completed)
   - Each goal shows its actions, progress, source entry (if any), and review date
   - Filter/sort by status, due date, capability area
2. **PDP summary stats** on dashboard:
   - Goals in progress / completed
   - Actions due soon (using `nextActionDueDate`)
   - Completion rate

---

## Future Phases (Out of Scope)

- **Supervisor review flow** — supervisor can comment on / approve completed PDP goals
- **ARCP integration** — link PDP goals to curriculum requirements
- **PDP templates** — pre-built goal templates by specialty or curriculum area
- **Goal linking to capabilities** — explicit link between PDP goals and curriculum capabilities

---

## Phase Sequencing

```
Phase 1 (Data Model)
  └──→ Phase 2 (AI Generation)
         └──→ Phase 3 (API & Mobile Display)
                ├──→ Phase 4 (Standalone Goals)  ← parallel with Phase 5
                └──→ Phase 5 (Review Flow)
                       └──→ Phase 6 (Holistic View)
```

Phases 1-3 are the critical path. Phases 4 and 5 can be developed in parallel once Phase 3 is complete.
