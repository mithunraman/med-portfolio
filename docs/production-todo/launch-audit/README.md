# Launch Audit — 2026-04-28

A scan of every project Markdown file for unresolved, pending, or launch-blocking work.

## Files in this folder

- [findings.md](findings.md) — full table of findings grouped by priority (Critical / High / Medium / Low)
- [needs-review.md](needs-review.md) — ambiguous items where the doc itself is unclear about whether the work is done or whether it is in launch scope

## Scope of scan

40 project Markdown files under [../../](../../). Excluded: `node_modules/`, `apps/mobile/ios/Pods/`, `.claude/skills/`, and `prompts/` (agent prompts, not product docs).

Totals: **17 Critical, 25 High, 13 Medium, 4 Low, 8 ambiguous.**

## Executive summary — top launch blockers

The repo is **not launch-ready**. The blockers cluster into four hard gates:

1. **No deployment infrastructure exists.** [../../production-readiness-review.md](../../production-readiness-review.md) and [../pre-launch-fixes.md](../pre-launch-fixes.md) flag this as the single largest blocker — no Dockerfile, no CI/CD, no provisioned server. The 5-phase plan in [../../production/linode-deployment-plan.md](../../production/linode-deployment-plan.md) has **6 unresolved open questions** before Phase 1 can begin (domain, container registry, MongoDB Atlas vs self-hosted, GitHub Actions runner, SSH access, Cloudflare).
2. **OTP email delivery is not implemented.** [../../security-assessment.md §2.2](../../security-assessment.md) — login is non-functional in production. Total blocker.
3. **GDPR / UK compliance is incomplete.** [../../../compliance-checklist.md](../../../compliance-checklist.md) and [../../gtm-launch-plan.md](../../gtm-launch-plan.md) show every DPA unsigned (Linode, AssemblyAI, OpenAI), no privacy policy hosted (the app shows a placeholder `Alert.alert`), no account-deletion endpoint, no consent flow at signup, no ROPA, no DPIA, no ICO registration, and `rawContent`/`cleanedContent` retain unredacted PII forever (no 7-day expiry cron). Special-category medical data is in scope — these are not optional.
4. **Concurrency / data-loss bugs in core write paths.** [../transaction-audit.md](../transaction-audit.md) flags HIGH-confidence silent data loss in `editArtefact` / `restoreVersion`, status-guard bypass in `finaliseArtefact`, and incomplete anonymization in `deleteArtefact`. [../../review/auth/simplification-findings.md](../../review/auth/simplification-findings.md) lists 9 P1 auth correctness/perf issues (per-request DB read in JwtStrategy, missing TTL/index on refresh tokens, REFRESH_REPLAY unresolved).

Second-tier risks: placeholder `support@example.com`; missing capability-coverage dashboard and FourteenFish export (flagged as core value gaps in [../../feature-list.md](../../feature-list.md)); CORS allows all origins with credentials; no optimistic locking on artefact edits; P0 finding that existing `version_policies` rows won't get `xid` backfilled ([../../review/notices-branch-code-review.md](../../review/notices-branch-code-review.md)).

Most post-MVP work (offline support, training-stage personalization, performance polish) is deferable. The four gates above must close.

## Recommended critical path

1. **Compliance sprint** (parallel): privacy policy, ToS, DPAs, ICO registration, DPIA, consent flow, data export, account deletion, 7-day PII expiry cron, S3 lifecycle.
2. **Deployment**: resolve linode-deployment-plan open questions → Dockerfile → CI/CD → provisioning → monitoring.
3. **Auth**: ship OTP email; land 9 P1 items from `auth/simplification-findings.md`; restrict CORS.
4. **Data correctness**: fix HIGH-confidence transaction-audit findings (`editArtefact`, `finaliseArtefact`, `deleteArtefact`); add optimistic locking; backfill `version_policies.xid`.
5. **Core feature gaps** (ship-or-defer decision): coverage dashboard, entry editing, export, readiness check.
6. **Mobile perf** — Priority 1+2 from [../mobile-performance-audit.md](../mobile-performance-audit.md).
