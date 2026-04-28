# Launch Audit — Needs Human Review

Items where the source doc is unclear about whether the work is done or whether it falls within launch scope. Each needs an explicit decision before launch.

| # | File | Item | Why ambiguous |
|---|---|---|---|
| A1 | [pre-launch-fixes.md](../pre-launch-fixes.md) | Medium #12 — "LLM hallucination" marked **RESOLVED** with mitigations (language_code hardcoding, isRelevant gate) | Doc says resolved, but [backend-failure-review.md](../../backend-failure-review.md) Risk #2 still lists semantic-correctness as open. Verify whether mitigations are sufficient or further work is owed. |
| A2 | [gtm-launch-plan.md](../../gtm-launch-plan.md) | Phase 1 #6 — "Resolve remaining production readiness items … toast/snackbar, skeletons, conversation refresh, haptic feedback" | Listed under closed-beta phase — unclear if these are launch-blocking or beta-only. |
| A3 | [structured-logging.md](../../production/structured-logging.md) | Phase 4 production serializers | Marked deferred. Is deferral acceptable for go-live, or is structured prod logging required for monitoring SLOs? |
| A4 | [training-stage-implementation.md](../../plans/training-stage-implementation.md) | All 4 phases | Plan implies multi-specialty support is needed; launch scope may only be GP. Confirm scope. |
| A5 | [auth/open-questions.md](../../review/auth/open-questions.md) | 14 questions tagged "mostly post-MVP" | "Mostly" leaves 1–3 items unspecified — needs explicit P1/post-MVP triage per item. |
| A6 | [feature-list.md](../../feature-list.md) | Missing features #5–#10 (search, metadata, notifications, templates) | Doc tags as "missing" without explicit launch/post-launch label. Confirm scope. |
| A7 | [CLAUDE.md](../../../CLAUDE.md) | "Existing services have drift on this rule (e.g. `new Types.ObjectId(userId)` sprinkled through `artefacts.service.ts`, `pdp-goals.service.ts`). Don't propagate that pattern into new code" | Drift is acknowledged but not scheduled for cleanup — confirm whether the drift is launch-acceptable. |
| A8 | [bugs.md](../../bugs.md) | All entries | File has no last-updated marker; some bugs may already be fixed. Verify each against current code before launch. |
