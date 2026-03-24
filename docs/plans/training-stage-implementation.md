# Training Stage Implementation Plan

## Context

The app currently has no concept of a trainee's year of training. A CT1 psychiatry trainee and an ST6 trainee get identical AI coaching. This plan adds a `trainingStage` field that flows from user profile → artefact → graph state → LLM prompts, enabling stage-appropriate coaching depth across all specialties.

**Pre-launch product** — no existing users, no backward compatibility concerns. Fields are required, not nullable.

---

## Phase 1: Shared Types & Specialty Metadata API

### Objective
Define training stage types in the shared package and expose a backend API that drives specialty/stage selection on the mobile client. The mobile app should never hardcode specialty or stage lists — the backend is the single source of truth.

### Scope
- **Included**: Shared types, specialty metadata structure, API endpoint, DTO changes
- **Excluded**: No graph changes, no prompt changes, no mobile UI

### Implementation Plan

1. **Add training stage types to shared package** (`packages/shared/src/specialty/training-stages.ts`)
   - Define a `TrainingStageDefinition` interface:
     ```
     { code: string; label: string; description: string }
     ```
     Example: `{ code: 'CT1', label: 'Core Training Year 1', description: 'First year of core psychiatry training...' }`
   - Define a `SpecialtyOption` interface for the API response:
     ```
     { specialty: Specialty; name: string; trainingStages: TrainingStageDefinition[] }
     ```
   - These are pure types — no data here. The data lives in the specialty configs on the backend.

2. **Add training stage definitions to each specialty config**
   - Extend `SpecialtyConfig` interface with `trainingStages: TrainingStageDefinition[]`
   - Add to GP config (`apps/api/src/specialties/gp/gp.training-stages.ts`):
     ```
     ST1 — "GP Specialty Training Year 1" — hospital rotations, foundational skills
     ST2 — "GP Specialty Training Year 2" — mixed hospital/GP, growing independence
     ST3 — "GP Specialty Training Year 3" — predominantly GP, exam prep, near-independent
     ```
   - Add to Psychiatry config (`apps/api/src/specialties/psychiatry/psychiatry.training-stages.ts`):
     ```
     CT1 — "Core Training Year 1" — initial psychiatric experience, supervised assessments
     CT2 — "Core Training Year 2" — broadening experience, psychotherapy exposure
     CT3 — "Core Training Year 3" — MRCPsych prep, progression point to higher training
     ST4 — "Higher Training Year 1" — developing independent practice in general psychiatry
     ST5 — "Higher Training Year 2" — sub-specialty interest, leadership development
     ST6 — "Higher Training Year 3" — approaching CCT, consultant-level practice
     ```

3. **Create specialties controller** (`apps/api/src/specialties/specialties.controller.ts`)
   - `GET /api/specialties` — **public endpoint** (no auth required, needed before login for onboarding)
   - Returns: `SpecialtyOption[]` — list of all supported specialties with their training stages
   - Reads from the specialty registry — iterates `SPECIALTY_CONFIGS` and maps to the response DTO
   - Response shape:
     ```json
     [
       {
         "specialty": 100,
         "name": "General Practice",
         "trainingStages": [
           { "code": "ST1", "label": "GP Specialty Training Year 1", "description": "..." },
           { "code": "ST2", "label": "GP Specialty Training Year 2", "description": "..." },
           { "code": "ST3", "label": "GP Specialty Training Year 3", "description": "..." }
         ]
       },
       {
         "specialty": 400,
         "name": "Psychiatry",
         "trainingStages": [
           { "code": "CT1", "label": "Core Training Year 1", "description": "..." },
           ...
         ]
       }
     ]
     ```

4. **Add `trainingStage` to shared DTOs**
   - `ArtefactSchema` in `packages/shared/src/dto/artefact.dto.ts` — add `trainingStage: z.string()`
   - Add a `SpecialtyOptionSchema` Zod schema for the API response

5. **Add to API client** (`packages/api-client`)
   - Add `getSpecialties(): Promise<SpecialtyOption[]>` method
   - This is what the mobile app calls during onboarding

6. **Rebuild shared + api-client packages**

### Deliverables
- `packages/shared/src/specialty/training-stages.ts` — `TrainingStageDefinition` and `SpecialtyOption` interfaces
- Updated `SpecialtyConfig` interface with `trainingStages` field
- `gp.training-stages.ts` and `psychiatry.training-stages.ts` — stage definitions per specialty
- `GET /api/specialties` endpoint returning all supported specialties and stages
- API client method `getSpecialties()`
- Updated artefact DTO with `trainingStage`

