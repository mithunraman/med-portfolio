# Signup UX — Implementation Plan

Operationalises [signup-ux-spec.md](signup-ux-spec.md). Captures the architecture decisions from the design discussion and breaks the work into implementation-ready phases.

**Cross-references:**
- Spec: [signup-ux-spec.md](signup-ux-spec.md)
- Compliance plan: [compliance-implementation-plan.md](compliance-implementation-plan.md) — Decision 1 (Art. 9(2)(h) + DPA Sch.1 Pt.1 §2(2)(f))
- DPIA: [docs/privacy/DPIA_CoreReflectionPipeline_2026-05-17.md](../privacy/DPIA_CoreReflectionPipeline_2026-05-17.md)

---

## Clarifying note

One detail remains parametric on existing code structure: the new `acknowledgement` block lands in **whichever Redux slice currently holds `init.updatePolicy`** (likely the dashboard slice, based on `fetchInit.fulfilled` ownership). The route effect imports from the same slice. Everything else is locked in.

---

## Overall objective

Ship a single-screen signup-time acknowledgement flow that produces lawful-basis evidence under **GDPR Art. 9(2)(h) + DPA Sch.1 Pt.1 §2(2)(f)**, with five structural properties:

1. **Backend TypeScript notice catalog** — document files and registry split; each version frozen on activation; git history is the byte record.
2. **Append-only MongoDB acceptance log** — idempotent per `(userId, noticeVersion)`; server-captured IP/UA.
3. **Atomic gate delivery via `/init`** — discriminated-union `acknowledgement` block returns "needs ack" and the active notice document together; no second round-trip, no version-race window.
4. **Material-change re-acknowledgement** — `requiresReAckFromPriorVersions` flag on each version; server chain-walks the registry to decide; user always re-acks the **active** version only (one screen, one POST, one row per transition event).
5. **Structured-block notice body** — `NoticeDocument.body` is `NoticeBlock[]` (`paragraph` + `links`); type-safe end-to-end; additive evolution without parser dependencies.

Flow: `login → notice-and-ack → select-specialty → select-stage → (tabs)`.

## Architectural principle (anchor for future changes)

Onboarding is modelled as a **sequence of independent gates over real data**, not as a state machine over a progress field. Each gate has one signal derived from a fact that exists for product reasons (an ack row, a specialty value). The route effect is a pure function of those facts; screens update state and refresh `/init` — they do **not** know what comes next.

**Consequence:** do not add `onboardingStep`, `hasCompletedOnboarding`, or `hasAcknowledged` to the user document. New gates = one new signal on `/init` + one more `if` branch in `_layout.tsx`.

---

## Phase 1 — Notice catalog (backend TS config, no public endpoint)

### Objective
Ship the version-frozen notice catalog with block-based body and material-change flag. Consumed in-process by `InitService` (Phase 5); no HTTP surface.

### Scope
**In:** module skeleton, full `NoticeDocument` Zod schema in `packages/shared` (incl. `NoticeBlock` discriminated union and `requiresReAckFromPriorVersions`), frozen `notices/v1.0.ts`, `registry.ts` with boot-time invariant, unit tests.
**Out:** any HTTP endpoint (Phase 5 inlines the document into `/init`), markdown parsing.

### Implementation plan
1. Create `apps/api/src/acknowledgements/`:
   ```
   ├── notices/v1.0.ts            ← frozen document
   ├── registry.ts                ← active + all + boot-time invariant
   ├── acknowledgements.module.ts
   └── __tests__/registry.spec.ts
   ```
