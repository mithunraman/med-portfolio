# Pre-Launch Production Fixes

Consolidated from: `backend-failure-review.md`, `production-readiness-review.md`, `security-assessment.md`, `bugs.md`, `todo.md`

**Last updated:** 2026-04-06

---

## Blockers

### 1. OTP email delivery not implemented

- **Source:** `security-assessment.md` section 2.2
- **File:** `apps/api/src/otp/otp.service.ts` (line 63 TODO)
- **Problem:** OTPs are generated and stored but never sent in production. Dev mode returns OTP in API response. No user can log in in production.
- **Fix:** Integrate a transactional email provider (Resend, SendGrid, or AWS SES). Remove dev OTP from API responses in production.
- **Effort:** Medium

### 2. Privacy Policy is a placeholder

- **Source:** `production-readiness-review.md` item #3
- **File:** `apps/mobile/` — `profile.tsx`
- **Problem:** Shows `Alert.alert('Privacy Policy', 'Privacy policy will be available soon.')`. App Store / Play Store will reject. GDPR/UK-GDPR legal liability.
- **Fix:** Write privacy policy content, host it, replace alert with in-app WebView or external link.
- **Effort:** Small (engineering) + legal content needed

### 3. No deployment configuration or CI/CD

- **Source:** `security-assessment.md` section 4.5
- **Problem:** No Dockerfile, docker-compose, Kubernetes manifests, GitHub Actions, or `eas.json`. Deployment is not reproducible or automated. No test gate.
- **Fix:** Create Dockerfile for API, CI pipeline (lint + test + build), EAS config for mobile builds.
- **Effort:** Medium-Large

---

## High

### 4. CORS allows all origins with credentials

- **Source:** `security-assessment.md` section 3.1
- **File:** `apps/api/src/main.ts` (lines 17-21)
- **Problem:** `origin: true, credentials: true` reflects any requesting origin. Any malicious website can make authenticated cross-origin requests.
- **Fix:** Replace `origin: true` with explicit domain list via environment variable.
- **Effort:** Small

### 5. JWT validate() does not check user status

- **Source:** `backend-failure-review.md` risk #5
- **File:** `apps/api/src/auth/jwt.strategy.ts`
- **Problem:** `validate()` only extracts claims from the token. Does not check `user.lockedUntil` or active/disabled flag. Compromised accounts remain accessible for up to 7 days.
- **Fix:** Add DB lookup (with short cache) for `user.lockedUntil` and `user.isActive` in `validate()`.
- **Effort:** Medium

### 6. @Roles() decorator never used — guests have full access

- **Source:** `security-assessment.md` section 5.4
- **File:** `apps/api/src/common/guards/roles.guard.ts`
- **Problem:** `RolesGuard` is globally registered but `@Roles()` is not applied to any route. Guest users can access all endpoints.
- **Fix:** Audit endpoints and apply `@Roles()` to restrict guest users from full-user functionality.
- **Effort:** Medium

### 7. Help & Feedback links to placeholder email

- **Source:** `production-readiness-review.md` item #9
- **File:** `apps/mobile/` — `profile.tsx`
- **Problem:** Shows `support@example.com`. Obviously a placeholder.
- **Fix:** Replace with real support email or integrate a feedback form.
- **Effort:** Small

### 8. Fire-and-forget message processing can permanently stick conversations

- **Source:** `backend-failure-review.md` risk #1
- **File:** `apps/api/src/conversations/conversations.service.ts`
- **Problem:** `processMessage()` is fire-and-forget. If the process crashes mid-processing, messages are stuck in PENDING/TRANSCRIBING/CLEANING forever. No recovery. Conversation permanently stuck.
- **Fix:** Add a periodic sweep job that finds messages stuck in non-terminal processing states for > N minutes and re-triggers processing. Or use the outbox pattern for message processing.
- **Effort:** Medium

---

## Medium

### 9. No Terms of Service link

- **Source:** `production-readiness-review.md` item #23
- **Problem:** Profile has Privacy Policy but no Terms of Service link. Required for app store submission.
- **Fix:** Write ToS content, host it, add link to profile screen.
- **Effort:** Small (engineering) + legal content needed

### 10. Missing test coverage for critical modules

- **Source:** `security-assessment.md` section 4.4
- **Problem:** No tests for `items/`, `media/`, `dashboard/`, `storage/`, `llm/`, `analysis-runs/`, `PortfolioGraphService`. Zero mobile tests.
- **Fix:** Prioritize unit tests for `storage.service.ts`, `llm.service.ts`, `media.service.ts`.
- **Effort:** Large

### 11. Polling load amplification under concurrent users

- **Source:** `backend-failure-review.md` risk #4
- **Problem:** 100 users polling at 2s intervals = 50 req/s, each hitting 3-5 DB queries via `computeContext()`. No caching, no conditional polling, no client backoff. MongoDB becomes the bottleneck.
- **Fix:** (a) Cache `computeContext()` with short TTL. (b) Add `lastUpdatedAt` for conditional requests. (c) Consider SSE for active analysis.
- **Effort:** Medium-Large

### 12. LLM hallucination and edge case bugs

- **Source:** `bugs.md` lines 11-15, `todo.md` line 14
- **Problems:**
  - [ ] Non-medical audio (e.g. Malayalam) gets hallucinated into English by AssemblyAI
  - [ ] AI recommends entry types for non-medical topics instead of rejecting
  - [ ] AI sometimes returns capabilities with no options, leaving user stuck in chat
  - [ ] No guard when user starts analysis with little/no case information
- **Fix:** Improve classification prompts, add non-medical detection, validate capability options are non-empty, add minimum content guard before analysis.
- **Effort:** Medium

### 13. Login error signs user out

- **Source:** `todo.md` line 3
- **Problem:** When the API returns an error during login, the user is signed out instead of seeing an error message with retry.
- **Fix:** Handle API errors in the login flow gracefully — show error message, keep user on login screen.
- **Effort:** Small

### 14. Log aggregation not configured for production

- **Source:** `security-assessment.md` line 290, `structured-logging.md` Phase 4
- **Problem:** Structured logging (Pino) is in place but logs only go to stdout. No aggregation infra (ELK, Datadog, CloudWatch) configured. Production log serializers not optimized.
- **Fix:** Configure log aggregation target. Implement Phase 4 serializers.
- **Effort:** Medium

---

## Checklist

- [ ] **Blocker:** OTP email delivery
- [ ] **Blocker:** Privacy policy
- [ ] **Blocker:** Deployment config / CI/CD
- [ ] **High:** Restrict CORS origins
- [ ] **High:** JWT user status check
- [ ] **High:** Apply @Roles() decorators
- [ ] **High:** Replace placeholder support email
- [ ] **High:** Stuck message recovery
- [ ] **Medium:** Terms of Service
- [ ] **Medium:** Test coverage for critical modules
- [ ] **Medium:** Polling load / caching
- [ ] **Medium:** LLM hallucination bugs
- [ ] **Medium:** Login error handling
- [ ] **Medium:** Log aggregation
