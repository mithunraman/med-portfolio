# Simplification Review — `notices` Branch

**Branch:** `notices` vs `main`
**Commits reviewed:**
- `08824c5` added support for notices
- `3c6ca42` mobile ui for app version and notices
- `50ebc1f` added app support for notices and app versions

**Scope:** 86 files, +1736 / −164 lines. Adds in-app announcement notices and version-policy (force/recommended update) enforcement across NestJS API, Expo mobile app, and shared packages.

**Method:** Three parallel review passes — code reuse, code quality, efficiency — against the full diff.

---

## Summary

| Severity | Count | Theme |
|---|---|---|
| **P1** — fix before merge | 9 | Error swallowing, missing repo interfaces, query-in-JS, banner duplication, derived-state leaks |
| **P2** — strongly recommended | 16 | ID contract violations, schema/index mismatches, stringly-typed DTOs, re-render storm |
| **P3** — nits / cleanup | 10 | Dead code, duplicate DTOs, narrative comments, mixed-concern commits |

**Suggested implementation order:**

1. **Correctness first** — A1, A2 (error swallowing hides real DB failures), A3/A4/A5 (CLAUDE.md ID contract).
2. **Hot-path performance** — B1+B2 together (audience filtering + index alignment are intertwined), B3.
3. **Mobile re-render storm** — E2+E3+E1 together (reducer guard + selector memoization + reduced hook surface).
4. **Deduplication** — D1+D2 (both banners + animation wrapper), then C6/C7 (DTO DRY).
5. **Cleanup sweep** — remaining C + E items.

Split the unrelated `DBError` relocation (C10) into its own PR.

---

## A. Backend architecture / pattern divergence

### A1. [P1] Missing repository interface + DI token for new repos

**Files:**
- [apps/api/src/notices/notices.repository.ts](../../apps/api/src/notices/notices.repository.ts)
- [apps/api/src/version-policy/version-policy.repository.ts](../../apps/api/src/version-policy/version-policy.repository.ts)
- [apps/api/src/notices/notices.module.ts](../../apps/api/src/notices/notices.module.ts)

**Detail:** Every other API repo (`otp`, `artefacts`, `items`, `media`, `conversations`, `outbox`, `quota`, `analysis-runs`, `version-history`, `review-periods`, `pdp-goals`) ships a `*.repository.interface.ts` file that exports a `Symbol` DI token and an interface the concrete class implements. See [apps/api/src/otp/otp.repository.interface.ts](../../apps/api/src/otp/otp.repository.interface.ts) and [apps/api/src/version-history/version-history.repository.interface.ts](../../apps/api/src/version-history/version-history.repository.interface.ts).

Notices and version-policy skip this entirely — modules bind concrete classes directly as providers. This breaks the established DI-token pattern used across 10+ modules and removes the swap-point for test-time mocks. Also makes these the only two repos where consumers import the concrete class rather than an interface.

**Why it matters:** New engineers will follow the wrong pattern. Unit tests can't mock by token. Consistency across the API boundary is lost.

---

### A2. [P1] Services swallow `DBError`s with `!result.ok` instead of throwing via `isErr()`

**Files:**
- [apps/api/src/notices/notices.service.ts](../../apps/api/src/notices/notices.service.ts)
- [apps/api/src/version-policy/version-policy.service.ts](../../apps/api/src/version-policy/version-policy.service.ts)

**Detail:** New services use `if (!result.ok) return []` / `return null`, silently hiding DB errors. The convention across the codebase ([media.service.ts](../../apps/api/src/media/media.service.ts), [version-history.service.ts](../../apps/api/src/version-history/version-history.service.ts), [artefacts.service.ts](../../apps/api/src/artefacts/artefacts.service.ts)) is:

```ts
if (isErr(result)) throw new InternalServerErrorException(result.error.message);
```

`isErr()` from [common/utils/result.util.ts](../../apps/api/src/common/utils/result.util.ts) is the documented check — no other service uses `!result.ok` raw destructuring.

**Why it matters:** CLAUDE.md explicitly calls out that "Services check `isErr()` and translate to NestJS exceptions." Silent returns defeat observability — a broken Mongo query looks identical to "no notices today." The `/init` endpoint is user-facing and should surface infrastructure failures, not hide them as empty responses.

---

### A3. [P2] Mongoose `Notice` shape leaks into service layer

