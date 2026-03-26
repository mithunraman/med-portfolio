# Security & Production-Readiness Assessment

**Date:** 2026-03-26
**Scope:** Full repository review — backend (NestJS), database (MongoDB), mobile app (React Native/Expo)

---

## 1. Executive Summary

This repository implements a portfolio analysis platform with a NestJS backend, MongoDB database, and React Native mobile app. The codebase demonstrates **strong security fundamentals**: global JWT authentication, consistent ownership checks at the repository layer, comprehensive Zod validation on all inputs, timing-safe OTP verification, two-layer PII redaction, and encrypted token storage on mobile.

However, **the repository is not production-ready**. The most urgent issue is that real credentials (MongoDB, OpenAI, AssemblyAI, S3) are committed to the `.env` file in version control. Beyond secrets, critical production infrastructure is absent: no deployment configuration, no health checks, no observability/APM, no general rate limiting, no security headers, and the OTP email delivery mechanism is unimplemented (OTPs are only logged in development). Several important modules lack test coverage entirely.

The authentication and authorization architecture is well-designed — ownership verification is enforced at the database query level across all repositories, and the Result pattern prevents error leakage. The main risks are operational and configuration-level rather than fundamental architectural flaws.

---

## 2. Critical Findings

### 2.1 Production Secrets Committed to Version Control

- **Severity:** Critical
- **Confidence:** Confirmed
- **Affected area:** `apps/api/.env`

**Description:** The backend `.env` file containing real credentials is committed to the repository. Exposed secrets include:

| Secret | Value prefix | Line |
|--------|-------------|------|
| MongoDB connection string (user + password) | `mongodb+srv://dev_dbuser:Eh5Al...` | 4 |
| JWT signing secret | `bee9b179-5b85-...` | 6 |
| OpenAI API key | `sk-proj-ILDbMb15...` | 15 |
| Linode S3 access key + secret | `E271QZ5D...` / `3zKUE2Ra...` | 11-12 |
| AssemblyAI API key | `d7c2d4c1...` | 18 |

**Why it matters:** Anyone with repository access has full credentials to the database, object storage, and paid API services. If this repository is or ever becomes public, all services are immediately compromised. Even in private repos, committed secrets persist in git history indefinitely.

**Evidence:** The root `.gitignore` lists `.env` on line 18, but the file was committed before the gitignore rule was added (or the rule failed to match nested paths). The `.env.example` files correctly use placeholders.

**Recommended fix:**
1. **Immediately** rotate all exposed credentials (MongoDB password, OpenAI key, AssemblyAI key, S3 keys, JWT secret)
2. Remove the `.env` file from tracking: `git rm --cached apps/api/.env`
3. Update `.gitignore` to use `**/.env` to catch all nested `.env` files
4. Use BFG Repo-Cleaner or `git filter-repo` to scrub secrets from git history
5. Consider a secrets manager (e.g., AWS Secrets Manager, Doppler) for production

---

### 2.2 OTP Email Delivery Not Implemented

- **Severity:** Critical
- **Confidence:** Confirmed
- **Affected area:** `apps/api/src/otp/otp.service.ts`

**Description:** The OTP service has a TODO comment at line 63: *"Integrate email service (e.g., Resend) to send OTP via email."* In development mode, the OTP is returned in the API response (line 67-69). In production, there is **no delivery mechanism** — the OTP is generated and stored but never sent to the user.

**Why it matters:** Authentication is completely non-functional in production. No user can log in.

**Recommended fix:** Integrate a transactional email provider (Resend, SendGrid, AWS SES) and ensure the OTP is never returned in API responses in production.

---

## 3. High-Risk Findings

### 3.1 CORS Allows All Origins with Credentials

- **Severity:** High
- **Confidence:** Confirmed
- **Affected area:** `apps/api/src/main.ts` (lines 17-21)

**Description:** CORS is configured with `origin: true, credentials: true`, which reflects any requesting origin in the `Access-Control-Allow-Origin` header while also permitting cookies/auth headers.

**Why it matters:** Any malicious website can make authenticated cross-origin requests to the API if a user visits it while logged in (especially relevant for the web client which stores tokens in localStorage). This is a prerequisite for CSRF-like attacks against the API.