2. Define schemas in `packages/shared/src/dto/acknowledgement.dto.ts`:
   ```ts
   export const acknowledgementIdSchema = z.enum(['role_uk_trainee', 'patient_anon_duty']);

   export const acknowledgementCopySchema = z.object({
     id: acknowledgementIdSchema,
     label: z.string(),
     required: z.boolean(),
   });

   export const noticeBlockSchema = z.discriminatedUnion('type', [
     z.object({ type: z.literal('paragraph'), text: z.string() }),
     z.object({
       type: z.literal('links'),
       items: z.array(z.object({ label: z.string(), url: z.string().url() })),
     }),
   ]);

   export const noticeDocumentSchema = z.object({
     version: z.string(),
     // If true, users whose latest acceptance predates this version are re-prompted.
     // Set by counsel review per version. v1.0 = false (no prior versions exist).
     requiresReAckFromPriorVersions: z.boolean(),
     title: z.string(),
     subtitle: z.string().nullable(),
     body: z.array(noticeBlockSchema),
     acknowledgements: z.array(acknowledgementCopySchema),
     ctaLabel: z.string(),
     ctaDisclaimer: z.string(),
   });
   ```
3. `notices/v1.0.ts`:
   ```ts
   // FROZEN on activation. Do not edit. Ship a new vN.M.ts for any change.
   import type { NoticeDocument } from '@acme/shared';

   export const NOTICE_V1_0: NoticeDocument = {
     version: 'v1.0',
     requiresReAckFromPriorVersions: false,
     title: 'Before you start',
     subtitle: null,
     body: [
       {
         type: 'paragraph',
         text: 'Logdit helps UK trainee doctors turn clinical experiences into portfolio entries. Your reflections are transcribed and analysed by AI to help draft each entry.',
       },
       {
         type: 'links',
         items: [
           { label: 'Privacy Policy', url: 'https://logdit.app/privacy' },
           { label: 'Terms of Service', url: 'https://logdit.app/terms' },
         ],
       },
     ],
     acknowledgements: [
       { id: 'role_uk_trainee', label: 'I am a UK doctor in training', required: true },
       { id: 'patient_anon_duty', label: 'I will anonymise patient identifiers in my reflections, in line with GMC guidance.', required: true },
     ],
     ctaLabel: 'Create account',
     ctaDisclaimer: 'By tapping Create account you agree to the Privacy Policy and Terms of Service.',
   } as const;
   ```
4. `registry.ts`:
   ```ts
   import { NOTICE_V1_0 } from './notices/v1.0';

   export const NOTICE_REGISTRY = {
     active: NOTICE_V1_0,
     all: [NOTICE_V1_0],   // chronological — earliest first
   } as const;

   {
     const versions = NOTICE_REGISTRY.all.map(v => v.version);
     if (versions.length === 0) throw new Error('NOTICE_REGISTRY.all must be non-empty');
     if (new Set(versions).size !== versions.length) throw new Error('NOTICE_REGISTRY.all has duplicate versions');
     if (!NOTICE_REGISTRY.all.includes(NOTICE_REGISTRY.active)) {
       throw new Error('NOTICE_REGISTRY.active must be one of NOTICE_REGISTRY.all');
     }
   }
   ```
5. Module exports `NOTICE_REGISTRY` and types only — no controller, no service.
6. Register module in `app.module.ts` so boot-time assertions run on app start.
7. Unit tests: empty/duplicate/orphan-active configs throw; `NOTICE_V1_0` parses against Zod; `requiresReAckFromPriorVersions` missing → Zod parse fails; malformed block (`type` not in union) → Zod parse fails.

### Deliverables
- Module files above, frozen `v1.0.ts`, passing invariant tests.

### Best industry patterns
- **Config-as-code with deploy-gated review** (Stripe Connect TOS, GitHub TOS) — activation = deploy; counsel review = PR review.
- **Document/registry separation** — frozen files are content-addressed via git, no computed hashes needed; activation is a 3-line registry diff.
- **Boot-time invariant assertions** — misconfigs die at module init, not in production at a user's signup.
- **Structured blocks for content** (Notion API, Stripe Connect onboarding, Sanity Portable Text) — type-safe, renderer-controlled styling, no markdown parser dependency, strictly additive when new block types appear.

### Code guidance
- Each `notices/v*.ts` is a leaf module — imports types only, exports one constant, `as const`.
- No service wrapper around the registry constant. Phase 5 reads `NOTICE_REGISTRY.active` directly.
- Zod fields **required**, not `.optional()` — forces every version to make every call explicitly.
- `NOTICE_REGISTRY.all` must be chronological (earliest first) — chain walk in Phase 5 depends on this.

