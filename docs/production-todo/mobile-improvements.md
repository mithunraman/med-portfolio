# Mobile App Performance Optimisation — Production TODO

## Overall Objective

Improve the React Native mobile app's runtime performance, reduce unnecessary re-renders, trim bundle overhead, and lower Sentry production cost — all with minimal, surgical changes that don't alter existing behavior or require new dependencies (except FlashList).

---

## Phase 1 — Consolidate HomeScreen Dashboard Selectors

### Objective

Eliminate redundant re-renders on the HomeScreen by replacing 5 individual `useAppSelector` calls for `state.dashboard.*` with a single memoized selector.

### Scope

- **Included:** `apps/mobile/app/(tabs)/index.tsx` lines 419–428, dashboard slice selectors
- **Excluded:** Other screens, other slices, any new dependencies

### Implementation Plan

1. In the dashboard slice, create a single `selectDashboardSummary` selector using `createSelector` from RTK that returns `{ recentEntryIds, activeReviewPeriod, loading, error, stale }` as a stable object.
2. In `HomeScreen`, replace the 5 inline selectors with one `useAppSelector(selectDashboardSummary)` call and destructure the result.
3. Keep `selectRecentEntries`, `selectRecentEntriesTotal`, `selectPdpGoalsDueSoon`, `selectPdpGoalsDueTotal` as-is — these are already memoized entity selectors from other slices.

### Deliverables

- Updated dashboard slice with `selectDashboardSummary`
- Updated HomeScreen with single selector call

### Best Industry Patterns

- **Memoized selectors (Reselect/RTK `createSelector`):** Prevents reference-inequality re-renders. Standard Redux practice for derived or grouped state.

### Code Guidance

- Return a flat object from the selector — no nested structures that would break shallow equality.
- Export the selector from the slice file alongside the reducer, following the existing pattern in `artefacts` and `pdpGoals`.

### Risks / Tradeoffs

- **Low risk.** If any individual dashboard field updates frequently and independently, batching them into one selector could cause slightly _more_ re-renders for the other fields. In this case all fields update together via `fetchInit`, so batching is strictly better.

---

## Phase 2 — Reduce Sentry Transaction Sampling

### Objective

Lower Sentry overhead in production by reducing `tracesSampleRate` from `1.0` to `0.1`.

### Scope

- **Included:** `apps/mobile/app/_layout.tsx` line 32
- **Excluded:** Error capture rate (remains 100%), dev config

### Implementation Plan

1. Change `tracesSampleRate: __DEV__ ? 1.0 : 1` to `tracesSampleRate: __DEV__ ? 1.0 : 0.1`

### Deliverables

- Single line change in `_layout.tsx`

### Best Industry Patterns

- **Sampling in production APM:** 10% is a standard production sample rate. It provides statistically meaningful data while reducing network, CPU, and Sentry billing overhead.

### Code Guidance

- No abstraction needed — one line change.

### Risks / Tradeoffs

- You'll see fewer individual transaction traces in Sentry. Aggregated metrics (p50/p95 latency) remain accurate at 10%. If you need higher fidelity temporarily, bump to 0.3–0.5 for a release cycle.

---

## Phase 3 — Eliminate Barrel Imports

### Objective

Replace barrel re-exports with direct imports to improve Metro bundler tree-shaking and reduce cold-require overhead at startup.

### Scope

- **Included:** All consumer files importing from `@/components`, `@/hooks`, `@/store/slices`
- **Excluded:** The barrel files themselves (keep them for backwards compat initially, remove in a follow-up)

### Implementation Plan

1. **Components:** Find all `from '@/components'` imports across the app. Replace with direct paths:
   - `import { CoverageRing } from '@/components'` becomes `import { CoverageRing } from '@/components/CoverageRing'`
   - Apply to all 28 component exports.
2. **Hooks:** Replace `from '@/hooks'` with `from '@/hooks/useAppDispatch'`, etc. (9 exports).
3. **Store slices:** This barrel (`@/store/slices/index.ts`) re-exports 50+ symbols across 8 slices. Consumers should import from `@/store/slices/artefacts`, `@/store/slices/dashboard`, etc. However, if there's a top-level `@/store/index.ts` that re-exports from slices, update consumers to import from the slice files directly.
4. After all consumers are updated, add a `// @deprecated` comment to each barrel file. Remove them in a later cleanup pass once no imports reference them.

### Deliverables

- All app files use direct imports
- Barrel files annotated as deprecated

### Best Industry Patterns

