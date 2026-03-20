# Production Readiness Review

**Date:** 2026-03-18
**Scope:** All screens in the React Native (Expo) mobile app

---

## Summary of Biggest Risks

1. ~~**No password reset flow**~~ — **N/A.** App uses OTP-based passwordless auth; no passwords exist.
2. ~~**The `(review-period)` route group is not registered in the root Stack**~~ — **FIXED.**
3. ~~**SignupNudgeModal is exported but never rendered**~~ — **REMOVED.** Dead code deleted.
4. **Privacy Policy and Help links are placeholder alerts** — a legal liability for production.
5. **Login/Register screens have hardcoded white backgrounds** — broken in dark mode.

---

## CRITICAL (Blocks launch)

### ~~1. Missing `(review-period)` Stack.Screen registration~~ — FIXED

- **Status:** Resolved. Added `<Stack.Screen name="(review-period)" options={{ presentation: 'card' }} />` to the root layout.

### ~~2. No password reset / forgot password flow~~ — N/A

- **Status:** Not applicable. The app uses OTP-based passwordless authentication — there are no passwords to reset.

### 3. Privacy Policy is a placeholder alert

- **What's missing:** `profile.tsx` shows `Alert.alert('Privacy Policy', 'Privacy policy will be available soon.')`.
- **Why it matters:** App Store / Play Store review requires a working privacy policy URL. GDPR/UK-GDPR compliance requires transparent data processing disclosure.
- **Fix:** Replace the alert with an in-app WebView or external link to a hosted privacy policy.
- **Impact:** App Store rejection; legal non-compliance.

### 4. No account deletion flow

- **What's missing:** No "Delete Account" option anywhere in the profile screen. Only logout/sign-out exists.
- **Why it matters:** Apple App Store requires account deletion since June 2022. Play Store followed suit. Submission will be rejected without it.
- **Fix:** Add "Delete Account" option in the Profile > Account section with confirmation flow and backend `DELETE /api/users/me` endpoint.
- **Impact:** App Store rejection.

---

## HIGH (Significant user-facing issues)

### ~~5. Login & Register screens break in dark mode~~ — FIXED

- **Status:** Resolved. `register.tsx` no longer exists (replaced by OTP auth). All auth screens (`login.tsx`, `welcome.tsx`, `intro.tsx`, `claim-account.tsx`) use `useTheme()` with dynamic `colors.background`, `colors.text`, `colors.border`, etc.

### ~~6. SignupNudgeModal is never mounted~~ — REMOVED

- **Status:** Resolved. The entire nudge system was dead code (component never mounted, action tracking never dispatched, navigation target `/(auth)/register` no longer exists). Deleted `SignupNudgeModal.tsx`, `nudgeSlice.ts`, and all references. Guest-to-account conversion is handled by the `claim-account` screen.

### 7. No network error handling / offline state

- **What's missing:** No global network status indicator. API calls fail silently in many flows (dashboard fetch, artefact fetch). No retry banners or offline mode indication.
- **Why it matters:** Mobile users frequently lose connectivity. The app will appear frozen or empty with no feedback.
- **Fix:** Add a `NetInfo` listener with a global "No internet connection" banner. Add retry logic to critical fetches (dashboard, messages, artefacts).
- **Impact:** Poor UX on unreliable connections (common in clinical settings).

### 8. Intro screen slide icons are just numbers

- **What's missing:** `intro.tsx` uses `icon: '1'`, `icon: '2'`, etc., rendering plain text numbers instead of actual illustrations or icons.
- **Why it matters:** First impression screen looks unfinished/placeholder.
- **Fix:** Replace with actual illustrations (SVG/Lottie) or at minimum use Ionicons/vector icons that represent each concept.
- **Impact:** App looks unprofessional on first launch.

### 9. Help & Feedback links to placeholder email

- **What's missing:** `profile.tsx` shows `Contact support@example.com`.
- **Why it matters:** Users can't actually get help. `example.com` is obviously a placeholder.
- **Fix:** Replace with actual support email, or integrate a feedback form / link to a support portal.
- **Impact:** User trust and support capability.

---

## MEDIUM (Quality / polish issues)

### 10. No toast/snackbar feedback system

- **What's missing:** Success operations use `Alert.alert()` (e.g., "Saved" in entry detail). There's no toast system for lightweight, non-blocking feedback.
- **Why it matters:** Native alerts are disruptive for confirmations like "Copied to clipboard" or "Changes saved". They break user flow.
- **Fix:** Integrate `react-native-toast-message` or similar. Replace `Alert.alert('Saved', ...)` with a toast.
- **Impact:** UX polish; feels like a web app wrapped in native.

### 11. ExportSheet safe area gap

- **What's missing:** `ExportSheet.tsx` uses hardcoded `paddingBottom: 40` instead of `insets.bottom`.
- **Why it matters:** On newer iPhones with larger home indicators, the cancel button may be partially obscured. On older devices, excess padding.
- **Fix:** Use `useSafeAreaInsets()` for bottom padding.
- **Impact:** Minor layout issue on specific devices.

### 12. No loading/skeleton states for dashboard modules

