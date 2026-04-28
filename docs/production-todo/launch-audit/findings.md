# Launch Audit — Findings

All paths are relative to repo root. See [README.md](README.md) for executive summary and critical path.

## Critical (Launch-Blocking)

| # | File | Section | Excerpt | Why it matters | Next action |
|---|---|---|---|---|---|
| 1 | [compliance-checklist.md](../../../compliance-checklist.md) | §1 DPAs | "Linode DPA / AssemblyAI DPA / OpenAI DPA — Sign Data Processing Addendum" | UK GDPR Art. 28 mandates DPAs with all processors of medical data. | Execute and store all three signed DPAs. |
| 2 | [compliance-checklist.md](../../../compliance-checklist.md) | §2 UK GDPR | "Documented lawful basis / ROPA / Right of Access — Doctor can export all their data" | Article 30 ROPA and Article 15 export are non-optional. | Build `GET /api/users/me/export` and write ROPA. |
| 3 | [compliance-checklist.md](../../../compliance-checklist.md) | §3 Special Category Data | "Explicit consent obtained OR processing necessary / Health professional exemption documented" | DPA 2018 Sch. 1 requires explicit consent for medical data. | Add consent step at signup, persist consent record. |
| 4 | [compliance-checklist.md](../../../compliance-checklist.md) | §4 Storage Limitation | "S3 Lifecycle Policy configured for auto-deletion / Post-transcription deletion in code" | Audio files contain unredacted PII; indefinite storage breaches Art. 5(1)(e). | Configure S3 lifecycle + delete audio after transcription. |
| 5 | [compliance-checklist.md](../../../compliance-checklist.md) | §5 PII Redaction | "PII redaction enabled in AssemblyAI API calls / Regular spot-checks" | Redaction is the only safeguard against medical-data leakage into LLM prompts. | Verify flag is set; schedule weekly transcript audit. |
| 6 | [gtm-launch-plan.md](../../gtm-launch-plan.md) | Phase 0 / Risk #11 | "rawContent and cleanedContent fields store unredacted text permanently… Implement a scheduled cron job that nullifies… on messages older than 7 days" | Storage-limitation breach + ICO fine exposure. | Implement 7-day content expiry cron. |
| 7 | [gtm-launch-plan.md](../../gtm-launch-plan.md) | Phase 0 #3 | "Implement account deletion … must cascade: MongoDB documents, S3/R2 audio files, request deletion from sub-processors" | Article 17 right to erasure + App Store requirement. | Build `DELETE /api/users/me` with full cascade. |
| 8 | [gtm-launch-plan.md](../../gtm-launch-plan.md) | Phase 0 Blockers | "Privacy Policy is a placeholder alert … App Store / Play Store will reject" | Hard store-submission blocker. | Write, host, link in app. |
| 9 | [production-readiness-review.md](../../production-readiness-review.md) | Critical #3 | "No Dockerfile, Docker Compose, CI/CD pipeline, or server provisioning exists… Production deployment is impossible" | Cannot ship without infra. | Execute 5-phase Linode plan. |
| 10 | [production-readiness-review.md](../../production-readiness-review.md) | Critical #4 | `Alert.alert('Privacy Policy', 'Privacy policy will be available soon.')` | App Store + GDPR blocker. | Replace with WebView to hosted policy. |
| 11 | [pre-launch-fixes.md](../pre-launch-fixes.md) | Blockers #2, #3 | Privacy-policy placeholder + "No Dockerfile, docker-compose, Kubernetes, GitHub Actions" | Same two infra blockers. | Track to closure. |
| 12 | [linode-deployment-plan.md](../../production/linode-deployment-plan.md) | Open Questions | "Domain name, container registry, MongoDB Atlas, GitHub Actions, SSH access, Cloudflare setup" | Phase 1 cannot begin until resolved. | Decide each before kickoff. |
| 13 | [security-assessment.md](../../security-assessment.md) | §2.2 OTP | `if (development) return otp; /* TODO: send via email */` | Authentication broken in prod — total blocker. | Wire Resend/SendGrid + verify deliverability. |
| 14 | [transaction-audit.md](../transaction-audit.md) | HIGH Confidence | "ArtefactsService.editArtefact / restoreVersion silent data loss in version history; finaliseArtefact status guard bypass; deleteArtefact incomplete anonymization" | Concurrent writes silently corrupt portfolio data. | Move guard reads inside txn; add atomic conditional updates. |
| 15 | [auth/simplification-findings.md](../../review/auth/simplification-findings.md) | P1 (9 items) | "JwtStrategy removes per-request DB reads (C.1); TTL on expiresAt (C.2); index on previousHashes (C.3); cap listActiveByUser (C.4); REFRESH_REPLAY unresolved (B.5)…" | Hot-path correctness + perf in auth. | Land all 9 P1 fixes before users arrive. |
| 16 | [notices-branch-code-review.md](../../review/notices-branch-code-review.md) | [P0] | "Existing version_policies docs won't get xid backfilled… upsert lacks `$setOnInsert`" | Admin endpoints will 500 on existing rows. | Add `$setOnInsert: { xid }` before merge. |
| 17 | [product-strategy.md](../../product-strategy.md) | Risk #3 | "One incident of patient-identifiable data leaking through the AI pipeline could be catastrophic" | Existential trust/regulatory risk. | Add monitoring of redaction efficacy ≥99.5%. |