### Risks / tradeoffs
- Once `v1.0.ts` is merged and any user signs against it, the file is immutable forever. PR template should reject edits to existing `notices/v*.ts` files.
- `registry.ts` diffs are the release moment — treat that PR carefully.

---

## Phase 2 — Acceptance log (schema, repository, POST endpoint)

### Objective
Persist what users agreed to, idempotently, with full audit metadata. Expose the two reads `InitService` needs.

### Scope
**In:** Mongoose schema, repository returning `Result<>`, service, `POST /api/acknowledgements`, idempotency via compound unique index, server-captured IP/UA, integration tests.
**Out:** mobile work, `/init` wiring (Phase 5).

### Implementation plan
1. `schemas/acknowledgement.schema.ts` — fields per spec §4.2. Compound unique index `{ userId: 1, noticeVersion: 1 }`. `xid` unique-indexed via `nanoidAlphanumeric()`. Index `userId` to support `findLatestVersionForUser`.
2. `acknowledgements.repository.ts`:
   - `create(input): Result<Acknowledgement, DBError>`
   - `findByUserAndVersion(userId, version): Result<Acknowledgement | null, DBError>`
   - `findLatestVersionForUser(userId): Result<string | null, DBError>` — sort by `recordedAt` desc, limit 1, projection `{ noticeVersion: 1, _id: 0 }`
3. `acknowledgements.service.ts`:
   - Resolve `noticeVersion` against `NOTICE_REGISTRY.all`; 400 if unknown.
   - Pull required ack IDs from that registry entry; 400 on any missing or `given: false`.
   - Call `findByUserAndVersion`; if exists, return it (idempotent path → **200**).
   - Else call `create`. On unique-index conflict (concurrent retry), re-read and return the winner.
4. `acknowledgements.controller.ts`: `@Post()` with Zod-validated DTO. Inject IP/UA via `@Req()` — never accept from body.
5. Verify `app.set('trust proxy', …)` is set so `req.ip` reflects the real client behind any LB.
6. Integration tests:
   - Happy path → 201 with row.
   - Duplicate POST → no dup row, same xid returned (200).
   - Missing ack ID → 400. `given: false` for required ack → 400. Unknown `noticeVersion` → 400.
   - Concurrent POSTs (`Promise.all` x2) → one row, no surfaced error.
   - `findLatestVersionForUser` returns the most recent row's version; `null` for users with no rows.

### Deliverables
- Schema, repository, service, controller, integration tests passing.

### Best industry patterns
- **Append-only audit log** (Stripe `tos_acceptance`, AWS CloudTrail) — mutable rows can't answer "what did this user agree to and when" across copy changes.
- **Idempotency via natural key + unique index** — lighter-weight Stripe `Idempotency-Key` pattern; DB enforces correctness, service handles the race.
- **`Result<T, DBError>` repositories** — project convention; services translate to HTTP, controllers stay thin.
- **Server-captured IP/UA** — standard for audit records where the client could lie.

### Code guidance
- Only the service knows about `NOTICE_REGISTRY`. Repository takes `noticeVersion: string` opaquely.
- No `Types.ObjectId` in service code (per CLAUDE.md). Repository converts internally.
- No `revokedAt` / soft-delete fields. Append-only.
- Reuse `nanoidAlphanumeric()` for `xid` (project convention).

### Risks / tradeoffs
- IP/UA in MongoDB carry minor privacy weight — document in DPIA records-of-processing.
- Confirm proxy config before merge or IP captured will be the LB address.

---

## Phase 3 — Shared DTOs + api-client wiring

### Objective
Type the POST endpoint and the extended `InitResponse` end-to-end.

### Scope
**In:** Zod request/response schemas in `packages/shared`, discriminated-union `acknowledgement` block on `InitResponse`, `createAcknowledgement` method on api-client, both packages rebuilt.
**Out:** standalone `getNotice` method (Phase 5 inlines).