- **What's missing:** Home screen renders empty modules immediately while `fetchDashboard()` is in flight. No skeleton loaders or shimmer placeholders.
- **Why it matters:** First load shows empty "No entries yet" / "No goals due" messages briefly before data appears, causing content flash.
- **Fix:** Add a `dashboardLoading` state and show skeleton placeholders while loading.
- **Impact:** Perceived performance and polish.

### 13. Conversation list screen doesn't refresh on focus

- **What's missing:** Conversations list only fetches on mount (`useEffect`), not on focus. After creating a new conversation and going back, the list may be stale.
- **Why it matters:** User creates an entry, goes back to conversations — their new conversation doesn't appear until manual pull-to-refresh.
- **Fix:** Add `useFocusEffect` to re-fetch conversations (same pattern used in the Home screen's prompt randomization).
- **Impact:** Confusing stale data.

### 14. Entry detail navigation hidden during edits with no explanation

- **What's missing:** Entry detail hides navigation links and finalise button when `hasChanges` is true. This is intentional to force save, but there's no visual hint explaining why they disappeared.
- **Why it matters:** User makes a title edit, then wonders where the "Finalise" button went.
- **Fix:** Either keep navigation links visible (just disable them with a tooltip), or add a small text hint like "Save or discard changes to continue."
- **Impact:** Confusion for users in the review flow.

### 15. No haptic feedback on key interactions

- **What's missing:** Voice recording start/stop, completing a PDP action, finalising an entry — no haptic feedback anywhere.
- **Why it matters:** Standard iOS/Android convention for confirming tactile actions. Feels hollow without it.
- **Fix:** Add `Haptics.impactAsync()` from `expo-haptics` on key interactions (recording start, action toggle, finalise).
- **Impact:** Polish.

### 16. Welcome screen logo is placeholder text

- **What's missing:** `welcome.tsx` renders `<Text>App</Text>` as the logo.
- **Why it matters:** Looks unfinished.
- **Fix:** Replace with actual app logo/icon image.
- **Impact:** Brand perception.

### 17. Version history shows no diff/comparison

- **What's missing:** The version preview modal shows the version's content but doesn't compare it with the current version.
- **Why it matters:** Users can't tell what changed between versions without manually comparing.
- **Fix:** Add a simple text-diff view or at minimum show "Changed fields" indicators.
- **Impact:** Utility of the version history feature.

---

## LOW (Nice-to-have before launch)

### 18. Entries list does not refresh on focus

- Same issue as conversations list — only fetches on mount. Completing a conversation and navigating to entries tab shows stale data.

### 19. PDP goals list does not refresh on focus

- Same pattern. Finalising an entry with new goals won't appear until pull-to-refresh.

### 20. Deep linking is limited

- `_layout.tsx` only handles `entries`, `pdp`, `profile`, `home`. No deep links for specific entries (`/entry/:id`), conversations, or PDP goals.
- Matters for push notifications or shared links.

### 21. No pull-to-refresh on Home screen

- Home screen uses `ScrollView` (not `FlatList`), so there's no `RefreshControl`. User can't manually refresh dashboard data.

### ~~22. Accessibility: close buttons use "X" text~~ — REMOVED

- `SignupNudgeModal.tsx` has been deleted. No longer applicable.

### 23. No Terms of Service link

- Profile has "Privacy Policy" but no Terms of Service link. Required for app store submission.

---

## Likely Missing Flows

| Flow | Evidence | Status |
|------|----------|--------|
| ~~**Password reset**~~ | ~~Login screen has no "Forgot password?"~~ | N/A — OTP passwordless auth |
| **Account deletion** | Profile has no "Delete Account" | Not implemented |
| **Push notifications** | No notification permissions, no token registration | Not implemented |
| **Onboarding questions** | Store has `onboarding` slice, initialized in root layout, but no onboarding screens exist | Wired but no UI |
| **Guest data migration** | Guest to registered account transition exists, but no mention of migrating guest data to the new account | Unclear |
| **Token refresh** | JWT auth present but no visible token refresh or session expiry handling | Unclear |
| **Image/document attachments** | Media upload exists for audio, but no image capture or document attach in chat | May be intentional |
| **Search** | No search functionality across entries or conversations | Not implemented |
| **Entry editing of capabilities** | Title and reflection are editable in IN_REVIEW, but capabilities are read-only | May be intentional |
| **Biometric authentication** | SecureStore used for tokens, but no Face ID / Touch ID lock option | Not implemented |
| **App update prompting** | No mechanism to prompt users to update the app | Not implemented |

---

## Final Recommendation

### **Needs significant work**

The app has a solid feature set and well-structured code, but **2 critical items** block production release:

1. ~~**`(review-period)` route crash**~~ — **FIXED**
2. ~~**No password reset**~~ — **N/A** (OTP passwordless auth)
3. **No privacy policy** — needs legal content + hosting, ~1 day
4. **No account deletion** — requires backend + frontend, ~1 day

The **high-priority items** (dark mode on auth screens, mounting the nudge modal, placeholder content) are each individually fast fixes (~30 min each) but collectively essential for a polished first impression.

**Estimated effort to reach minimum viable production release: 3-5 days** for critical + high items.
