# Production Readiness Review

**Date:** 2026-03-18 (updated 2026-03-24)
**Scope:** All screens in the React Native (Expo) mobile app

---

## Summary of Biggest Risks

1. ~~**No password reset flow**~~ — **N/A.** App uses OTP-based passwordless auth; no passwords exist.
2. ~~**The `(review-period)` route group is not registered in the root Stack**~~ — **FIXED.**
3. ~~**SignupNudgeModal is exported but never rendered**~~ — **REMOVED.** Dead code deleted.
4. **Privacy Policy is a placeholder alert** — a legal liability for production.
5. ~~**Login/Register screens have hardcoded white backgrounds**~~ — **FIXED.** Dynamic theming applied.
6. **No account deletion flow** — App Store rejection risk.

---

## CRITICAL (Blocks launch)

### ~~1. Missing `(review-period)` Stack.Screen registration~~ — FIXED

- **Status:** Resolved. Added `<Stack.Screen name="(review-period)" options={{ presentation: 'card' }} />` to the root layout.

### ~~2. No password reset / forgot password flow~~ — N/A

- **Status:** Not applicable. The app uses OTP-based passwordless authentication — there are no passwords to reset.

### 3. No production deployment infrastructure

- **What's missing:** No Dockerfile, Docker Compose, CI/CD pipeline, or server provisioning exists. The API has no way to run in production.
- **Why it matters:** Without deployment infrastructure, the app cannot launch. No TLS, no automated deploys, no rollback capability.
- **Plan:** Docker Compose on a Linode Nanode ($5/mo) with Caddy (auto-TLS), GitHub Actions CI/CD, MongoDB Atlas. Existing observability (Sentry, OpenTelemetry → Grafana Cloud, Pino) works unchanged — all telemetry ships to external services over HTTPS.
- **Details:** See [Linode Deployment Plan](production/linode-deployment-plan.md) for full 5-phase implementation plan.
- **Impact:** Complete launch blocker.

### 4. Privacy Policy is a placeholder alert

- **What's missing:** `profile.tsx` shows `Alert.alert('Privacy Policy', 'Privacy policy will be available soon.')`.
- **Why it matters:** App Store / Play Store review requires a working privacy policy URL. GDPR/UK-GDPR compliance requires transparent data processing disclosure.
- **Fix:** Replace the alert with an in-app WebView or external link to a hosted privacy policy.
- **Impact:** App Store rejection; legal non-compliance.

### ~~4. No account deletion flow~~ — FIXED

- **Status:** Resolved. Full account deletion flow implemented with 48h grace period. Profile screen has "Delete Account" in Danger Zone section with confirmation alert. `DeletionBanner` component shows app-wide when deletion is pending, with one-tap cancel. Backend: `POST /auth/me/request-deletion` and `POST /auth/me/cancel-deletion` endpoints. Daily cron at 5 AM anonymizes expired accounts across all 12 collections (content set to `[deleted]`, statuses set to `DELETED = -999`, S3 audio files hard-deleted, version history hard-deleted, user record anonymized, tokenVersion incremented to force logout). GDPR-compliant irreversible anonymization.

---

## HIGH (Significant user-facing issues)

### ~~5. Login & Register screens break in dark mode~~ — FIXED

- **Status:** Resolved. `register.tsx` no longer exists (replaced by OTP auth). All auth screens (`login.tsx`, `welcome.tsx`, `intro.tsx`, `claim-account.tsx`) use `useTheme()` with dynamic `colors.background`, `colors.text`, `colors.border`, etc.

### ~~6. SignupNudgeModal is never mounted~~ — REMOVED

- **Status:** Resolved. The entire nudge system was dead code (component never mounted, action tracking never dispatched, navigation target `/(auth)/register` no longer exists). Deleted `SignupNudgeModal.tsx`, `nudgeSlice.ts`, and all references. Guest-to-account conversion is handled by the `claim-account` screen.

### ~~7. No network error handling / offline state~~ — FIXED

- **Status:** Resolved. Implemented `expo-network` with `useNetworkListener` hook, Redux `networkSlice`, `OfflineBanner` component (red "No internet" / green "Back online" with animations), and `useNetworkRecovery` hook for auto-refetch on reconnect.