**File:** [apps/api/src/notices/notices.service.ts](../../apps/api/src/notices/notices.service.ts)

**Detail:** Service code reads `n._id`, calls `n._id.toString()`, and uses `n.startsAt instanceof Date ? n.startsAt.toISOString() : n.startsAt` in `toAdminResponse`. The `instanceof Date` fallback is dead — `.lean()` always returns `Date`. More importantly, CLAUDE.md's ID strategy section explicitly forbids leaking `_id` or raw Mongoose documents beyond the repository layer. The admin response is effectively echoing the DB document.

**Why it matters:** Leaky abstractions couple controllers to storage. If we migrate off Mongoose (or use aggregation pipelines), this code breaks silently. The defensive `instanceof` is a symptom — if the service owned the mapping cleanly, the check wouldn't exist.

---

### A4. [P2] `NoticesController` converts `userId` to `ObjectId` in the controller

**File:** [apps/api/src/notices/notices.controller.ts](../../apps/api/src/notices/notices.controller.ts)

**Detail:** `new Types.ObjectId(user.userId)` is happening in the controller layer. Every sibling controller ([review-periods.controller.ts](../../apps/api/src/review-periods/review-periods.controller.ts), [media.controller.ts](../../apps/api/src/media/media.controller.ts), [conversations.controller.ts](../../apps/api/src/conversations/conversations.controller.ts)) passes the string `user.userId` straight through and lets the service do the `xid → _id` conversion. CLAUDE.md's ID Strategy section states: "Services convert xid → _id for lookups." `NoticesService.dismiss(userId: Types.ObjectId, …)` should accept the string like every sibling.

**Why it matters:** Inconsistent layering. The controller shouldn't know about Mongoose types at all.

---

### A5. [P2] `VersionPolicyService` returns `id: doc._id.toString()` — violates xid rule

**File:** [apps/api/src/version-policy/version-policy.service.ts](../../apps/api/src/version-policy/version-policy.service.ts)

**Detail:** `getAll()` and `upsert()` return `id: doc._id.toString()`. The `VersionPolicy` schema has no `xid` property. CLAUDE.md: "Responses always return xid, never _id." Since there's only one document per platform (`ios` / `android`) and the admin panel keys by `platform` (the route is `:platform`), the `id` field is also unused by the client. Either drop it entirely or add an `xid` field to the schema.

**Why it matters:** Exposing `_id` to the API surface breaks the xid contract and makes internal object IDs externally observable.

---

### A6. [P2] `CreateNoticeData` weakens enums to raw `string`

**File:** [apps/api/src/notices/notices.repository.ts](../../apps/api/src/notices/notices.repository.ts)

**Detail:** Repository input type declares `type: string`, `severity: string`, `audienceType: string` — but the Mongoose schema ([notice.schema.ts](../../apps/api/src/notices/schemas/notice.schema.ts)) is typed `NoticeType | NoticeSeverity | AudienceType` and enforces `enum` validation. The service receives `CreateNoticeDto` (a Zod-typed union) and then widens it to `string` when calling the repository.

**Why it matters:** You lose type safety across the service→repo boundary for no reason. A typo in a service call can't be caught at compile time. Should reference the shared enums directly.

---

## B. Backend performance / queries

### B1. [P1] Notice audience filtered in-memory instead of in Mongo

**Files:**
- [apps/api/src/notices/notices.service.ts](../../apps/api/src/notices/notices.service.ts)
- [apps/api/src/notices/notices.repository.ts](../../apps/api/src/notices/notices.repository.ts)

**Detail:** `findActive()` returns every active, non-expired notice for *all* audiences (ALL, ROLE, USERS). Filtering by `audienceType` / `audienceRoles` / `audienceUserIds` happens in JS after the query returns. On every `/init` call (which fires on every app launch and foreground) this drags back the full active-notice working set — even critical role-specific notices or 100k-user targeted notices — just to throw most of them away. `MAX_NOTICES_PER_USER = 5` is also enforced after sort/filter in JS, not as a Mongo `.limit()`, so the query is effectively unbounded.

Audience filtering belongs in the query, as an `$or`:
```js
{ $or: [
  { audienceType: 'ALL' },
  { audienceType: 'ROLE', audienceRoles: userRole },
  { audienceType: 'USERS', audienceUserIds: userId },
]}
```

**Why it matters:** Payload grows linearly with active notices across all audiences; network + BSON decode cost scales with the wrong dimension. On a hot path this is pure waste.