**Recommended fix:** Restrict `origin` to explicit allowed domains (e.g., `['https://app.yourdomain.com']`). Use an environment variable for configurability across environments.

---

### 3.2 No HTTP Security Headers (Helmet)

- **Severity:** High
- **Confidence:** Confirmed
- **Affected area:** `apps/api/src/main.ts`

**Description:** No security header middleware is configured. Missing headers include: `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `X-XSS-Protection`, `Referrer-Policy`, and `Permissions-Policy`.

**Why it matters:** Without these headers, the web client and any browser-based consumers are exposed to clickjacking, MIME-sniffing attacks, and missing HSTS enforcement.

**Recommended fix:** Install and configure `helmet` middleware in `main.ts` before other middleware.

---

### 3.3 No General API Rate Limiting

- **Severity:** High
- **Confidence:** Confirmed
- **Affected area:** `apps/api/src/main.ts`, all controllers

**Description:** Rate limiting exists only for OTP requests (3 per 10 minutes per email in `otp.service.ts` lines 105-118). No general rate limiting is applied to API endpoints.

**Why it matters:** Expensive operations (LLM calls via the portfolio graph, audio transcription, file uploads) can be abused to generate large bills on OpenAI/AssemblyAI, exhaust server resources, or degrade service for other users.

**Recommended fix:** Add `@nestjs/throttler` or a similar rate-limiting module globally, with tighter limits on expensive endpoints (LLM invocations, media upload/transcription).

---

### 3.4 No Health Check Endpoints

- **Severity:** High
- **Confidence:** Confirmed
- **Affected area:** All of `apps/api/`

**Description:** No `/health`, `/healthz`, or `/ready` endpoint exists. There is no way to verify that the API, MongoDB, S3, or external service dependencies are functioning.

**Why it matters:** Load balancers, container orchestrators, and monitoring systems cannot determine if the service is healthy. Unhealthy instances will continue receiving traffic. Debugging production issues requires manual investigation.

**Recommended fix:** Implement `@nestjs/terminus` health checks covering MongoDB connectivity, S3 reachability, and basic application readiness.

---

## 4. Medium-Risk Findings

### 4.1 Web Client Stores JWT in localStorage

- **Severity:** Medium
- **Confidence:** Confirmed
- **Affected area:** `apps/web/src/api/client.ts` (lines 8-18)

**Description:** The web client stores the JWT access token in `localStorage`, which is accessible to any JavaScript running on the page.

**Why it matters:** If an XSS vulnerability is introduced (even via a third-party dependency), the token can be exfiltrated. The mobile app correctly uses SecureStore (encrypted OS keychain).

**Recommended fix:** Consider `httpOnly` cookies for the web client with CSRF protection, or at minimum ensure a strict CSP is in place to mitigate XSS.

---

### 4.2 No Certificate Pinning on Mobile

- **Severity:** Medium
- **Confidence:** Confirmed
- **Affected area:** `apps/mobile/src/api/client.ts` (line 37)

**Description:** The mobile HTTP adapter uses standard `fetch()` with no certificate pinning or custom TLS validation. iOS enforces ATS (`NSAllowsArbitraryLoads: false` in Info.plist), but no server certificate is pinned.

**Why it matters:** On compromised networks, a MITM attack with a rogue CA certificate could intercept API traffic including JWT tokens and user data. This is a common mobile pentest finding.

**Recommended fix:** Implement certificate pinning using a library like `react-native-ssl-pinning` or Expo's network security config, at least for production API endpoints.

---

### 4.3 No Observability or Error Tracking

- **Severity:** Medium
- **Confidence:** Confirmed
- **Affected area:** Entire repository

**Description:** No APM (Application Performance Monitoring), distributed tracing, error tracking (Sentry/Bugsnag), or metrics export (Prometheus/Datadog) is configured. The mobile app has no crash reporting. Backend logging is structured (Pino with correlation IDs and header redaction), but logs only go to stdout.

**Why it matters:** Production incidents cannot be detected, diagnosed, or triaged effectively. Mobile crashes are invisible. There is no alerting on error rate spikes, latency degradation, or dependency failures.

**Recommended fix:** Integrate Sentry (or equivalent) for both backend and mobile, and add metrics export for key operational signals.

---

### 4.4 Missing Test Coverage for Critical Modules

- **Severity:** Medium
- **Confidence:** Confirmed
- **Affected area:** Multiple modules

**Description:** The following modules have **no tests**: `items/`, `media/`, `dashboard/`, `storage/`, `llm/`, `analysis-runs/`, and the core `PortfolioGraphService`. The mobile app has **zero test files**. Tested modules (auth, outbox, conversations, PII redaction) have good quality tests.

**Why it matters:** Untested modules include the S3 storage layer (with retry/backoff logic), the LLM service (structured output parsing, transcription), and media validation — all critical for correctness and security.

**Recommended fix:** Prioritize unit tests for `storage.service.ts` (S3 operations), `llm.service.ts` (structured output handling, error cases), and `media.service.ts` (ownership validation, MIME checks).

---

### 4.5 No Deployment Configuration or CI/CD

- **Severity:** Medium
- **Confidence:** Confirmed
- **Affected area:** Repository root

**Description:** No Dockerfile, docker-compose, Kubernetes manifests, Terraform/Pulumi configs, serverless configs, or GitHub Actions workflows exist in the repository. No `eas.json` for Expo Application Services.

**Why it matters:** Deployment is not reproducible, auditable, or automated. No automated test gate prevents broken code from reaching production.

**Recommended fix:** Add at minimum a Dockerfile for the API, a CI pipeline that runs tests and linting, and EAS configuration for mobile builds.

---

### 4.6 Outbox Pattern Limited to Single Instance

- **Severity:** Medium
- **Confidence:** Confirmed
- **Affected area:** `apps/api/src/outbox/`

**Description:** The outbox consumer uses in-process polling (1s interval, max 5 concurrent jobs) with MongoDB-based locking. Lock duration is 10 minutes with stale lock recovery. This works correctly for a single instance but does not support horizontal scaling — multiple instances would contend on the same outbox entries.

**Why it matters:** If the API is scaled horizontally, duplicate processing of outbox entries is possible. If the single instance crashes mid-processing, messages are delayed by up to 10 minutes (lock expiry).

**Recommended fix:** For production, consider a distributed queue (SQS, BullMQ with Redis) or add MongoDB-based leader election for the outbox consumer.

---

### 4.7 No Optimistic Locking for Concurrent Edits

- **Severity:** Medium
- **Confidence:** Likely risk
- **Affected area:** `apps/api/src/artefacts/`, `apps/api/src/version-history/`

**Description:** Artefact editing uses a snapshot-before-edit pattern for version history, but no optimistic locking (version number or ETag) is visible. Concurrent edits to the same artefact could result in lost updates.

**Why it matters:** The version history mechanism snapshots the current state before editing, but two concurrent edits would both snapshot the same state and the second write would silently overwrite the first.

**Recommended fix:** Add a `version` field to artefacts and check it in update queries (`findOneAndUpdate` with version match).

---

## 5. Low-Risk Findings

### 5.1 Email Addresses Logged in Auth Service

- **Severity:** Low
- **Confidence:** Confirmed
- **Affected area:** `apps/api/src/auth/auth.service.ts` (lines 61, 105)

**Description:** User email addresses are logged during account creation and guest-to-full account conversion.

**Why it matters:** Under GDPR and UK data protection regulations, email addresses are personal data. Logging them creates compliance obligations around log retention and access controls.

**Recommended fix:** Log a user ID or anonymized identifier instead of the email.

---

### 5.2 7-Day JWT Expiry Window

- **Severity:** Low
- **Confidence:** Confirmed
- **Affected area:** `apps/api/src/config/app.config.ts` (line 28)

**Description:** JWT tokens have a 7-day default expiry (`JWT_EXPIRES_IN=7d`). Token version-based revocation exists (incrementing `tokenVersion` invalidates all tokens for a user), and a `TokenRefreshInterceptor` issues fresh tokens on each response.

**Why it matters:** A stolen token remains valid for up to 7 days. The version-based revocation mitigates this for account-level revocation but cannot invalidate a single compromised token.

**Recommended fix:** Consider shorter access tokens (15-30 min) with a refresh token flow, or accept the current trade-off given the token version revocation mechanism.

---

### 5.3 `media.repository.updateStatus` Lacks userId Filter

- **Severity:** Low
- **Confidence:** Confirmed (mitigated)
- **Affected area:** `apps/api/src/media/media.repository.ts` (line 89)

**Description:** The `updateStatus` method updates media by `xid` without a `userId` filter. However, this is called only after ownership is verified in `media.service.ts` (line 114-115) within a transaction.

**Why it matters:** Defense-in-depth — if the calling code changes, the repository would not catch unauthorized access.

**Recommended fix:** Add `userId` to the `updateStatus` query filter as a defense-in-depth measure. Same applies to `pdpGoalsRepository.saveGoal` (line 232).

---

### 5.4 `@Roles()` Decorator Never Used

- **Severity:** Low
- **Confidence:** Confirmed
- **Affected area:** `apps/api/src/common/guards/roles.guard.ts`

**Description:** The `RolesGuard` is registered globally, but the `@Roles()` decorator is not applied to any route. All authenticated users have equal access to all endpoints.

**Why it matters:** The `UserRole` enum includes `USER_GUEST` and presumably other roles, but no route restricts access based on role. Guest users may access functionality intended for full users.

**Recommended fix:** Audit which endpoints should be restricted from guest users and apply `@Roles()` decorators accordingly.

---

## 6. Production-Readiness Gaps

| Gap | Status | Impact |
|-----|--------|--------|
| **OTP email delivery** | Not implemented | **Blocker** — authentication non-functional in production |
| **Secrets in VCS** | Committed `.env` | **Blocker** — must rotate and remove before any deployment |
| **Health checks** | Missing | **Blocker** — no way to monitor service health |
| **Deployment config** | Missing entirely | **Blocker** — no reproducible deployment path |
| **CI/CD pipeline** | Missing | **Blocker** — no automated test/lint gate |
| **Security headers** | Missing (no Helmet) | High gap |
| **CORS restriction** | Allows all origins | High gap |
| **Rate limiting** | OTP only | High gap |
| **Error tracking** | None (backend or mobile) | High gap |
| **Mobile crash reporting** | None | Medium gap |
| **APM / metrics** | None | Medium gap |
| **Test coverage** | ~50% of modules covered | Medium gap |
| **Database connection pooling** | Default Mongoose settings | Low gap |
| **Log aggregation** | Stdout only | Medium gap |

---

## 7. Recommended Next Steps

### Immediate (before any deployment)

1. **Rotate all exposed credentials** — MongoDB, OpenAI, AssemblyAI, S3, JWT secret. Remove `.env` from git tracking and scrub history.
2. **Implement OTP email delivery** — integrate a transactional email service; remove dev OTP from API responses in production.
3. **Add health check endpoint** — use `@nestjs/terminus` with MongoDB and S3 checks.
4. **Add Helmet** — `app.use(helmet())` in `main.ts` for security headers.
5. **Restrict CORS origins** — replace `origin: true` with explicit domain list.

### Short-term (before production launch)

6. **Add general rate limiting** — `@nestjs/throttler` globally, with per-route overrides for expensive endpoints.
7. **Create Dockerfile and CI pipeline** — automated builds, tests, linting, and deployments.
8. **Integrate Sentry** — error tracking for both NestJS backend and React Native mobile.
9. **Apply `@Roles()` decorators** — restrict guest users from full-user endpoints.
10. **Add tests for untested modules** — prioritize `storage`, `llm`, `media`, and `items`.

### Medium-term (production hardening)

11. **Implement certificate pinning** on mobile for production API endpoints.
12. **Move web JWT to httpOnly cookies** or add strict CSP.
13. **Add optimistic locking** for artefact edits.
14. **Evaluate distributed queue** replacement for the outbox pattern.
15. **Add APM and metrics** — latency percentiles, error rates, queue depth for outbox.
16. **Stop logging email addresses** — use anonymized identifiers in logs.