## High (Should Fix Before Launch)

| # | File | Section | Excerpt | Why it matters | Next action |
|---|---|---|---|---|---|
| 18 | [compliance-checklist.md](../../../compliance-checklist.md) | §10 Incident Response | "Incident response plan documented / ICO notification template prepared" | 72-hour breach notification clock; need template ready. | Draft IR plan + ICO template. |
| 19 | [production-readiness-review.md](../../production-readiness-review.md) | High #9 | "Contact `support@example.com` … Obviously a placeholder" | Users cannot reach support. | Provision real support inbox + replace string. |
| 20 | [pre-launch-fixes.md](../pre-launch-fixes.md) | High #11 | "computeContext() called on every poll with 3-5 DB queries… MongoDB bottleneck at scale" | Polling-driven query amplification kills DB under concurrency. | Add 2–5s TTL cache on `computeContext()`. |
| 21 | [security-assessment.md](../../security-assessment.md) | §3.1 CORS | "`origin: true, credentials: true` reflects any requesting origin" | CSRF prerequisite. | Restrict to allowed origins via env. |
| 22 | [security-assessment.md](../../security-assessment.md) | §4.7 | "No optimistic locking for concurrent edits … concurrent edits silently overwrite" | Lost edits = data loss. | Add `version` field + conditional update. |
| 23 | [backend-failure-review.md](../../backend-failure-review.md) | Risk #1 | "Processing fire-and-forget can silently fail … Message stuck in PENDING forever" | Stuck conversations have no recovery path. | Add stale-status sweeper (>5 min). |
| 24 | [backend-failure-review.md](../../backend-failure-review.md) | Risk #5 | "JWT tokens are long-lived with no revocation mechanism" | Disabled accounts retain access up to 7 days. | Check `user.lockedUntil` in JwtStrategy. |
| 25 | [backend-failure-review.md](../../backend-failure-review.md) | Recommended Tests | "11 test scenarios listed as recommended but not implemented" | Concurrency / crash paths untested. | Implement the 11 scenarios. |
| 26 | [transaction-audit.md](../transaction-audit.md) | MEDIUM | "TOCTOU in handleStart/handleResume, updateArtefactStatus, updateReviewPeriod, deleteMessage" | Concurrent requests race — double-starts, lost edits. | Wrap guard reads + writes in same txn. |
| 27 | [feature-list.md](../../feature-list.md) | Missing #1 | "What capabilities have I covered? What areas are weak?" | Without coverage dashboard, the app's central value (gap awareness pre-ARCP) is missing. | Build coverage view. |
| 28 | [feature-list.md](../../feature-list.md) | Missing #2 | "users need editorial control over portfolio evidence … the app risks feeling like a black box" | Trust failure in AI output. | Inline edit UI for entries. |
| 29 | [feature-list.md](../../feature-list.md) | Missing #3 | "A readiness layer could assess: missing context, weak reflection, shallow evidence" | Users have no signal of portfolio quality. | Add readiness score + checklist. |
| 30 | [feature-list.md](../../feature-list.md) | Missing #4 | "the doctor will eventually need to use the output in the real world … prevent users from doing duplicate work" | Without export, app adds friction not removes it. | FourteenFish-format export + clipboard. |
| 31 | [mobile-performance-audit.md](../mobile-performance-audit.md) | Priority 1 | "ChatComposer controlled TextInput causes lag; TypingIndicator JS-thread animation; BubbleShell setInterval per message; inline closures in renderItem defeating memo" | Visible jank on lower-end devices. | Land Priority 1 fixes. |
| 32 | [mobile-performance-audit.md](../mobile-performance-audit.md) | Priority 2 | "CoverageRing inline styles; EntryListItem not memoized; ActionBar setInterval; RecentEntriesModule missing getItemLayout" | Re-render storms during scroll. | Memo + getItemLayout. |
| 33 | [notices-branch-simplification.md](../../review/notices-branch-simplification.md) | A. Backend | "Missing repo interfaces (A1); error swallowing (A2); Mongoose shape leakage (A3); ObjectId in controller (A4); _id in responses (A5)" | Violates project rules (xid-only responses, no driver types in services). | Add repo interfaces + xid enforcement. |
| 34 | [notices-branch-simplification.md](../../review/notices-branch-simplification.md) | B. Backend perf | "in-memory audience filtering (B1); index mismatch (B2); double-round-trip dismiss (B4); uncached version policy (B5)" | Unbounded scans + extra round-trips. | Push filter into query; align indexes; cache. |
| 35 | [notices-branch-simplification.md](../../review/notices-branch-simplification.md) | E. Mobile Redux | "fetchInit reducer unconditionally overwriting (E2); hooks returning fresh objects (E3); raw AsyncStorage (E5)" | Re-render storms; bypasses logger-aware AppStorage. | Add equality guards + memoize selectors. |
| 36 | [notices-branch-code-review.md](../../review/notices-branch-code-review.md) | [P1] | "`new Types.ObjectId(userId)` throws BSONError if userId is not 24-char hex" | Malformed token → 500 error. | Validate input or wrap. |
| 37 | [todo.md](../../todo.md) | Chat | "Allow message retry on failure; analysis gets stuck in processing; min word count from backend" | UX friction + stuck states blocking core flow. | Add retry UI + backend min-words + stuck-state recovery. |
| 38 | [bugs.md](../../bugs.md) | UI | "After initial user sign up, and user creating an entry the entry is not visible in the home page" | First-impression bug for every new user. | Reproduce + fix home refresh. |
| 39 | [bugs.md](../../bugs.md) | UI | "When app is loading, and profile is being fetched, if server is down, app will show login screen" | Transient outages log users out. | Distinguish 401 from network error. |
| 40 | [production-readiness-review.md](../../production-readiness-review.md) | Medium #24 | "No tests for MongoDB queries (filters, operators, enum comparisons)… `refCollection: 'messages' vs numeric enum 100` passed tests but failed in production" | Silent data corruption from untested repo layer. | Add integration tests for repo critical paths. |
| 41 | [product-strategy.md](../../product-strategy.md) | Risk #2 | "Each entry involves transcription + multiple LLM calls … unit economics may not support a low price point" | If unit cost > price, business is unviable. | Model cost-per-entry pre-launch. |
| 42 | [mobile/normalize.md](../../mobile/normalize.md) | (whole) | "dashboard slice holds its own copy of PDP goal objects … violates the core Redux principle" | Causes staleness bugs (home doesn't see detail-screen edits). | Normalize: dashboard stores IDs only. |

## Medium

| # | File | Excerpt | Next action |
|---|---|---|---|
| 43 | [admin-checklist.md](../admin-checklist.md) | Full unchecked legal & app-store sub-lists | Track via single launch tracker. |
| 44 | [mobile-improvements.md](../mobile-improvements.md) | "Guest max 5 artefacts; user should change training year in profile; PDP completed UX; dashboard skeleton loaders" | Schedule. |
| 45 | [my-list.md](../my-list.md) | Same items as above + auth tests | De-dupe with admin-checklist. |
| 46 | [mobile-performance-audit.md](../mobile-performance-audit.md) | Priority 3 — "CircularButton/IconButton JS-thread animations; intervals when offscreen" | Migrate to Reanimated; visibility-guard intervals. |
| 47 | [auth/simplification-findings.md](../../review/auth/simplification-findings.md) | P2 (15+ items) — SecureStore consolidation, schema/index fixes, DTO type safety | Land in post-Critical sweep. |
| 48 | [auth/open-questions.md](../../review/auth/open-questions.md) | 14 unresolved auth edge-cases (clock skew, family revocation atomicity, JWT alg confusion, secret rotation, rate-limit tuning) | Triage to P1 vs deferred. |
| 49 | [training-stage-implementation.md](../../plans/training-stage-implementation.md) | "Mobile app should never hardcode specialty or stage lists" — Phases 1–4 unstarted | Defer to post-launch unless multi-specialty is launch scope. |
| 50 | [backend-failure-review.md](../../backend-failure-review.md) | Risk #2 — "OpenAI structured output returns schema-valid but semantically wrong data" | Log override rates; soft warnings on borderline confidence. |
| 51 | [backend-failure-review.md](../../backend-failure-review.md) | Risk #4 — "Polling load amplification under concurrent users" | Same fix as #20 above. |
| 52 | [notices-branch-simplification.md](../../review/notices-branch-simplification.md) | D. Mobile — "NoticeBanner / NoticeModal nearly identical; quota threshold duplicated" | Extract shared component. |
| 53 | [todo.md](../../todo.md) | "When API error returned during login, the user is signed out. Fix this later" | Handle login error without sign-out. |
| 54 | [todo.md](../../todo.md) | "When user clicks initial analysis with little/no case information, instruct user…" | Add min-content gate before analysis. |
| 55 | [bugs.md](../../bugs.md) | "Implement a claude like 'Thinking...' animation when the AI bot is thinking" | Add thinking indicator. |

## Low / Post-Launch

| # | File | Note |
|---|---|---|
| 56 | [mobile-offline.md](../../mobile-offline.md) | 5 phases of offline support — explicitly post-MVP. |
| 57 | [auth/simplification-findings.md](../../review/auth/simplification-findings.md) | P3 polish items — defer. |
| 58 | [production/structured-logging.md](../../production/structured-logging.md) | Phases 1–3 done; Phase 4 (prod serializers) deferred — verify deferral is intentional. |
| 59 | [compliance-checklist.md](../../../compliance-checklist.md) | §11–13 staff training, vendor reviews, record-keeping — important but not strictly day-1 blocking. |