### Best Industry Patterns
- **Backend-driven UI**: The mobile client never hardcodes specialty or stage lists. Adding a new specialty (e.g., Foundation) automatically appears in the mobile picker without an app update. This is critical for a mobile app where App Store review creates deployment lag.
- **Public metadata endpoint**: `GET /api/specialties` is unauthenticated because it's needed during onboarding before the user has completed registration. This follows the pattern of config/metadata endpoints being public (like `/api/health` or `/api/config`).
- **Colocation**: Training stage definitions live next to the specialty they belong to (`gp/gp.training-stages.ts`), not in a separate central file. Each specialty owns its full config.

### Code Guidance
- The `GET /api/specialties` controller should be a thin NestJS controller with a single method. No service layer needed — it reads directly from the specialty registry via `getSpecialtyConfig()`.
- Mark the endpoint with `@Public()` decorator to bypass JwtAuthGuard.
- The response is fully cacheable — add `Cache-Control: public, max-age=3600` header. Specialty metadata changes only on deploy, not per-request.
- Keep `TrainingStageDefinition` minimal. Don't add fields "just in case" — `code`, `label`, and `description` are sufficient. The `description` powers tooltip/helper text on mobile.

### Risks
- **Adding a new specialty requires a deploy**: Since the backend drives the list, you can't add a specialty without deploying the API. This is acceptable pre-launch and for the foreseeable future — specialty configs require templates, capabilities, and prompts that all need code changes anyway.

---

## Phase 2: Backend Schema & Data Flow

### Objective
Store `specialty` and `trainingStage` on the user and artefact, and thread `trainingStage` through to the portfolio graph state. Remove all hardcoded `Specialty.GP` references.

### Scope
- **Included**: User schema, artefact schema, artefact creation, processing context, graph state, graph invocation, outbox payload, review periods, profile API
- **Excluded**: No LLM prompt changes yet, no mobile UI

### Implementation Plan

1. **User schema** (`apps/api/src/auth/schemas/user.schema.ts`)
   - Add `specialty: Specialty` — required field, set during onboarding
   - Add `trainingStage: string` — required field, set during onboarding
   - Enforce at the API level: registration/onboarding must include both fields

2. **Artefact schema** (`apps/api/src/artefacts/schemas/artefact.schema.ts`)
   - Add `trainingStage: string` — required, snapshots the user's stage at entry creation time
   - A trainee who progresses from CT2 → CT3 mid-year keeps CT2 on older entries

3. **Artefact creation** (`apps/api/src/artefacts/artefacts.service.ts`)
   - Remove hardcoded `specialty: Specialty.GP`
   - Read `specialty` and `trainingStage` from the authenticated user
   - Set both on the new artefact

4. **Processing service** (`apps/api/src/processing/processing.service.ts`)
   - Remove hardcoded `specialty: Specialty.GP`
   - Read specialty from the artefact (via conversation → artefact lookup)
   - Add `trainingStage` to `StageContext` interface

5. **Portfolio graph state** (`apps/api/src/portfolio-graph/portfolio-graph.state.ts`)
   - Add: `trainingStage: Annotation<string>({ reducer: (_, b) => b, default: () => '' })`

6. **Graph service** (`apps/api/src/portfolio-graph/portfolio-graph.service.ts`)
   - Update `startGraph()` params to include `trainingStage: string`
   - Pass into `graph.invoke()` initial state

7. **Analysis start handler** (`apps/api/src/outbox/handlers/analysis-start.handler.ts`)
   - Read `trainingStage` from the artefact and include in the `startGraph()` call
   - Update the outbox payload type to include `trainingStage`

8. **Review periods service** (`apps/api/src/review-periods/review-periods.service.ts`)
   - Remove hardcoded `getSpecialtyConfig(Specialty.GP)`
   - Read specialty from the user (the review period belongs to a user, who has a specialty)

9. **Profile API** (`apps/api/src/auth/auth.controller.ts` or new `users.controller.ts`)
   - `PATCH /api/users/me` — accepts `{ specialty, trainingStage }`
   - Validates `trainingStage` against the specialty's `trainingStages` list from the registry
   - Returns updated user

### Deliverables
- User model has required `specialty` and `trainingStage` fields
- Artefact model has required `trainingStage` field
- All 3 hardcoded `Specialty.GP` references removed
- `trainingStage` flows: user → artefact → outbox → graph state
- `PATCH /api/users/me` endpoint with validation