### ~~8. Intro screen slide icons are just numbers~~ — FIXED

- **Status:** Resolved. `intro.tsx` now uses proper Ionicons (`mic-outline`, `document-text-outline`, `analytics-outline`, `rocket-outline`) rendered in styled concentric rings.

### 9. Help & Feedback links to placeholder email

- **What's missing:** `profile.tsx` shows `Contact support@example.com`.
- **Why it matters:** Users can't actually get help. `example.com` is obviously a placeholder.
- **Fix:** Replace with actual support email, or integrate a feedback form / link to a support portal.
- **Impact:** User trust and support capability.

---

## MEDIUM (Quality / polish issues)

### ~~10. No toast/snackbar feedback system~~ — DEFERRED (post-MVP)

- **Status:** Deferred. Will be implemented after MVP launch.
- **What's missing:** Success operations use `Alert.alert()` (e.g., "Saved" in entry detail). There's no toast system for lightweight, non-blocking feedback.
- **Fix:** Integrate `react-native-toast-message` or similar. Replace `Alert.alert('Saved', ...)` with a toast.

### ~~11. ExportSheet safe area gap~~ — FIXED

- **Status:** Resolved. `ExportSheet.tsx` now uses `useSafeAreaInsets()` with `Math.max(insets.bottom, 24)` instead of hardcoded `paddingBottom: 40`.

### ~~12. No loading/skeleton states for dashboard modules~~ — DEFERRED (post-MVP)

- **Status:** Deferred. Will be implemented after MVP launch.
- **What's missing:** Home screen renders empty modules immediately while `fetchDashboard()` is in flight. No skeleton loaders or shimmer placeholders.
- **Fix:** Add a `dashboardLoading` state and show skeleton placeholders while loading.

### ~~13. Conversation list screen doesn't refresh on focus~~ — REMOVED

- **Status:** Resolved. The conversations list screen (`(messages)/index.tsx`) was dead code — no navigation path in the app ever reached it. Users always navigate directly to specific conversations from the Home or Entries screens. Removed the screen, its layout registration, and the unused `FloatingActionButton` component.

### ~~14. Entry detail navigation hidden during edits with no explanation~~ — FIXED

- **Status:** Resolved. A sticky save/discard bar now appears at the bottom of the screen when `hasChanges` is true, with a red discard button and green "Save changes" button, clearly explaining why navigation is hidden.

### ~~15. No haptic feedback on key interactions~~ — DEFERRED (post-MVP)

- **Status:** Deferred. Will be implemented after MVP launch.
- **What's missing:** Voice recording start/stop, completing a PDP action, finalising an entry — no haptic feedback anywhere.
- **Fix:** Add `Haptics.impactAsync()` from `expo-haptics` on key interactions (recording start, action toggle, finalise).

### ~~16. Welcome screen logo is placeholder text~~ — FIXED

- **Status:** Resolved. `welcome.tsx` now displays an Ionicons briefcase icon in a double-ring design with themed colours instead of `<Text>App</Text>`.

### ~~17. Version history shows no diff/comparison~~ — DEFERRED (post-MVP)

- **Status:** Deferred. Will be implemented after MVP launch.
- **What's missing:** The version preview modal shows the version's content but doesn't compare it with the current version.
- **Fix:** Add a simple text-diff view or at minimum show "Changed fields" indicators.

### 24. No repository-level integration tests for non-trivial MongoDB queries

- **What's missing:** All service tests mock the repository layer, so actual Mongoose queries (filters, `$set`, `$in`, `$[]` positional operators, enum comparisons) are never executed against a real database. A recent bug — `refCollection: 'messages'` instead of `MediaRefCollection.MESSAGES` (string vs numeric enum `100`) — passed all unit tests but caused a 500 in production.
- **Why it matters:** The repository layer is the boundary between application code and MongoDB. Type mismatches, wrong field names, and operator bugs are silent at the unit test level because the repo is mocked. These bugs only surface at runtime.
- **Fix:** Add integration tests (using `jest.config.ts` / real MongoDB) for non-trivial repo methods: `anonymizeConversation`, `anonymizeArtefact`, `anonymizeGoal`, `anonymizeByArtefactId`, `markDeletedByMessageIds`, and any method using `updateMany`, `$[]`, or multi-field `$set`/`$unset`. Simple `findOne`/`findById` lookups don't need this.
- **Impact:** Silent data corruption or 500 errors from untested queries.

