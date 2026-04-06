# Mobile Performance Audit

Generated 2026-04-06 via React Native Best Practices scan of `apps/mobile/`.

---

## Priority 1 — CRITICAL Impact, Easy Fix

### 1. ChatComposer: Controlled TextInput
- **File:** `src/components/ChatComposer.tsx:268`
- **Issue:** Uses `value={text}` which causes native<>JS round-trips on every keystroke. Can flicker/lag on lower-end devices.
- **Fix:** Change `value={text}` to `defaultValue={text}`. Use `ref.current.clear()` after send instead of `setText('')`.

### 2. TypingIndicator: JS-Thread Animation
- **File:** `src/components/chat/items/TypingIndicator.tsx:9-31`
- **Issue:** Uses `Animated.loop` with JS-driven opacity. Blocks JS thread during heavy work (message processing), causing janky dots.
- **Fix:** Replace with Reanimated `useSharedValue` + `withRepeat(withTiming(...))` to run on UI thread.

### 3. BubbleShell ProcessingLabel: setInterval Inside List Item
- **File:** `src/components/chat/bubble/BubbleShell.tsx:17-28`
- **Issue:** `ProcessingLabel` runs a 500ms interval for dot animation. Every non-terminal message bubble creates its own timer.
- **Fix:** Replace with Reanimated opacity-based animation, or use a single shared timer via context instead of per-bubble intervals.

### 4. Entries List: Inline Arrow in renderItem
- **File:** `app/(tabs)/entries/index.tsx:126-128`, `app/(tabs)/index.tsx:206-208`
- **Issue:** `onPress={() => handleEntryPress(item)}` creates a new closure per render, defeating `memo` on `EntryListItem`. Same issue in `RecentEntriesModule`.
- **Fix:** Pass `item` directly and handle the press internally in the child component.

---

## Priority 2 — HIGH Impact, Easy Fix

### 5. CoverageRing: Inline Styles, No Memo
- **File:** `src/components/CoverageRing.tsx:39`
- **Issue:** Inline `style={{ ... }}` creates new objects every render. Component is not wrapped in `memo`.
- **Fix:** Wrap in `memo()`, move inline styles to `useMemo` or `StyleSheet.create`.

### 6. EntryListItem: Not Memoized
- **File:** `app/(tabs)/entries/index.tsx:45`
- **Issue:** Defined as a plain function, re-renders on every parent render even when data hasn't changed.
- **Fix:** Wrap with `memo()`.

### 7. ActionBar: setInterval for Rotating Text
- **File:** `src/components/ActionBar.tsx:10-27`
- **Issue:** `useRotatingText` runs a 2.5s interval updating state. Adds JS-thread pressure combined with other intervals.
- **Fix:** Consider Reanimated for the text fade transition.

### 8. OfflineBanner: JS-Thread Height Animation
- **File:** `src/components/OfflineBanner.tsx:40-44`
- **Issue:** `useNativeDriver: false` for height animation blocks JS thread.
- **Fix:** Use `opacity` + `translateY` (which CAN use native driver) instead of animating `height`.

### 9. AudioContent: 30 View Nodes for Waveform
- **File:** `src/components/chat/bubble/AudioContent.tsx:67-78`
- **Issue:** `.map()` creates 30 tiny views per audio message. Each bar gets a new style object on every render when playhead moves.
- **Fix:** Memoize bar views when not playing. Consider SVG path instead of 30 Views.

### 10. RecentEntriesModule: Missing getItemLayout
- **File:** `app/(tabs)/index.tsx:198-209`
- **Issue:** Horizontal FlatList with `snapToInterval` but no `getItemLayout`. Cards are fixed-size (140px).
- **Fix:** Add `getItemLayout` for the fixed 140px + 12px gap card width.

---

## Priority 3 — MEDIUM Impact, Easy Fix

### 11. CircularButton / IconButton: JS-Thread Press Animations
- **Files:** `src/components/CircularButton.tsx`, `src/components/IconButton.tsx`
- **Issue:** Both use `Animated.spring` for scale on press (JS thread). Used heavily across the app.
- **Fix:** Replace with Reanimated `useSharedValue` + `withSpring` for UI-thread animations.

### 12. EditableReflectionSection: Not Memoized
- **File:** `src/components/EditableReflectionSection.tsx`
- **Issue:** Plain function component that receives callbacks. Re-renders when parent re-renders.
- **Fix:** Wrap with `memo()`.

### 13. ScrollToBottomFAB: No Enter/Exit Animation
- **File:** `src/components/chat/ScrollToBottomFAB.tsx`
- **Issue:** Appears/disappears abruptly. No animation framework imported.
- **Fix:** Add a fade + scale animation via Reanimated for smooth appear/disappear.

### 14. QuotaUsageSection / QuotaWarningBanner: Intervals When Offscreen
- **Files:** `src/components/QuotaUsageSection.tsx:34-36`, `src/components/QuotaWarningBanner.tsx:45-47`
- **Issue:** 1-minute `setInterval` ticking state, causes re-renders even when offscreen.
- **Fix:** Guard with `useIsFocused()` or `useFocusEffect` so interval only runs when visible.

### 15. ActiveBanner: Inline Selector with Computation
- **File:** `src/components/ActiveBanner.tsx:17-23`
- **Issue:** Quota percentage computed inside `useAppSelector`, creates a new function reference every render.
- **Fix:** Extract the selector to a stable reference outside the component.

---

## Priority 4 — MEDIUM Impact, Moderate Effort

### 16. MessageList: FlatList to FlashList
- **File:** `src/components/chat/MessageList.tsx`
- **Issue:** The message list is the most scrolled view in the app. FlashList would provide ~20% better scroll FPS via view recycling.
- **Fix:** Install `@shopify/flash-list`, add `estimatedItemSize` and `getItemType` (messages vs separators vs typing indicator).

### 17. Enable React Compiler (Project-Wide)
- **Issue:** App uses Expo SDK 54 + React 19, which supports React Compiler. Currently all memoization is manual.
- **Fix:** Enable via `app.json` > `experiments.reactCompiler: true`. Then progressively remove manual `memo`/`useCallback`/`useMemo`.

### 18. ChatComposer: Excessive useMemo for Icon JSX
- **File:** `src/components/ChatComposer.tsx:174-204`
- **Issue:** 5 separate `useMemo` calls for static icons that only change on theme change.
- **Fix:** With React Compiler these become automatic. Without it, these are borderline.

---

## Suggested Work Order

1. Items 1-4 (critical, quick wins) — do in one PR
2. Items 5-6, 10 (memo + getItemLayout) — do in one PR
3. Item 17 (React Compiler) — standalone PR, may eliminate need for items 12, 15, 18
4. Items 2, 3, 7, 8, 11 (Reanimated migrations) — batch as one PR
5. Item 16 (FlashList migration) — standalone PR, test scroll perf before/after