### Best Industry Patterns
- **Snapshot at creation**: Artefact stores the training stage at the time of entry creation. This is the same pattern already used for `specialty` — the artefact is a point-in-time record.
- **Validate against registry**: When the user sets their training stage via `PATCH /api/users/me`, the backend validates the stage code against the specialty's `trainingStages` array. Invalid combinations (e.g., GP + CT1) are rejected with a 400.
- **Single responsibility for hardcoded fix**: Removing the 3 `Specialty.GP` references is done here because we're already touching these files. It also unblocks multi-specialty support — everything downstream works for any registered specialty.

### Code Guidance
- Don't create a separate `UserProfile` model or collection. Two fields on the existing User schema is the right call.
- The `@CurrentUser()` decorator already provides the authenticated user on the request. If it currently only returns `{ userId, role }`, extend it to include `specialty` and `trainingStage` from the JWT payload (or populate from DB).
- The artefact creation should read from the user, not accept specialty/stage as request body params. The user's profile is the source of truth — clients shouldn't be able to override it per-artefact.
- In the review periods service, the user is already accessible (review periods belong to a user). Thread the user's specialty through rather than adding a specialty field to the review period model.

### Risks
- **JWT payload size**: If `specialty` and `trainingStage` are added to the JWT, the token grows slightly. This is negligible (two short strings). Alternatively, read from DB on each request — but the JWT approach is faster and these fields change rarely.
- **Onboarding dependency**: Registration must now collect specialty and training stage. Phase 4 (mobile UI) must be coordinated — until the mobile onboarding is built, you can set these via the API directly for testing.

---

## Phase 3: Stage Context Prompt System

### Objective
Build the prompt injection mechanism that gives each LLM node stage-appropriate instructions, without modifying the templates or specialty configs.

### Scope
- **Included**: Stage context definitions per specialty, utility function to generate context blocks, injection into all 5 LLM nodes
- **Excluded**: No mobile UI, no template changes, no new entry types

### Implementation Plan

1. **Create stage context definitions** (`apps/api/src/specialties/stage-context.ts`)
   - A single file containing a `Record<Specialty, Record<string, string>>` mapping specialty + stage code to a context paragraph
   - Each context paragraph is a 2-3 sentence instruction to the LLM describing the trainee's level and what the AI should emphasise

   GP stages:
   ```
   ST1 → "This trainee is in ST1, often rotating through hospital posts outside GP.
          They are building foundational clinical skills. Frame questions around what
          they observed and learned. Help them connect hospital experiences to general
          practice principles. They may need help with RCGP curriculum mapping."

   ST2 → "This trainee is in ST2, gaining GP experience and developing clinical
          reasoning. Ask questions that probe their decision-making and encourage
          them to consider the whole-patient context — family, social, community
          factors. They should be developing their consultation skills."

   ST3 → "This trainee is in ST3, preparing for independent practice and the RCA
          exam. Challenge them with consultant-level thinking — managing uncertainty,
          leading the practice team, population health, and capability breadth. Expect
          well-reasoned clinical decisions and mature reflections."
   ```

   Psychiatry stages:
   ```
   CT1 → "This trainee is in CT1, early in core psychiatry training. They are
          learning to take psychiatric histories, perform MSE, and assess risk under
          supervision. Ask specific, structured questions that help them articulate
          what they observed. They may need help identifying the relevant clinical
          concepts and connecting observations to diagnostic frameworks."

   CT2 → "This trainee is in CT2, broadening their psychiatric experience and
          beginning psychotherapy exposure. They should be developing formulation
          skills and understanding unconscious dynamics. Ask questions that encourage
          deeper psychological thinking beyond surface-level clinical description."

   CT3 → "This trainee is in CT3, preparing for MRCPsych and the critical
          progression point to higher training. They should demonstrate competent
          clinical reasoning, risk assessment, and prescribing rationale. Ask
          questions that test their ability to integrate biological, psychological,
          and social perspectives in formulation."

   ST4 → "This trainee is in ST4, the first year of higher specialty training.
          They are developing independent practice in general adult psychiatry.
          Ask questions that probe their clinical decision-making without supervision
          prompts. They should be taking ownership of management plans."

   ST5 → "This trainee is in ST5, developing sub-specialty interests and leadership
          skills. Ask questions about service-level impact, team leadership, and
          how they are developing expertise in their area of interest. They should
          be supervising junior trainees."

   ST6 → "This trainee is approaching CCT as a consultant psychiatrist. Probe
          leadership decisions, service-level thinking, and teaching/supervision
          skills. Expect mastery-level clinical reasoning and the ability to manage
          systemic complexity. They should think like a consultant."
   ```

