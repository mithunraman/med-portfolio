# Shared `BottomSheet` Component — Tech-Debt / Refactor

> Status: **Planned, not yet implemented.** Surfaced during code review of the artefact
> ratings feature (Phase 5, `ReviewSheet`). The duplication is **pre-existing and systemic** —
> `ReviewSheet` followed the established `ExportSheet` convention; it did not introduce a new
> pattern. This is a follow-up, deliberately **out of scope** for the ratings PR.

---

## Summary

Every modal "bottom sheet" in the mobile app re-implements the same scaffolding by hand —
the translucent overlay, the grab handle, the safe-area-aware container, and the
`transparent` + `animationType="slide"` `Modal`. There is **no shared `BottomSheet`
primitive**, so each new sheet re-derives this logic, and per-sheet behaviours (e.g.
block-dismiss-while-saving, keyboard avoidance) live in only one place and never get shared.

**Verdict from review:** *partially valid* — the observation is correct and the duplication
is real (and larger than the review claimed), but the fix does not belong in the feature PR
that surfaced it. Extracting a shared component wired to only one call site would validate the
abstraction against a single case and leave a half-migration. The right move is one dedicated
pass that designs the API against **all** call sites and migrates them together.

---

## Evidence (verified)

`ReviewSheet` and `ExportSheet` share **byte-identical** style blocks:

- `overlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' }`
- `handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 }`
- container border-radius + `paddingBottom: Math.max(insets.bottom, 24)` via `useSafeAreaInsets()`
- `<Modal transparent animationType="slide" onRequestClose={…}>`

### Recurrence across the codebase

The hand-rolled overlay / slide-modal pattern appears in **~8 sites** (the review said "6+";
the actual count is higher):

| File | Notes / variation |
| --- | --- |
| `src/components/ExportSheet.tsx` | Canonical reference shape |
| `src/components/artefact/ReviewSheet.tsx` | Adds `KeyboardAvoidingView` + **block-dismiss-while-saving** |
| `src/components/PdpGoalSelector.tsx` | Needs `maxHeight` + scrollable content |
| `app/(entry)/versions/[artefactId].tsx` | Slide modal |
| `app/(review-period)/create.tsx` | Slide modal |
| `app/(pdp-goal)/[goalId].tsx` | Slide modal |
| `app/(profile-settings)/account-settings.tsx` | Slide modal |
| `app/(auth)/intro.tsx` | Overlay pattern |

Related (handle / modal chrome, may or may not fold in): `ChatComposer.tsx`,
`CompletionCard.tsx`, `app/(tabs)/index.tsx`. **Not** a fit: `FullScreenTextEditor.tsx`
(full-screen modal, not a bottom sheet) — leave as-is.

> Counts from `grep` on `justifyContent: 'flex-end'`, `width: 36` (handle), and
> `animationType="slide"`. Re-verify before migrating; some hits may be unrelated modals.

---

## Why it matters

- Each new sheet re-derives overlay / handle / safe-area logic — error-prone and inconsistent.
- Per-sheet niceties don't propagate. Today only `ReviewSheet` blocks dismissal while a
  request is in flight and only some sheets avoid the keyboard; a shared primitive would make
  these opt-in props available everywhere.
- Accessibility and animation tuning have to be fixed in N places.

---

## Proposed resolution

Introduce **`apps/mobile/src/components/common/BottomSheet.tsx`** and migrate all sheet sites
in **one dedicated PR** (not piecemeal). Design the API against the full set of call sites up
front so the abstraction fits every case rather than just the first.

### Required API surface (derived from the divergence across call sites)

- `visible: boolean`, `onClose: () => void`
- `children` — sheet body
- **optional handle** (default on)
- **safe-area-aware** bottom padding (`Math.max(insets.bottom, 24)`)
- `maxHeight?` (e.g. `PdpGoalSelector`, capability modal use `'70%'`)
- **keyboard avoidance** (`KeyboardAvoidingView`, iOS `padding`) — needed by `ReviewSheet`
- **dismiss guard** — `dismissable?: boolean` / `busy?: boolean` so a sheet can block
  overlay-tap and `onRequestClose` while saving (the `onPress={saving ? undefined : onClose}`
  behaviour currently unique to `ReviewSheet`)
- **scrollable content** option (for `PdpGoalSelector`'s long lists)
- optional `title` + close affordance (several sheets render their own header — keep flexible)

### Behaviours to preserve when migrating `ReviewSheet`

1. **Block dismiss while saving** — overlay tap and back-button dismissal disabled mid-request.
2. **Keyboard avoidance** — the comment `TextInput` must not be covered by the keyboard.

---

## Scope / sequencing

- **Out of scope** for the artefact-ratings PR — `ReviewSheet` stays consistent with the
  existing `ExportSheet` convention until this refactor lands.
- **Do it as one pass**, not extract-and-wire-one — a half-migration (shared primitive + 7
  hand-rolled copies) is worse than one uniform hand-rolled pattern.
- **Low risk**: nothing is deployed, so there's no backward-compatibility cost to the
  migration (per `CLAUDE.md` deployment status).
- **No tests** required for the presentational chrome itself; rely on `tsc` + manual device
  check across the migrated screens (verify keyboard avoidance and dismiss-guard still work).

---

## Acceptance criteria

- [ ] `components/common/BottomSheet.tsx` exists with the API above.
- [ ] All ~8 hand-rolled sheet sites migrated; no duplicated overlay/handle/safe-area blocks remain.
- [ ] `ReviewSheet` keeps block-dismiss-while-saving and keyboard avoidance via shared props.
- [ ] `FullScreenTextEditor` intentionally left as a full-screen modal (documented exception).
- [ ] `tsc --noEmit` clean; manual pass on each migrated screen (keyboard + dismiss behaviour).