### Implementation plan
1. Complete `packages/shared/src/dto/acknowledgement.dto.ts` — add to Phase 1's schemas:
   ```ts
   export const createAcknowledgementRequestSchema = z.object({
     noticeVersion: z.string(),
     acknowledgements: z.array(z.object({
       id: acknowledgementIdSchema,
       given: z.boolean(),
     })),
   });

   export const acknowledgementResponseSchema = z.object({
     xid: z.string(),
     noticeVersion: z.string(),
     recordedAt: z.string().datetime(),
     acknowledgements: z.array(z.object({
       id: acknowledgementIdSchema,
       given: z.boolean(),
     })),
   });
   ```
2. Extend `InitResponse`:
   ```ts
   export const initAcknowledgementSchema = z.discriminatedUnion('needs', [
     z.object({ needs: z.literal(false) }),
     z.object({ needs: z.literal(true), document: noticeDocumentSchema }),
   ]);

   // existing InitResponse gains:
   acknowledgement: initAcknowledgementSchema,
   ```
3. `packages/api-client/src/acknowledgements.ts`: export `createAcknowledgement(body)` via the existing `createApiClient` factory. **No `getNotice` method.**
4. Build both packages:
   ```bash
   cd packages/shared && pnpm build && cd ../api-client && pnpm build
   ```

### Deliverables
- Zod-validated DTOs, extended `InitResponse`, typed `createAcknowledgement`, both packages compiled to `dist/`.

### Best industry patterns
- **Zod as single source of truth** for wire schemas — server validates input, client gets types, no drift.
- **Discriminated union** for "needed vs not needed" — encodes "document present iff needs" invariant in the type; consumers narrow without null checks.

### Code guidance
- DTOs in `shared` know nothing about transport.
- `NoticeDocument` and `NoticeBlock` defined once in `shared`, imported by backend.
- No `getNotice` method "for symmetry" — it's dead weight.

### Risks / tradeoffs
- Forgetting to rebuild `api-client` is the most common breakage in this repo. Make the build step explicit in PR description.

---

## Phase 4 — Mobile notice-and-ack screen

### Objective
Render the notice from the cached `/init` response, capture acknowledgements, POST, refresh `/init` so the route effect advances.