2. **Create utility function** (same file)
   ```
   getStageContext(specialty: Specialty, trainingStage: string): string
   ```
   Returns the context paragraph for the given specialty + stage combination.
   If the stage is not found in the map, returns a generic fallback:
   `"Adjust your coaching to the trainee's apparent level of experience based on their language and clinical reasoning."`

3. **Inject into all 5 LLM nodes**

   Each node follows the same pattern:
   - Read `state.trainingStage`
   - Call `getStageContext(specialty, state.trainingStage)`
   - Add `{trainingStageContext}` to the system prompt template

   Per-node specifics:

   | Node | Where to inject | Impact |
   |------|----------------|--------|
   | **classify.node.ts** | System prompt (line ~62) | Low — classification is objective. But note: "this is an early trainee, their language may be less clinical — classify based on content not vocabulary" |
   | **check-completeness.node.ts** | System prompt (line ~37) | Medium — a CT1 might not articulate formulation depth, that's acceptable. An ST6 missing formulation is a genuine gap |
   | **ask-followup.node.ts** | System prompt (line ~35) | **Highest impact** — coaching tone and question depth change most here. Early trainees get scaffolded questions, senior trainees get challenging open questions |
   | **reflect.node.ts** | System prompt (line ~60) | High — reflection voice should match trainee level. "I learned" for juniors, "I led" for seniors |
   | **generate-pdp.node.ts** | System prompt (line ~74) | High — PDP goals shift from "Review NICE guidelines" (junior) to "Lead a teaching session" (senior) |

### Deliverables
- `apps/api/src/specialties/stage-context.ts` — context definitions for GP (3 stages) and Psychiatry (6 stages) + `getStageContext()` utility
- All 5 LLM nodes updated with `{trainingStageContext}` in system prompts

### Best Industry Patterns
- **Prompt layering**: System prompt built in layers: base instruction → specialty context → stage context → template context → transcript. Each layer is independent. Adding a new specialty or stage never touches node logic — just add entries to the context map.
- **Centralised prompt content**: All stage context paragraphs live in ONE file, not scattered across 5 nodes. Easy to review, update, and A/B test prompt wording.
- **Separation of data and behaviour**: The stage-context file is pure data (a lookup map). The nodes are behaviour (how to use the data). Neither knows about the other's internals.

### Code Guidance
- The stage context map is a plain object, not a class or service. No dependency injection needed — it's pure data.
- Each context paragraph should be 2-4 sentences max. LLMs respond better to concise persona instructions than long paragraphs.
- Do NOT adjust template section weights per stage. Templates are stage-agnostic — only the prompting behaviour changes. This avoids combinatorial complexity (10 templates × 9 stages = 90 variants is a maintenance nightmare).
- The utility function is synchronous and pure — no DB calls, no async.
- Add the stage context block AFTER the specialty name but BEFORE the template sections in each prompt. This positions it as persona context, not task instruction.

### Risks
- **Prompt quality**: The context paragraphs need careful wording. Too prescriptive → formulaic LLM output. Too vague → no effect. Plan for 1-2 iterations of prompt tuning after initial implementation.
- **Testing**: Hard to unit test LLM prompt changes. Recommend manual testing with sample transcripts at each stage level (CT1 vs ST6 with the same clinical scenario) to verify the coaching tone actually shifts.
- **Regression risk**: Changing all 5 node prompts simultaneously could introduce subtle regressions in GP entry quality. Test GP entries before and after to ensure no degradation.

---

## Phase 4: Mobile — Specialty & Stage Selection

### Objective
Let users set their specialty and training stage during onboarding. The mobile client fetches the available options from `GET /api/specialties` — no hardcoded lists.

### Scope
- **Included**: Onboarding screens, settings screen, Redux state, API integration
- **Excluded**: No changes to chat UI, entry detail, or export

### Implementation Plan

1. **Fetch specialties from backend**
   - On app launch (or onboarding start), call `apiClient.getSpecialties()`
   - Cache the response in Redux or local state — it changes only on API deploy
   - This drives the picker UI dynamically

2. **Update onboarding Redux slice** (`apps/mobile/src/store/slices/onboardingSlice.ts`)
   - Add `specialty: Specialty` and `trainingStage: string` to onboarding state
   - Add reducers: `setSpecialty`, `setTrainingStage`