---

## LOW (Nice-to-have before launch)

### ~~18. Entries list does not refresh on focus~~ — FIXED

- **Status:** Resolved. Uses `useNetworkRecovery` for auto-refetch on connectivity restore, plus `RefreshControl` for manual pull-to-refresh.

### ~~19. PDP goals list does not refresh on focus~~ — FIXED

- **Status:** Resolved. Same pattern as entries — `useNetworkRecovery` + `RefreshControl`.

### 20. Deep linking is limited

- `_layout.tsx` only handles `entries`, `pdp`, `profile`, `home`. No deep links for specific entries (`/entry/:id`), conversations, or PDP goals.
- Matters for push notifications or shared links.

### ~~21. No pull-to-refresh on Home screen~~ — FIXED

- **Status:** Resolved. `ScrollView` now has `RefreshControl` wired to `fetchInit()`. Pull-to-refresh reloads dashboard data and syncs user profile. Uses themed `tintColor` for the spinner.

### ~~22. Accessibility: close buttons use "X" text~~ — REMOVED

- `SignupNudgeModal.tsx` has been deleted. No longer applicable.

### 23. No Terms of Service link

- Profile has "Privacy Policy" but no Terms of Service link. Required for app store submission.

---

## Likely Missing Flows

| Flow | Evidence | Status |
|------|----------|--------|
| ~~**Password reset**~~ | ~~Login screen has no "Forgot password?"~~ | N/A — OTP passwordless auth |
| ~~**Account deletion**~~ | ~~Profile has no "Delete Account"~~ | FIXED — 48h grace period, anonymization cron, DeletionBanner |
| **Push notifications** | No notification permissions, no token registration | Not implemented |
| **Onboarding questions** | Store has `onboarding` slice, initialized in root layout, but no onboarding screens exist | Wired but no UI |
| **Guest data migration** | Guest to registered account transition exists, but no mention of migrating guest data to the new account | Unclear |
| ~~**Token refresh**~~ | ~~JWT auth present but no visible token refresh or session expiry handling~~ | FIXED — sliding window via `X-Refreshed-Token` response header on every authenticated request |
| **Image/document attachments** | Media upload exists for audio, but no image capture or document attach in chat | May be intentional |
| **Search** | No search functionality across entries or conversations | Not implemented |
| **Entry editing of capabilities** | Title and reflection are editable in IN_REVIEW, but capabilities are read-only | May be intentional |
| **Biometric authentication** | SecureStore used for tokens, but no Face ID / Touch ID lock option | Not implemented |
| **App update prompting** | No mechanism to prompt users to update the app | Not implemented |

---

## Final Recommendation

### **Almost there — 4 items remain for MVP**

Since the initial review, **11 of 18 open items have been fixed/removed** and **4 have been deferred to post-MVP** (#10 Toast system, #12 Dashboard skeletons, #15 Haptic feedback, #17 Version diff).

**2 critical items** still block production release:

1. **No production deployment infrastructure** — needs Dockerfile, Docker Compose, CI/CD, server provisioning ([plan](production/linode-deployment-plan.md))
2. **No privacy policy** — needs legal content + hosting

**Remaining open items for MVP (by priority):**

| Priority | Count | Items |
|----------|-------|-------|
| Critical | 2 | #3 Deployment infrastructure, #4 Privacy Policy |
| High | 1 | #9 Help & Feedback placeholder email |
| Medium | 0 | — |
| Low | 2 | #20 Deep linking, #23 Terms of Service |

**Deferred to post-MVP:**

| Items |
|-------|
| #10 Toast/snackbar system, #12 Dashboard skeletons, #15 Haptic feedback, #17 Version diff |

**Estimated effort to reach minimum viable production release:** Privacy policy (1 day) + deployment infrastructure (2-3 days for all 5 phases).
