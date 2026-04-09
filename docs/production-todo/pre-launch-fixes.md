# Pre-Launch Production Fixes

Consolidated from: `backend-failure-review.md`, `production-readiness-review.md`, `security-assessment.md`, `bugs.md`, `todo.md`

**Last updated:** 2026-04-08

---

## Blockers

### 1. ~~OTP email delivery not implemented~~ RESOLVED

- **Source:** `security-assessment.md` section 2.2
- **File:** `apps/api/src/otp/otp.service.ts`
- **Resolution:** OTP email delivery implemented via SMTP (see `SMTP_*` env vars in `app.config.ts`). Dev mode OTP exposure removed in production.
- **Resolved:** 2026-04-08

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

### 4. ~~CORS allows all origins with credentials~~ RESOLVED

- **Source:** `security-assessment.md` section 3.1
- **File:** `apps/api/src/main.ts`, `apps/api/src/config/app.config.ts`
- **Resolution:** Added `ALLOWED_ORIGINS` env var (comma-separated, Zod-validated at startup, defaults to `http://localhost:5173` for dev). CORS origin callback silently rejects unknown origins. Production must set `ALLOWED_ORIGINS=https://logdit.app`. Mobile app unaffected (native clients don't send Origin headers).
- **Resolved:** 2026-04-08

### 5. ~~JWT validate() does not check user status~~ RESOLVED

- **Source:** `backend-failure-review.md` risk #5
- **File:** `apps/api/src/auth/strategies/jwt.strategy.ts`
- **Resolution:** `validate()` now selects `role`, `email`, `anonymizedAt` from DB alongside `tokenVersion`. Blocks anonymized users with 401. Returns DB-authoritative `role` and `email` instead of stale JWT payload values — role/email changes take effect immediately, not after token expiry. The existing `TokenRefreshInterceptor` already fetches a fresh user doc, so refreshed tokens also carry current values. Added 6 unit tests in `jwt.strategy.spec.ts`. Verified `anonymizeUserRecord()` already bumps `tokenVersion` atomically.
- **Resolved:** 2026-04-08

### 6. ~~@Roles() decorator never used — guests have full access~~ NOT A CONCERN

- **Source:** `security-assessment.md` section 5.4
- **File:** `apps/api/src/common/guards/roles.guard.ts`
- **Resolution:** Intentional by design. Guests have full access like normal users — the "try before you sign up" flow gives guests the same capabilities. The guardrails are stricter quota limits and throttle rules (see `quota.config.ts`), not access control. `@Roles()` exists for future use (e.g., admin-only endpoints). No changes needed.
- **Resolved:** 2026-04-08

### 7. Help & Feedback links to placeholder email

- **Source:** `production-readiness-review.md` item #9
- **File:** `apps/mobile/` — `profile.tsx`
- **Problem:** Shows `support@example.com`. Obviously a placeholder.
- **Fix:** Replace with real support email or integrate a feedback form.
- **Effort:** Small

### 8. ~~Fire-and-forget message processing can permanently stick conversations~~ NOT A CONCERN

- **Source:** `backend-failure-review.md` risk #1
- **File:** `apps/api/src/outbox/`, `apps/api/src/processing/processing.service.ts`
- **Resolution:** The premise is incorrect — message processing already uses the outbox pattern, not fire-and-forget. `MessageProcessingHandler` dispatches via the outbox consumer with: (1) retry with exponential backoff (2^attempts * 1s, up to 3 attempts), (2) stale lock recovery every poll cycle via `resetStaleLocks()`, (3) idempotency guard skipping already-COMPLETE/FAILED messages, (4) top-level try/catch in `processMessage()` that marks failures as `MessageStatus.FAILED`. Messages cannot permanently stick — they either complete or reach terminal FAILED state after 3 retries.
- **Resolved:** 2026-04-08

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

### 12. ~~LLM hallucination and edge case bugs~~ RESOLVED

- **Source:** `bugs.md` lines 11-15, `todo.md` line 14
- **Problems:**
  - [x] Non-medical audio (e.g. Malayalam) gets hallucinated into English by AssemblyAI — **Mitigated:** `language_code: 'en_uk'` hardcoded in `llm.service.ts`, plus `isRelevant` classification gate catches non-medical transcriptions. Anti-injection preamble added to all 8 prompts.
  - [x] AI recommends entry types for non-medical topics instead of rejecting — **Fixed:** `isRelevant` boolean in classify schema, `adjustConfidence()` hard-gates to 0 when irrelevant, up to 2 clarification rounds, terminal rejection message when exhausted. Test coverage confirms.
  - [x] AI sometimes returns capabilities with no options, leaving user stuck in chat — **Fixed:** `present-capabilities.node.ts` now interrupts with empty options instead of silently continuing. `portfolio-graph.service.ts` sends a terminal message. Added `questionType: 'terminal'` across the stack to prevent resume crashes and disable UI actions. 6 unit tests added.
  - [x] No guard when user starts analysis with little/no case information — **Fixed:** `hasCompleteMessages()` check requires ≥1 complete user message. Short transcripts (<50 words) capped at 0.85 confidence. Low confidence triggers clarification rounds.
- **Resolved:** 2026-04-08

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

- [x] **Blocker:** OTP email delivery (resolved 2026-04-08)
- [ ] **Blocker:** Privacy policy
- [ ] **Blocker:** Deployment config / CI/CD
- [x] **High:** Restrict CORS origins (resolved 2026-04-08)
- [x] **High:** JWT user status check (resolved 2026-04-08)
- [x] **High:** Apply @Roles() decorators (not a concern — intentional design, 2026-04-08)
- [ ] **High:** Replace placeholder support email
- [x] **High:** Stuck message recovery (not a concern — outbox pattern already handles this, 2026-04-08)
- [ ] **Medium:** Terms of Service
- [ ] **Medium:** Test coverage for critical modules
- [ ] **Medium:** Polling load / caching
- [x] **Medium:** LLM hallucination bugs (resolved 2026-04-08)
- [ ] **Medium:** Login error handling
- [ ] **Medium:** Log aggregation