3. **Create specialty selection screen** (in onboarding flow)
   - **Screen 1: "What are you training in?"**
     - Renders the list from `GET /api/specialties`
     - Each option shows the specialty name
     - Single tap to select, then advance
   - **Screen 2: "What year are you in?"**
     - Renders `trainingStages[]` from the selected specialty
     - Shows `label` as the primary text, `description` as helper text
     - Single tap to select, then advance

4. **Persist to backend on onboarding completion**
   - Call `PATCH /api/users/me` with `{ specialty, trainingStage }`
   - Store in auth Redux slice for session use
   - Gate entry to the main app on both fields being set

5. **Settings screen**
   - Add "Specialty" and "Training Stage" rows under profile section
   - Tapping opens pickers populated from the cached `GET /api/specialties` response
   - Changing specialty resets training stage and requires re-selection
   - Calls `PATCH /api/users/me` on change

6. **API client update** (`packages/api-client`)
   - Add `getSpecialties(): Promise<SpecialtyOption[]>` to the appropriate client
   - Add `updateProfile(data: { specialty: Specialty; trainingStage: string }): Promise<User>` to the auth client
   - Rebuild api-client package

### Deliverables
- Two onboarding screens (specialty picker, stage picker) driven by backend data
- Settings screen rows for updating specialty and training stage
- API client methods for fetching specialties and updating profile
- Redux state management for specialty and stage

### Best Industry Patterns
- **Backend-driven UI**: The mobile app renders whatever the API returns. Adding Foundation Programme support later requires zero mobile code changes — just register the config on the backend, deploy, and it appears in the picker on next app launch.
- **Gate, don't nag**: Specialty and training stage are required — gate the main app behind onboarding completion rather than showing dismissible prompts. Pre-launch, there's no reason to allow incomplete profiles.
- **Cache metadata locally**: The specialties list is near-static. Fetch once, cache in Redux. Don't re-fetch on every screen render. Invalidate only on app restart or pull-to-refresh in settings.

### Code Guidance
- The specialty picker should be a flat list with large tap targets, not a dropdown. There are only 2-3 options initially.
- The stage picker should show `label` as primary text and `description` as secondary text below it. The description helps trainees who aren't sure which stage code maps to their year.
- Add the onboarding screens to the `(auth)` route group. Gate navigation: after login/register, check `user.specialty` — if not set, redirect to specialty selection before entering `(tabs)`.
- Don't build a generic "form" component. Two single-select list screens are simpler and better UX than a multi-field form.

### Risks
- **API availability during onboarding**: If `GET /api/specialties` fails, the user can't complete onboarding. Show a retry button with an error state. The endpoint is lightweight and should rarely fail.
- **Stage progression UX**: When a trainee moves from CT3 to ST4 (a programme change, not just a year increment), they need to update in settings. This is a manual action — consider a future enhancement for annual stage progression reminders, but not for MVP.

---

## Phase Summary

| Phase | What | Effort | Dependencies |
|-------|------|--------|-------------|
| **Phase 1** | Shared types + `GET /api/specialties` endpoint | Small (2-3 hours) | None |
| **Phase 2** | Backend schema, data flow, remove GP hardcoding | Medium (4-6 hours) | Phase 1 |
| **Phase 3** | Stage context prompt injection into 5 LLM nodes | Medium (3-4 hours) | Phase 2 |
| **Phase 4** | Mobile onboarding + settings screens | Medium (4-6 hours) | Phase 1 (needs API) + Phase 2 (needs PATCH endpoint) |

**Recommended order**: Phase 1 → Phase 2 → Phase 3 and Phase 4 in parallel.

**Total scope**: ~15 hours across all phases.

### Key Architecture Decision

```
Mobile App                          Backend
──────────                          ───────

Onboarding ──GET /api/specialties──→ Reads from SpecialtyConfig registry
  │                                   Returns: [{ specialty, name, trainingStages[] }]
  │
  ├─ User picks specialty + stage
  │
  └──PATCH /api/users/me──────────→ Validates stage against registry
                                    Stores on User document

New Entry ──POST /api/artefacts───→ Reads user.specialty + user.trainingStage
                                    Snapshots both onto Artefact

Analysis ──outbox──────────────────→ trainingStage flows into graph state
                                    Each LLM node calls getStageContext()
                                    Prompt includes stage-appropriate coaching
```

The backend is the single source of truth. The mobile app is a thin renderer. Adding a new specialty requires only backend changes + deploy.