---

### B2. [P1] Notice compound index doesn't match query shape

**File:** [apps/api/src/notices/schemas/notice.schema.ts](../../apps/api/src/notices/schemas/notice.schema.ts)

**Detail:** Index: `{ active: 1, startsAt: 1, expiresAt: 1 }`. Query filters `active + startsAt + $or:[expiresAt==null, expiresAt>now]` and sorts by `{priority:-1, createdAt:-1}`. Two problems:

1. `$or` on `expiresAt` can't use the third index key efficiently — Mongo typically runs each branch separately.
2. Sort fields (`priority`, `createdAt`) are not in the index, so after the (inefficient) range scan Mongo does an in-memory sort.

`audienceType`, `audienceRoles`, and `audienceUserIds` are unindexed entirely, which compounds B1 if audience filtering moves into the query.

**Why it matters:** Full-collection-scan-ish behavior once the notices table grows. In-memory sort is blocked by Mongo at 32MB by default and generates ops-log noise.

---

### B3. [P1] `NoticeDismissal` has a redundant single-field `userId` index

**File:** [apps/api/src/notices/schemas/notice-dismissal.schema.ts](../../apps/api/src/notices/schemas/notice-dismissal.schema.ts)

**Detail:** `userId` is declared `index: true` at the field level, AND there's a compound unique index `{userId:1, noticeId:1}`. The compound index already serves any `userId`-prefixed query — MongoDB uses the leftmost prefix of a compound index automatically. The standalone index is duplicate overhead on every insert/upsert during dismissals.

**Why it matters:** Extra index write on every dismissal; extra storage; extra working-set footprint. No corresponding benefit.

---

### B4. [P2] `dismiss()` makes two DB round-trips when one suffices

**File:** [apps/api/src/notices/notices.service.ts](../../apps/api/src/notices/notices.service.ts)

**Detail:** `findByXid(noticeXid)` → `upsertDismissal(userId, notice._id)`. Two round-trips per dismissal. The dismissal could key on the xid directly (21-char unique) instead of the ObjectId, or collapse into a single aggregation pipeline upsert. Users mash dismiss buttons, so this doubles load under bursts. The client swallows failures anyway (optimistic UI), so there's no safety benefit to the two-step form.

**Why it matters:** 2× round-trips per dismissal; doubled latency on an optimistic-UI path.

---

### B5. [P3] `VersionPolicyService.evaluate` called on every init with no cache

**Files:**
- [apps/api/src/version-policy/version-policy.service.ts](../../apps/api/src/version-policy/version-policy.service.ts)
- [apps/api/src/version-policy/version-policy.repository.ts](../../apps/api/src/version-policy/version-policy.repository.ts)

**Detail:** Two rows total (ios, android). Data changes maybe weekly. But every `/init` does a fresh `findOne({platform})` with no caching. A 30–60s in-memory TTL cache would eliminate one DB round-trip per init per instance.

**Why it matters:** Small constant cost on a hot path, easily avoided.

---

### B6. [P3] Repo sort is wasted — service re-sorts in JS

**Files:**
- [apps/api/src/notices/notices.repository.ts](../../apps/api/src/notices/notices.repository.ts)
- [apps/api/src/notices/notices.service.ts](../../apps/api/src/notices/notices.service.ts)

**Detail:** Repo sorts `{priority, createdAt}`; service re-sorts by `{priority, severity}`. The DB sort is pure waste. Pick one location.

---

## C. Backend API / DTO shape

### C1. [P2] `init.service.ts` — new slots bolted on via repeated `allSettled` unwrap blocks

**File:** [apps/api/src/init/init.service.ts](../../apps/api/src/init/init.service.ts)

**Detail:** Five near-identical blocks for destructuring `Promise.allSettled` results:

```ts
let x: ... = fallback;
if (result.status === 'fulfilled') {
  x = result.value;
} else {
  logger.warn(`Failed to load ${name}:`, result.reason);
}
```

A tiny helper — `unwrap(result, name, logger, fallback)` — would collapse 15 lines and make the next addition one-line.