### Scope
**In:** new screen, stack registration, render from `init.acknowledgement.document`, block renderer module, checkboxes from document, disabled-CTA logic, in-app browser links, POST + error UX, scoped logger, a11y.
**Out:** any on-mount notice fetch, routing decisions (gate's job — Phase 5), callout block (not in MVP).

### Implementation plan
1. Install dependency:
   ```bash
   cd apps/mobile && pnpm expo install expo-web-browser
   ```
2. Create block-renderer module `apps/mobile/src/components/notice-blocks/`:
   - `NoticeBlocks.tsx` — exhaustive `switch` over `block.type`:
     ```tsx
     export function NoticeBlocks({ blocks }: { blocks: NoticeBlock[] }) {
       return (
         <>
           {blocks.map((block, i) => {
             switch (block.type) {
               case 'paragraph': return <ParagraphBlock key={i} {...block} />;
               case 'links':     return <LinksBlock     key={i} {...block} />;
             }
           })}
         </>
       );
     }
     ```
   - `ParagraphBlock.tsx` — single styled `<Text>`.
   - `LinksBlock.tsx` — `<Pressable>` row per item; each calls `WebBrowser.openBrowserAsync(item.url)`.
3. Create `apps/mobile/app/(auth)/notice-and-ack.tsx`. Local state: `ackState: Record<AcknowledgementId, boolean>`, `submitting`, `error`.
4. Read document from init slice:
   ```tsx
   const ack = useAppSelector(s => s.<initSlice>.init?.acknowledgement);
   if (!ack || !ack.needs) return null;  // gate redirects; render nothing
   const document = ack.document;
   ```
   Discriminated union narrows — `document` is typed-non-null inside the `needs: true` branch.
5. Initialize `ackState` from `document.acknowledgements[]`. **Never hardcode IDs** — adding a third ack in v1.1 requires zero client change.
6. Render layout:
   ```tsx
   <>
     <Header title={document.title} subtitle={document.subtitle} />
     <NoticeBlocks blocks={document.body} />
     <AckCheckboxes items={document.acknowledgements} state={ackState} onChange={...} />
     <CTA label={document.ctaLabel} disclaimer={document.ctaDisclaimer} disabled={!allRequiredTicked} onPress={...} />
   </>
   ```
7. CTA enabled iff every `required: true` entry has `ackState[id] === true`.
8. On CTA:
   ```tsx
   await api.acknowledgements.createAcknowledgement({
     noticeVersion: document.version,
     acknowledgements: Object.entries(ackState).map(([id, given]) => ({ id, given })),
   });
   await dispatch(fetchInit()).unwrap();
   // no manual navigation — route effect re-runs with needs:false
   ```
9. On failure: inline error banner + retry button. Stay on screen. No forward navigation.
10. Register screen in `apps/mobile/app/(auth)/_layout.tsx` Stack.
11. Scoped logger: `const log = logger.createScope('NoticeAndAck')`. Error on POST failure. Never log IP/UA.
12. A11y: each checkbox row is one touch target; `accessibilityRole="checkbox"`, `accessibilityState={{ checked }}`.

### Deliverables
- `notice-and-ack.tsx`, block-renderer module (`NoticeBlocks` + 2 block components), stack entry, working render/post/error flow, scoped logger.

### Best industry patterns
- **Render-from-server, not render-from-locales** — kills client/server copy drift; document is the legal artefact.
- **Atomic snapshot through the BFF** (Stripe hosted-onboarding) — version + bytes arrive together; no version-race window.
- **In-app browser (`SFSafariViewController` / Custom Tabs)** — Apple/Google's recommended pattern for in-app web content; preserves originating screen.
- **Screen doesn't navigate forward** — refreshes `/init` and lets the gate decide; decouples screens from flow shape.
- **Exhaustive switch over discriminated union** — TypeScript flags any new block type that isn't handled; renderer cannot drift from schema.
- **Iterate from document, not hardcoded IDs** — additive changes don't break the screen.

### Code guidance
- One screen file, one block module. No abstraction layer until a second screen needs the same primitives.
- No Redux slice for the notice — read from the existing init slice.
- Errors surface as a banner inside the screen, not a toast — user must see the failure before reattempting.
- Aim under ~150 lines for the screen (no fetch state, no separate loading skeleton).
- Each block component is ~30 lines — small enough that styling lives co-located, no shared utility temptation.

### Risks / tradeoffs
- Deploy bumping to v1.1 between `/init` and POST: server validates against `NOTICE_REGISTRY.all`, v1.0 still known, row reflects what user saw. Atomic.
- Force-quit mid-flow with no row written is spec'd behaviour (§3.4). Warm relaunch → `/init` → document re-arrives → user completes. Verified in Phase 6.

---

## Phase 5 — `/init` populates `acknowledgement` (chain walk + fail-closed); route effect refactor

### Objective
Server inlines gate signal + notice document atomically, **with version-aware chain walk for material re-acknowledgement**, fail-closed on lookup error. Mobile fires `/init` on auth transition (not just inside `(tabs)`), and the `_layout.tsx` route effect gates ack → specialty → tabs as a pure function of `init` state.

### Scope
**In:** chain-walk logic in `InitService`, fail-closed fallback, hoist `/init` dispatch into `_layout.tsx`, refactor route effect.
**Out:** per-user re-ack tracking UI (the screen is the same for first-time and re-ack).

### Implementation plan

**Backend:**

1. Inject `AcknowledgementsRepository` into `InitService`. Import `NOTICE_REGISTRY` from acknowledgements module.
2. Add to existing `Promise.allSettled` block in `apps/api/src/init/init.service.ts`:
   ```ts
   this.acknowledgementsRepository.findLatestVersionForUser(userId),
   ```
3. Build `acknowledgement` via chain walk + fail-closed:
   ```ts
   let acknowledgement: InitResponse['acknowledgement'];

   if (latestResult.status === 'fulfilled' && latestResult.value.isOk()) {
     const userLatestVersion = latestResult.value.value;  // string | null
     const active = NOTICE_REGISTRY.active;

     if (userLatestVersion === null) {
       acknowledgement = { needs: true, document: active };
     } else if (userLatestVersion === active.version) {
       acknowledgement = { needs: false };
     } else {
       const idxStart = NOTICE_REGISTRY.all.findIndex(v => v.version === userLatestVersion) + 1;
       const idxEnd   = NOTICE_REGISTRY.all.findIndex(v => v.version === active.version);
       const traversed = NOTICE_REGISTRY.all.slice(idxStart, idxEnd + 1);
       const anyMaterial = traversed.some(v => v.requiresReAckFromPriorVersions);
       acknowledgement = anyMaterial
         ? { needs: true, document: active }
         : { needs: false };
     }
   } else {
     this.logger.warn(`Ack lookup failed for user ${userId}; failing closed`);
     acknowledgement = { needs: true, document: NOTICE_REGISTRY.active };
   }
   ```
4. Add `acknowledgement` to the `InitResponse` return.

**Mobile — hoist `/init` to auth transition:**

5. In `app/_layout.tsx`, add an effect ahead of the existing routing effect:
   ```tsx
   const init = useAppSelector(s => s.<initSlice>.init);
   const initLoading = useAppSelector(s => s.<initSlice>.loading);
   const initError = useAppSelector(s => s.<initSlice>.error);

   useEffect(() => {
     if (isLoggedIn && !init && !initLoading && !initError) {
       dispatch(fetchInit());
     }
   }, [isLoggedIn, init, initLoading, initError, dispatch]);
   ```
6. Update JSDoc on `initializeAuth` in `apps/mobile/src/store/slices/authSlice.ts` to clarify that cold-launch network hydration happens in `_layout.tsx`, not in the thunk. The thunk itself stays local.

**Mobile — route effect refactor:**

7. Replace the existing routing effect in `apps/mobile/app/_layout.tsx`:
   ```tsx
   useEffect(() => {
     if (isLoading || (isLoggedIn && !init)) return;

     const inAuthGroup = segments[0] === '(auth)';
     const onAckScreen = segments[1] === 'notice-and-ack';
     const onSpecialtyScreen =
       segments[1] === 'select-specialty' || segments[1] === 'select-stage';

     const needsAck       = isLoggedIn && init?.acknowledgement.needs === true;
     const needsSpecialty = isLoggedIn && !needsAck && user && !user.specialty;

     if (!isLoggedIn && !inAuthGroup) {
       router.replace('/(auth)/intro');
     } else if (needsAck && !onAckScreen) {
       router.replace('/(auth)/notice-and-ack');
     } else if (needsSpecialty && !onSpecialtyScreen) {
       router.replace('/(auth)/select-specialty');
     } else if (isLoggedIn && !needsAck && !needsSpecialty && inAuthGroup) {
       router.replace('/(tabs)');
     }
   }, [isLoading, init, isLoggedIn, user, segments, router]);
   ```
8. Extend the existing `<LoadingScreen />` condition to cover `isLoggedIn && !init` — no auth/tab screens mount while `init === null` post-login.

**Tests:**

9. Integration on `/init`:
   - User with no ack rows → `{ needs: true, document: <v1.0> }`.
   - User with v1.0 row, server still on v1.0 → `{ needs: false }`.
   - User with v1.0 row, server on v1.1 (immaterial) → `{ needs: false }`.
   - User with v1.0 row, server on v1.1 (material) → `{ needs: true, document: <v1.1> }`.
   - User with v1.0 row, server on v1.5 with v1.3 material → `{ needs: true, document: <v1.5> }`.
   - User with v1.5 row, server on v1.5 → `{ needs: false }`.
   - Repo throws → `{ needs: true, document: <active> }` (fail-closed); warning logged.

### Deliverables
- Extended `InitResponse`, `InitService` with chain-walk + fail-closed, `/init` dispatch hoisted to `_layout.tsx`, route effect rewritten, loading state extended, updated JSDoc, integration tests.

### Best industry patterns
- **BFF aggregate endpoint** — `/init` already the project's hydration call; extending it keeps the gating model in one place.
- **Atomic snapshot delivery** — version + bytes in one response, no race window.
- **Fail-closed default** for compliance gates — worst case the user retries; can't accidentally let an un-acked user through.
- **Server-derived gate state** — log is source of truth; no denormalized booleans to keep in sync.
- **Declarative route gating** — route effect is a pure function of state; screens update state and let the gate decide.
- **Chain-walk over version chronology** — encodes "material change happened somewhere upstream" in O(n) traversal; n is small (versions per year). The decision lives next to the data (`requiresReAckFromPriorVersions` per registry entry).

### Code guidance
- `findLatestVersionForUser` is a pure projection (`{ noticeVersion: 1, _id: 0 }`). Don't pull the full document.
- The chain-walk relies on `NOTICE_REGISTRY.all` being chronologically ordered. Document this in registry.ts.
- Route effect is the **only** place that makes routing decisions for onboarding gates. No `if (needsX) router.push(...)` inside screens.
- After POST in Phase 4, refresh `/init` and let the route effect re-run. No imperative navigation.
- Don't add `hasAcknowledged` or `onboardingStep` to the user document.

### Risks / tradeoffs
- **App-launch network dependency.** Authenticated cold launches now block on `/init` before any post-login screen renders. Existing init-error surface handles failure — same UX as today's dashboard fetch, hoisted earlier.
- **Loading flicker** mitigated by holding `<LoadingScreen />` until `init` arrives. No auth screens mount with `init === null` for logged-in users.
- **DSAR erasure** flips `needs` back to `true` at next launch — correct behaviour, document in DPIA notes.
- **First-signup race**: between `POST /acknowledgements` and the `/init` refresh, ensure the refresh observes a committed read. Mongo defaults are sufficient on single-replica/majority configs.
- **Existing `(tabs)` `useEffect` fetches `/init` again** — leave it as a refresh; harmless. Optional cleanup later.

---

## Phase 6 — QA, acceptance criteria, ship

### Objective
Verify spec §7 acceptance criteria against iOS + Android builds; merge when green.

### Scope
**In:** unit + integration suites green, manual matrix (incl. re-ack scenarios), a11y pass, fail-closed verification, atomic-snapshot verification.
**Out:** post-launch monitoring.

### Implementation plan
- `pnpm typecheck && pnpm lint` workspace-wide.
- `cd apps/api && npm test` (unit + integration).
- Manual matrix on real iOS + Android builds:

| Case | iOS | Android |
|---|---|---|
| Fresh signup: ack both → land on `select-specialty` | ☐ | ☐ |
| Fresh signup, force-quit between ack POST and `/init` refresh, relaunch → land on `select-specialty` | ☐ | ☐ |
| Fresh signup, force-quit on `notice-and-ack`, relaunch → land on `notice-and-ack` | ☐ | ☐ |
| Fresh signup, complete ack + specialty + stage → `(tabs)`. Next launch → straight to `(tabs)` | ☐ | ☐ |
| Returning user with row + specialty → straight to `(tabs)`, no flash of `notice-and-ack` | ☐ | ☐ |
| CTA disabled until both checked | ☐ | ☐ |
| POST network failure → inline error + retry, no forward nav | ☐ | ☐ |
| Privacy + Terms links open in-app browser; state preserved on return | ☐ | ☐ |
| VoiceOver / TalkBack reads each checkbox row as one unit | ☐ | ☐ |
| No "consent" string in any visible copy | ☐ | ☐ |
| Double-tap CTA → one row, no duplicate (server returns 200 with existing) | ☐ | ☐ |
| Mock `findLatestVersionForUser` throws → fail-closed; document still served; user lands on screen | ☐ | ☐ |
| Already-acked user `/init` payload size <2KB (no document) | ☐ | ☐ |
| `<LoadingScreen />` shown while `init === null` post-login (no flash of auth screens) | ☐ | ☐ |
| v1.0-acked user, server ships immaterial v1.1 → straight to `(tabs)`, no `notice-and-ack` | ☐ | ☐ |
| v1.0-acked user, server ships material v1.1 → `notice-and-ack` renders v1.1; POST creates row with `noticeVersion: 'v1.1'` | ☐ | ☐ |
| v1.0-acked user, chain v1.1 immaterial → v1.2 material → v1.3 immaterial → `notice-and-ack` renders v1.3 | ☐ | ☐ |
| After re-ack, `/init` returns `{ needs: false }`; route effect lands on next correct gate | ☐ | ☐ |

- Verify boot-time invariant by locally introducing a duplicate version or wrong `active` ref → module init throws.
- Confirm integration test asserts the fail-closed branch logs a warning.

### Deliverables
- Green CI, completed manual matrix, spec §7 ACs ticked.

### Best industry patterns
- **Acceptance-criteria-as-checklist** — spec defines, QA proves, one row at a time.
- **Failure-mode injection** — actively reproduce the fail-closed path; don't trust it works because the code looks right.
- **Version-chain scenarios in QA** — exercise the chain walk with a temporary v1.1+ in a test fixture, not just unit tests.

### Risks / tradeoffs
- A11y is the most-skipped item. Don't merge without the screen-reader pass.
- Re-ack rows require fixturing a multi-version registry in tests; budget time for this in QA.

---

## Sequencing

| PR | Contents | Effort |
|---|---|---|
| 1 | Phases 1 + 2 + 3 (backend catalog with blocks + acceptance log incl. `findLatestVersionForUser` + shared/api-client) | ~1.25d |
| 2 | Phases 4 + 5 (mobile screen + block renderers + `/init` chain-walk + route effect refactor + `expo-web-browser`) | ~0.75d |
| 3 | Phase 6 (QA across the merged stack, incl. re-ack matrix) | ~0.25d |

**Total ~2.25d.**

## Decisions locked in

- Privacy/Terms URLs baked into frozen `notices/v1.0.ts` ✓
- `POST /api/acknowledgements` returns **200** with existing row on duplicate ✓
- `expo-web-browser` `openBrowserAsync` for legal links ✓
- Notice document inlined into `/init` (no standalone `GET /notice`) ✓
- Fail-closed default on ack-lookup error ✓
- `/init` fired from `_layout.tsx` on auth transition ✓
- Route effect is the single source of routing decisions; screens refresh `/init` and let it route ✓
- `requiresReAckFromPriorVersions: boolean` required on every `NoticeDocument`; v1.0 = `false` ✓
- Re-acknowledgement **in MVP** — server chain-walks the registry; user always re-acks the active version only; one screen, one POST, one row per transition event ✓
- `NoticeDocument.body` is `NoticeBlock[]`; union has **`paragraph` and `links` only** (no callout) ✓
- No `changeSummary` / `changesSinceLast` in MVP — screen renders identically for first-time and re-ack ✓
- No `onboardingStep` / `hasAcknowledged` denormalization on the user document ✓

## Watch-outs for future PRs

- **Frozen-file rule.** Never edit `notices/v*.ts` after activation. PR template should reject such edits.
- **Chronological order in `NOTICE_REGISTRY.all`.** Chain walk depends on it. Add a sort assertion in the boot-time invariant if drift becomes a risk.
- **Counsel decision lives in the PR description** of any new `notices/vN.M.ts` — material vs non-material is a documented call, not a diff inference.
- **Resist adding block types speculatively.** Every block in the union is a small UX commitment in the renderer. Add only when an actual notice needs one.
- **Resist `changeSummary` / `changesSinceLast` reintroduction until product genuinely wants to explain re-ack.** The architecture is open to it (purely additive on type, server-enriched on response, callout block added to union), but the default is to skip.
- **Future i18n** drops in as `notices/v1.0/en-GB.ts` + `notices/v1.0/cy-GB.ts`; registry picks locale at request time. No restructuring needed.
- **Resist denormalization on the user document** for any new gate. Add a signal to `/init` and an `if` branch in `_layout.tsx` instead.