- **Direct imports over barrels:** Metro's CommonJS resolver loads the entire barrel module even when only one export is used. Direct imports allow Metro to skip unused modules entirely, improving cold start and reducing memory pressure.
- **Incremental deprecation:** Keeping barrels temporarily avoids breaking any import path we might miss.

### Code Guidance

- Use a codemod or find-and-replace across the repo — this is mechanical work.
- Verify no circular dependencies are introduced by direct imports (unlikely given current structure).
- Run `pnpm typecheck` after changes to catch any broken paths.

### Risks / Tradeoffs

- **Medium effort, low-medium impact.** Metro does handle barrels reasonably well, so gains may be modest (primarily startup time). The main benefit is clearer dependency graphs and faster HMR.
- Risk of missing an import path — mitigated by typecheck.

---

## Phase 4 — FlashList Migration for Entry Lists

### Objective

Replace `FlatList` with `FlashList` on high-traffic list screens to improve scroll performance via cell recycling.

### Scope

- **Included:** Entries list (`apps/mobile/app/(tabs)/entries/index.tsx`), PDP goals list, message list
- **Excluded:** HomeScreen ScrollView (mixed content, not a homogeneous list), small lists under 20 items

### Implementation Plan

1. Install `@shopify/flash-list`:
   ```bash
   cd apps/mobile && pnpm add @shopify/flash-list
   ```
2. Replace `FlatList` with `FlashList` on the entries screen:
   - Add `estimatedItemSize={80}` (measure actual item height with the FlashList performance warning).
   - Remove `maxToRenderPerBatch` and `windowSize` — FlashList manages its own recycling.
   - Keep `removeClippedSubviews` removal (FlashList doesn't need it).
   - Keep `keyExtractor` and memoized `renderItem` as-is.
3. Repeat for PDP goals list and message list.
4. Test scroll performance on Android (where gains are most noticeable).

### Deliverables

- FlashList integrated on 2–3 list screens
- `estimatedItemSize` tuned per screen

### Best Industry Patterns

- **Cell recycling (FlashList):** Instead of mounting/unmounting offscreen items (FlatList), FlashList reuses native views. This reduces JS thread work and GC pressure, particularly on long lists. Industry standard for production RN apps (used by Shopify, Discord, etc.).

### Code Guidance

- FlashList is a near drop-in replacement for FlatList. The main required prop is `estimatedItemSize`.
- Avoid wrapping FlashList items in extra `View` containers — FlashList needs direct children for recycling.
- If items have variable heights, set `estimatedItemSize` to the average and let FlashList adjust.

### Risks / Tradeoffs

- **New dependency.** `@shopify/flash-list` is well-maintained and widely adopted, but adds ~50KB to the bundle.
- If lists are short (<50 items), gains over tuned FlatList are negligible. Prioritise the entries list first — it's likely the longest.
- Inverted FlashList (message list) has known quirks — test thoroughly on both platforms before shipping.

---

## Phase 5 — Memoize ChatComposer Against Parent Re-renders

### Objective

Prevent the ChatComposer text input from re-rendering when parent state (like `isSending`) changes, avoiding potential keystroke lag.

### Scope

- **Included:** ChatComposer component
- **Excluded:** Other input components (EditableTitle is low-frequency, not worth optimising)

### Implementation Plan

1. Read the current ChatComposer implementation to confirm the `isSending` prop triggers re-renders during typing.
2. Split `isSending` visual effect (disabled state, button style) from the text input itself using composition:
   - The `TextInput` portion should not re-render when `isSending` changes.
   - Wrap the `TextInput` in its own `memo()` sub-component that only receives `text`, `onChangeText`, and stable style props.
3. Alternatively, if ChatComposer is already `memo()`'d via `forwardRef`, ensure `isSending` changes don't invalidate the input — use `useMemo` on the input's props.

### Deliverables

- ChatComposer TextInput isolated from `isSending` re-renders

### Best Industry Patterns

- **Uncontrolled or isolated TextInput:** React Native TextInput performance degrades when the component tree above it re-renders on every keystroke. Isolating the input into a leaf `memo` component is the standard fix (per Callstack's optimisation guide).

### Code Guidance

- Keep the refactor minimal — extract a `MemoizedInput` only if profiling shows the re-render is real. Don't over-abstract.
- The outer ChatComposer can still manage `text` state; the key is that `isSending` doesn't propagate to the input.

### Risks / Tradeoffs

- **Very low risk.** This is a targeted memo boundary. If `isSending` changes infrequently (only on send), the optimisation may be imperceptible — measure first with React DevTools Profiler before shipping.