**Why it matters:** Copy-paste pattern that will keep growing as init adds slots. Easy to drift (one block logs, another doesn't; one has a typo in the fallback).

---

### C2. [P2] `getInit` parameter sprawl

**File:** [apps/api/src/init/init.service.ts](../../apps/api/src/init/init.service.ts)

**Detail:** Signature is now `getInit(userId, role, platform?, appVersion?)`. Four positional args, two optional. The controller passes `platform` then `appVersion`, which is easy to invert silently (both are strings). Object arg `{userId, role, platform, appVersion}` is safer and scales (geo/locale are likely next).

**Why it matters:** Silent call-site bugs are the main risk; readability at the call site is the secondary benefit.

---

### C3. [P2] Ad-hoc query parsing in `NoticesAdminController.list`

**File:** [apps/api/src/notices/notices.admin.controller.ts](../../apps/api/src/notices/notices.admin.controller.ts)

**Detail:** `Number(page) || 1`, `Math.min(Number(limit) || 20, 100)`, `active === 'true'` string-boolean coercion — all hand-rolled. Compare with the established Zod pipe pattern in [apps/api/src/artefacts/dto/list-artefacts.dto.ts](../../apps/api/src/artefacts/dto/list-artefacts.dto.ts):

```ts
z.coerce.number().int().min(1).max(100).default(20)
```

This is the only controller in the repo parsing string query params by hand.

**Why it matters:** Inconsistent validation — bounds, coercion, error messages all diverge from the rest of the API.

---

### C4. [P2] `UpsertVersionPolicySchema` — semver regex duplicated and wrong

**Files:**
- [packages/shared/src/dto/version-policy.dto.ts](../../packages/shared/src/dto/version-policy.dto.ts)
- [apps/api/src/version-policy/version-policy.service.ts](../../apps/api/src/version-policy/version-policy.service.ts)

**Detail:** `const semverRegex = /^\d+\.\d+\.\d+$/` is repeated three times (once per field). It rejects valid semver like `1.0.0-beta`. The server uses `semver.valid()` (now a dependency) which is stricter and more correct. DTO validation and service validation will disagree on prerelease strings — admin form rejects `1.0.0-beta.1` while the API would accept it if the DTO weren't the first line of defense.

**Why it matters:** Two sources of truth for "is this valid semver?"; the DTO regex is the loosest but rejects legitimate prereleases.

---

### C5. [P2] `VersionPolicyService.evaluate` hand-rolls platform validation

**File:** [apps/api/src/version-policy/version-policy.service.ts](../../apps/api/src/version-policy/version-policy.service.ts)

**Detail:** `Object.values(Platform).find((p) => p === platform)` reinvents `z.nativeEnum(Platform).safeParse(platform)` — already used in the DTO at [packages/shared/src/dto/version-policy.dto.ts](../../packages/shared/src/dto/version-policy.dto.ts). A `z.nativeEnum` safeParse would also give a branded type instead of `string | undefined`.

**Why it matters:** Reinvention of validation that's already in the shared package.

---

### C6. [P3] `AdminNoticeResponseSchema` duplicates `AppNoticeSchema` field-for-field

**File:** [packages/shared/src/dto/notice.dto.ts](../../packages/shared/src/dto/notice.dto.ts)

**Detail:** Admin response re-lists every public field plus admin-only ones. Should be:

```ts
AdminNoticeResponseSchema = AppNoticeSchema.extend({
  active, audienceType, audienceRoles, audienceUserIds,
  priority, createdAt, updatedAt,
})
```

Same pattern already used for `VersionPolicyResponseSchema`.

**Why it matters:** Two field lists drift independently. Public/admin shape divergence hides silently.

---

### C7. [P3] `UpdateNoticeSchema` duplicates `CreateNoticeSchema` fields

**File:** [packages/shared/src/dto/notice.dto.ts](../../packages/shared/src/dto/notice.dto.ts)

**Detail:** Could use `CreateNoticeSchema.partial()`. Caveat: `.refine`s don't carry through `.partial()`, so some manual refining remains. Still a net simplification.

---

### C8. [P3] `UpdateStatus.CURRENT` declared but never emitted or checked

**File:** [packages/shared/src/enums/update-status.enum.ts](../../packages/shared/src/enums/update-status.enum.ts)

**Detail:** `evaluate()` returns `null` instead of `{status: CURRENT, ...}`. Nowhere in backend or mobile does code emit or check `CURRENT`. Dead enum value — premature abstraction.

---

### C9. [P3] `CreateNoticeData` redeclares fields that `CreateNoticeDto` already defines

**File:** [apps/api/src/notices/notices.repository.ts](../../apps/api/src/notices/notices.repository.ts)

**Detail:** Duplicate field list that will drift. Could import `CreateNoticeDto` from `@acme/shared` and extend only the `Date` vs `string` delta for `startsAt` / `expiresAt`.

---

### C10. [P3] Mixed commit: DBError relocation churn

**Detail:** ~12 files touched to move `DBError` from per-repo interfaces into [common/utils/result.util.ts](../../apps/api/src/common/utils/result.util.ts). Net improvement, but unrelated to notices — belongs in its own PR for cleaner review and revertability.

**Why it matters:** Feature PR + infrastructure refactor in one commit means reverting the feature reverts the cleanup.

---

## D. Mobile — duplication between banner components

### D1. [P1] `NoticeBanner` / `NoticeModal` are near-identical

**Files:**
- [apps/mobile/src/components/NoticeBanner.tsx](../../apps/mobile/src/components/NoticeBanner.tsx)
- [apps/mobile/src/components/NoticeModal.tsx](../../apps/mobile/src/components/NoticeModal.tsx)

**Detail:** Both components:
- Resolve `SEVERITY_COLORS`
- Build identical `handleAction` / `handleCta` (open URL + dismiss)
- Render title / body / CTA / close button with the same styles
- Use `Ionicons name="close"`, `hitSlop={{8,8,8,8}}`, `activeOpacity={0.7/0.8}`
- Share text color `#fff` and button styling

Only real differences: outer wrapper (`Modal` vs `View`) and a few padding values. A shared `NoticeContent` subcomponent, or a `useNoticePresentation(notice)` hook returning `{accent, onPrimary, onDismiss, title, body}`, would remove roughly half of each file.

**Why it matters:** Fixing one will require remembering to fix the other. Styling drift is already starting (padding differences).

---

### D2. [P1] `RecommendedUpdateBanner` duplicates banner-animation boilerplate

**Files:**
- [apps/mobile/src/components/RecommendedUpdateBanner.tsx](../../apps/mobile/src/components/RecommendedUpdateBanner.tsx)
- [apps/mobile/src/components/DeletionBanner.tsx](../../apps/mobile/src/components/DeletionBanner.tsx)
- [apps/mobile/src/components/OfflineBanner.tsx](../../apps/mobile/src/components/OfflineBanner.tsx)
- [apps/mobile/src/components/QuotaWarningBanner.tsx](../../apps/mobile/src/components/QuotaWarningBanner.tsx)

**Detail:** `Animated.Value(0)` + `Animated.timing` + `interpolate(height)` + `interpolate(paddingTop)` is now copy-pasted four times. The clearest extraction candidate:

```ts
const animatedStyle = useBannerAnimation(visible, bannerHeight);
```

The existing `BANNER_HEIGHTS` map in [bannerMetrics.ts](../../apps/mobile/src/components/bannerMetrics.ts) would naturally feed it. Each banner would drop ~30 lines.

Also: `RecommendedUpdateBanner` hardcodes `#1d4ed8` instead of using `SEVERITY_COLORS[INFO]` (`#2563eb`) — subtle inconsistency.

**Why it matters:** Four copies of animation code means four places to fix timing/easing changes. The hardcoded color is already out of sync with the severity palette.

---

### D3. [P1] Quota-threshold calculation duplicated

**Files:**
- [apps/mobile/src/hooks/useBannerVisibility.ts](../../apps/mobile/src/hooks/useBannerVisibility.ts)
- [apps/mobile/src/components/QuotaWarningBanner.tsx](../../apps/mobile/src/components/QuotaWarningBanner.tsx)

**Detail:** Both compute `shortWindow.used / shortWindow.limit >= 0.8`. `QuotaWarningBanner` already exposes `getUrgentWindow()` and a `WARNING_THRESHOLD` constant. The refactor that introduced `useBannerVisibility` was meant to consolidate but left the original in the component. Magic `0.8` now exists in two places — changes must stay in sync.

**Why it matters:** Threshold drift (banner shows at 80%, hook thinks it's 75%) will silently break.

---

### D4. [P2] `bannerMetrics.ts` duplicates per-banner height constants

**Files:**
- [apps/mobile/src/components/bannerMetrics.ts](../../apps/mobile/src/components/bannerMetrics.ts)
- Individual banner components (OfflineBanner, DeletionBanner, QuotaWarningBanner)

**Detail:** `OFFLINE_BANNER_HEIGHT = 36` is already exported from `OfflineBanner.tsx`; same for Deletion (`44`) and Quota (`36`). The named exports + `BANNER_HEIGHTS` map both exist; individual consts are only consumed by the map (plus one import in `RecommendedUpdateBanner`). Keep the `BANNER_HEIGHTS` record and drop the separate constants — or re-export existing component-level constants from `bannerMetrics.ts`.

---

### D5. [P3] `ForceUpdateScreen` has unnecessary nested `<View style={styles.content}>`

**File:** [apps/mobile/src/components/ForceUpdateScreen.tsx](../../apps/mobile/src/components/ForceUpdateScreen.tsx)

**Detail:** Inner `content` View only exists to set `gap: 16`. Outer container with `alignItems: 'center'`, `justifyContent: 'center'`, `gap: 16`, and the button pinned via `marginTop: auto` would collapse three Views to one.

---

## E. Mobile — Redux & hooks

### E1. [P1] `useBannerVisibility` returns redundant derived state

**File:** [apps/mobile/src/hooks/useBannerVisibility.ts](../../apps/mobile/src/hooks/useBannerVisibility.ts)

**Detail:** Returns `{offline, deletion, recommendedUpdate, quota, activeBanner}`. `activeBanner` is derived from the four booleans by the priority rule. No consumer (`ActiveBanner`, `useBannerOffset`, `useOfflineAwareInsets`) reads the individual booleans. They are dead state.

The hook should collapse to:

```ts
useActiveBanner(): ActiveBannerKind | null
```

**Why it matters:** Dead fields confuse future callers. The five-field shape implies composability that isn't used.

---

### E2. [P2] `fetchInit.fulfilled` reducer overwrites notices + updatePolicy unconditionally

**File:** [apps/mobile/src/store/slices/notices/slice.ts](../../apps/mobile/src/store/slices/notices/slice.ts)

**Detail:** Every init poll unconditionally runs:

```ts
state.notices = action.payload.notices;
state.updatePolicy = action.payload.updatePolicy;
```

Reference changes even when data is identical. Every `useAppSelector` subscribed to these slices re-runs: `selectBannerNotice`, `selectModalNotice`, `selectUpdatePolicy`, `selectRecommendedUpdateBannerVisible`. That re-renders `NoticeBanner`, `NoticeModal`, `ActiveBanner`, `RecommendedUpdateBanner`, and `_layout.tsx` (which reads `selectUpdatePolicy`) — meaning the entire navigation tree.

Needs a shallow-equal or deep-equal guard before assignment, so downstream consumers' early-return no-ops actually apply.

**Why it matters:** Guaranteed re-render storm on every init refetch (app launch, foreground resume, manual refresh) even when nothing changed.

---

### E3. [P2] Hooks return fresh objects every render (no memoization)

**Files:**
- [apps/mobile/src/hooks/useBannerVisibility.ts](../../apps/mobile/src/hooks/useBannerVisibility.ts)
- [apps/mobile/src/hooks/useOfflineAwareInsets.ts](../../apps/mobile/src/hooks/useOfflineAwareInsets.ts)
- [apps/mobile/src/hooks/useBannerOffset.ts](../../apps/mobile/src/hooks/useBannerOffset.ts)

**Detail:** `useOfflineAwareInsets` spreads `insets` into a new object every call:

```ts
return { ...insets, top: insets.top + bannerOffset };
```

No `useMemo`. Any store change triggers a new reference, so every screen consuming these hooks re-renders even when nothing meaningful changed. Combined with E2, this cascades through the navigation tree on every init refetch.

**Why it matters:** `useOfflineAwareInsets` is used across many screens — the blast radius is effectively the whole app on any store dispatch.

---

### E4. [P2] `dismissedUpdateHydrated` is a hand-rolled hydration flag

**Files:**
- [apps/mobile/src/store/slices/notices/slice.ts](../../apps/mobile/src/store/slices/notices/slice.ts)
- [apps/mobile/src/store/slices/notices/selectors.ts](../../apps/mobile/src/store/slices/notices/selectors.ts)

**Detail:** `selectRecommendedUpdateBannerVisible` gates on `dismissedUpdateHydrated`. Other slices (onboarding, auth) treat `undefined` initial / `string | null` post-hydration as the hydration signal. The extra boolean is load-order plumbing leaking into slice state.

Also: `removeNotice` reducer is exported and re-exported from the store index, but never dispatched outside the slice — dead export.

---

### E5. [P2] Raw `AsyncStorage` instead of `AppStorage`

**Files:**
- [apps/mobile/src/store/slices/notices/thunks.ts](../../apps/mobile/src/store/slices/notices/thunks.ts)
- [apps/mobile/src/services/AppStorage.ts](../../apps/mobile/src/services/AppStorage.ts)

**Detail:** Uses `AsyncStorage` directly with a stringly-typed key (`'recommendedUpdate:dismissedVersion'`). The codebase has a typed `AppStorage` service that handles:
- Key prefixing (`@app:`)
- JSON parse/serialize
- Error logging via structured logger
- Schema-typed keys

Extending `StorageSchema` in `AppStorage.ts` would give logging + type-safety for free. This is the only raw `AsyncStorage` usage in the app outside `AppStorage.ts` itself.

**Why it matters:** CLAUDE.md's mobile-logging rule calls out that structured logging is required — raw `AsyncStorage` errors bypass the logger entirely.

---

### E6. [P2] `selectHasMandatoryUpdate` created but not used

**Files:**
- [apps/mobile/src/store/slices/notices/selectors.ts](../../apps/mobile/src/store/slices/notices/selectors.ts)
- [apps/mobile/app/_layout.tsx](../../apps/mobile/app/_layout.tsx)

**Detail:** Selector defined specifically for this check, but `_layout.tsx` uses raw string comparison: `updatePolicy?.status === 'mandatory'`. Also bypasses the `UpdateStatus.MANDATORY` enum.

**Why it matters:** Selector exists, isn't wired up; enum exists, isn't used. Stringly-typed in the one place that matters.

---

### E7. [P3] `loadDismissedUpdateVersion` causes startup animation jitter

**Files:**
- [apps/mobile/app/_layout.tsx](../../apps/mobile/app/_layout.tsx)
- [apps/mobile/src/components/RecommendedUpdateBanner.tsx](../../apps/mobile/src/components/RecommendedUpdateBanner.tsx)

**Detail:** `isLoading = authStatus === 'idle' || 'loading' || !onboardingInitialized` does not wait on dismissed-update hydration. `ActiveBanner` can briefly render a hydration-false state on the first frame, and the Animated `useEffect` in `RecommendedUpdateBanner` fires a 250ms animation on every visibility flip — on boot, a spurious animation cycle can flash before hydration completes.

---

### E8. [P3] `loadDismissedUpdateVersion` silently turns storage corruption into "un-dismissed"

**File:** [apps/mobile/src/store/slices/notices/thunks.ts](../../apps/mobile/src/store/slices/notices/thunks.ts)

**Detail:** On `AsyncStorage` failure, dispatches `setDismissedUpdateVersion(null)` and `dismissedUpdateHydrated = true`. A corrupt storage read silently resurfaces a previously-dismissed update banner. Probably fine as fail-safe behavior, but warrants a **Why** comment if intentional.

---

## F. Comments / narrative

### F1. [P3] Narrative comments that describe WHAT rather than WHY

**Files:**
- [apps/mobile/src/components/NoticeBanner.tsx](../../apps/mobile/src/components/NoticeBanner.tsx)
- [apps/mobile/src/components/ActiveBanner.tsx](../../apps/mobile/src/components/ActiveBanner.tsx)

**Detail:**
- `// Non-dismissible notices can only be removed by acting on them` — describes the next line.
- `ActiveBanner.tsx` has a header comment listing the priority order in prose that duplicates the switch cases below.

Per project style (CLAUDE.md): "Default to writing no comments. Only add one when the WHY is non-obvious." Delete both. If the WHY (why can non-dismissibles only be removed by acting? what's the business rule?) is interesting, it belongs in the DTO schema doc, not inline in a component.

---

## Appendix — Items investigated but NOT findings

1. **Transaction plumbing (`ClientSession`)**: initial suspicion was that many repo interfaces had `session?: ClientSession` added defensively. Confirmed this was **not** the case — the churn was only relocating `DBError`. No spurious session plumbing was added.
2. **Polling / intervals**: no new polling was introduced; no event-listener leaks observed in banner components.
3. **`Promise.allSettled` in init**: correctly used — real concurrency, not sequential.
4. **`dismissNotice` thunk**: correctly optimistic — doesn't re-add on failure.
5. **`key={notice.id}` on NoticeModal/NoticeBanner**: correct — avoids stale state when notices change.
