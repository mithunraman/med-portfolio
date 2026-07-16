# Final Pre-Launch Checklist — Mobile (Logit)

**Merged from:**
- `mobile-ux-review-transcript-1.md` (MOB-001…MOB-077)
- `mobile-ux-review-transcript-2.md` (MOB-078…MOB-103)
- `mobile-ux-review-transcript-3.md` (MOB-104…MOB-142)

**Product:** Logit — voice/text → structured portfolio entries for UK GP training.
**Compiled:** 2026-07-13. Every item keeps its original `MOB-###` ID for traceability back to the source review.

## How to read this

This is a de-duplicated, action-oriented roll-up of all 142 findings across the three UX/product reviews. Items that appeared in more than one session are merged into a single line (originating IDs listed together — see also §7).

**Status tags** used per line:
- **[DECISION]** — explicitly confirmed in a session; build as agreed.
- **[FIX]** — proposed improvement / small defect to address before launch.
- **[BUG]** — reproduced or acknowledged defect.
- **[LEGAL]** — privacy / consent / compliance gate.
- **[OPEN]** — genuinely unresolved; needs a decision before it can be built.
- **[KEEP]** — validated as good; do not change.
- **[DEFERRED]** — explicitly parked for v2 / post-launch by the participants. Listed in §6 so nothing is lost, **not** a launch blocker.
- **[WON'T DO]** — deliberately decided against; kept for traceability so the reversal is on record. Distinct from [DEFERRED] (which is "later, not now").

> Nothing here invents priority, effort, or impact — where a session didn't state it, it isn't stated here either. "Before launch" reflects the framing of the source task, not an inferred urgency ranking.

---

## 1. Confirmed decisions to implement

These were explicitly agreed in-session. Build them as specified.

- [x] **MOB-002** [WON'T DO] ~~Mirror the device light/dark theme (OS preference).~~ Decided against 2026-07-13 — keep the manual in-app Dark Mode toggle instead. *(colour-token work MOB-071 still stands on its own.)*
- [ ] **MOB-005** [DECISION] Remove the duplicate "Skip" on intro step 3.
- [ ] **MOB-011** [DECISION] Keep guest mode for the first 100–1,000 users; document the removal trigger.
- [ ] **MOB-023** [DECISION] "Portfolio" is banned as the home-screen name. *(replacement term still OPEN — see §5)*
- [ ] **MOB-034** [DECISION] Remove the pause button (at least for first messages).
- [ ] **MOB-037** [DECISION] Use "Continue chat" instead of "analysis" wording. *(depends on finished-detection MOB-038)*
- [ ] **MOB-039** [DECISION] Move entry-type selection to the start of the chat (type-first; don't auto-select).
- [ ] **MOB-066** [DECISION] Section titles (Description / Reflection / Learning needs) are non-editable (fixed FourteenFish names).
- [ ] **MOB-070** [DECISION] Move the accordion expander to the left per NHS design system (checkbox left, expander under the text).
- [ ] **MOB-078** [DECISION] Remove the confusing slider/checkbox for adding a PDP goal; replace with one clear add control.
- [ ] **MOB-079** [DECISION] Remove "Quick Pick" review-date shortcuts; keep a discoverable custom date picker.
- [ ] **MOB-086** [DECISION] Provide two persisting save actions — "Save for Later" + "Complete Entry / Mark as Done" — both writing to profile. *(labels OPEN — MOB-088)*
- [ ] **MOB-087** [DECISION] Remove the edit-lock after completion; entries stay editable, completion is only a filter.
- [ ] **MOB-089** [DECISION] Status mapping: Save for Later → "Needs review"; Mark as Done → "Completed".
- [ ] **MOB-092 / MOB-111** [DECISION] After Save for Later / Mark as Done — and after completing a PDP goal — auto-return to the homepage/dashboard.
- [x] **MOB-094** [DONE] Done 2026-07-13 — removed the date row from the home header (`(tabs)/index.tsx`), along with the now-unused `formatDate()` helper and `dateText` style. Date is retained on the individual entry view per MOB-095. *(Also hid the persistent "Start New Entry" capture card in the first-run/welcome state so new users get a single CTA via the WelcomeModule.)*
- [ ] **MOB-095** [DECISION] Keep the date visible on the individual entry/record view.
- [ ] **MOB-106** [DECISION] Rename PDP-goal status "Started" → "In progress"; unify status vocabulary across entry ↔ PDP goal.
- [ ] **MOB-107** [DECISION] Split a PDP goal into a short (AI-generated) title + a description.
- [ ] **MOB-110** [DECISION] Integrate voice input into every entry/text field (reflection included). *(account for usage/cost — MOB-114/115)*
- [ ] **MOB-114** [DECISION] Stop showing "AI credits"; express usage as entries ("X of 10 entries created"); keep credits internal.
- [ ] **MOB-115** [DECISION] Simplify limits to hard entry caps (guest 5, user 10, pay for the 11th); drop session limits and the weekly-credit model; weekly limits only on the paid tier. *(exact numbers OPEN)*
- [ ] **MOB-121** [DECISION] Add a resend-code time expectation to the OTP "Didn't receive a code?" state; consider a resend throttle.

---

## 2. Bugs to fix

- [ ] **MOB-069** [BUG] Pen (edit) and arrow (expand) icons on review/accordion rows are too close — mis-tap risk. Fix spacing.
- [ ] **MOB-096** [BUG] A saved / "In Progress" entry does not reflect correctly in the Entries list. Reproduce, diagnose, fix, add a regression check.
- [ ] **MOB-135** [BUG / DEFERRED] Large device text sizes (Accessibility → Display) break the layout. Engineer deferred to "the next release," UX pushed back ("You need to"). *Treat as a launch-quality call: at minimum audit and prevent hard breakage.*

**Stated constraint (not a fix, informs design):**
- **Recording loss on crash** — a long single recording is lost if the app crashes mid-record; this motivates the recording-limit design (see MOB-032). Open question: can recordings be incrementally persisted? (Engineering.)

---

## 3. Legal / privacy / compliance gates

Clear these (with legal input) before launch.

- [x] **MOB-014** [DONE] Done 2026-07-13 — added an explicit unticked "I have read and agree to the Privacy Policy and Terms of Service" checkbox (`accept_privacy_terms`, required) and removed the redundant "By tapping Continue you agree…" tap-through disclaimer (avoids double-consent). *(Residual: legal to confirm the final Art 6 + Art 9 mapping; research confirmed the checkbox pattern is compliant.)*
- [x] **MOB-016** [DONE] Done 2026-07-13 — "I am a UK doctor in training" attestation checkbox (`role_uk_trainee`, required) present in the active notice document.
- [x] **MOB-017** [DONE] Done 2026-07-13 — reworded to the friendlier "I'll keep patients unidentifiable in what I record." *(Deferred sub-item: optional record-time reminder belongs on the recording screen, not here. Residual: legal to confirm whether this consent is strictly required.)*
- [x] **MOB-012** [DONE] Done 2026-07-13 — consent is gated by `GET /init` (`needs: true` only until the active notice version is acked) and blocks continuing until all required boxes are ticked; shown on first run (and on version bumps) only.
- [ ] **MOB-100** [FIX/LEGAL] Ensure **Delete** genuinely removes data (PII entered by mistake must be truly deletable, not just archived). *(labels/placement also under §4.)*

---

## 4. Pre-launch UX / UI / content fixes (by area)

### Onboarding — intro / welcome
- [ ] **MOB-001** [FIX] Remove the stray desktop-only button; make the start CTA unambiguous ("Just Talk" was mistaken for the CTA).
- [x] **MOB-003a** [DONE] Add a first-run welcome message — done 2026-07-13 (👋 welcome slide as slide 1 of the intro carousel).
- [x] **MOB-003b** [WON'T DO] ~~Persist run-once so the intro doesn't repeat every launch.~~ Decided against 2026-07-13 — the carousel may re-show on launch; no `hasSeenIntro` flag / navigation gating will be built.
- [ ] **MOB-004** [FIX] Rewrite the 3-step carousel copy (replace "We'll do the paperwork" with "We'll ask you some questions", etc.).
- [ ] **MOB-006** [FIX] Reword "Your portfolio simplified" → "Building your portfolio, simplified" (it's the *process* that's simplified).

### Onboarding — training year & step fatigue
- [x] **MOB-020** [DONE] Verified 2026-07-13 — GP stages are already GP-specific (`ST1/ST2/ST3` → "GP Specialty Training Year 1/2/3" in `apps/api/src/specialties/gp/gp.training-stages.ts`); inactive IM/Psychiatry configs kept as the generic templates for later specialties. No code change needed.
- [x] **MOB-021** [DONE] Done 2026-07-13 — removed the `StepIndicator` from `select-stage` and `select-specialty` (onboarding is now a single question, so the progress bar manufactured "step fatigue"). Component kept for a future real multi-step wizard.
- [x] **MOB-022** [DONE] Done 2026-07-13 — onboarding auto-selects GP and opens on the training-year question. Gate redirect repointed `select-specialty` → `select-stage` (`decide-onboarding-route.ts`, single-line reversal marked in a comment); `select-stage` defaults to GP, self-fetches specialties, and hides the back button when reached without a specialty param. The `select-specialty` route/`SpecialtyList` stay intact (dormant) for settings + future multi-specialty; the back button auto-restores when a specialty param is passed again. Hardening (code review P1): `select-stage` now owns the only `fetchSpecialties` dispatch on the GP path, so it models an explicit `loading/error/ready` state and surfaces fetch failures via `ErrorBanner` + Retry (no unrecoverable spinner); warm-path condition-abort guarded.

### Registration / login / guest mode
- [ ] **MOB-007** [FIX] Rename "Try the app" → "Continue as guest".
- [ ] **MOB-008** [FIX] Make login a proper sign-in screen: "Sign in to save your progress" primary, "Continue as guest" secondary (note it won't save; state it's free).
- [ ] **MOB-009** [FIX] Persistent guest data-loss banner + inline Sign-in CTA.
- [ ] **MOB-013** [FIX] Create a content guide / key-message doc so app copy matches the website's one-sentence description (credibility). *(Cross-functional.)*
- [ ] **MOB-119** [FIX] Replace "Verify your email to save it" → "Enter your email to save your entries in progress".
- [ ] **MOB-113** [FIX] Reword guest-session messaging in user language: "You're currently in a temporary session. Create an account to keep your cases and track your progress"; specify "your reflections, cases and goals aren't being saved".
- [ ] **MOB-116** [FIX] On the upgrade page, lead with the concrete benefit — more entries ("10 entries a week vs 5").
- [ ] **MOB-015** [FIX] Add a policy/ToS TL;DR summary — on the **website** privacy page, not in-app. *(nice-to-have)*
- [x] **MOB-018** [WON'T DO] ~~Remove the flashing text on the consent screen.~~ Decided against 2026-07-13 — the data-driven consent screen has no flashing/animated text in the current implementation (the flashing was on the old pre-rewrite screen); nothing to remove.
- [x] **MOB-019** [DONE] Done 2026-07-13 — bumped the consent disclaimer from 12px → 13px (lineHeight 18 → 20); the rest of the screen's type hierarchy (28 title / 16 body & links / 15 checkbox) was already coherent.

### Home / dashboard
- [x] **MOB-024** [WON'T DO] ~~Different home message for guest (action-first "Start your first…") vs logged-in (possessive welcome).~~ Decided against 2026-07-13 — the header instead reads "Home" for guests and "Welcome" for logged-in users (`(tabs)/index.tsx`); no separate action-first vs possessive copy.
- [x] **MOB-025 / MOB-103** [DONE] Done 2026-07-16 — returning-user dashboard CTA (`StartNewEntryCard`) is now a fixed **"Talk about your case"** (was a rotating reflective question). Renamed all user-facing "entry/entries" → "case/cases" across the home screen (`(tabs)/index.tsx`): section headers "Recent cases", empty states, recency "Last case", "Untitled case", ARCP/combined empty copy, and matching a11y labels. First-run `WelcomeModule` CTA kept as "Record your first case" (product choice). Copy-only — selectors/props/routes/DTOs untouched.
- [x] **MOB-026** [DONE] Done 2026-07-16 — fixed primary CTA ("Talk about your case") with a **rotating helper sub-line** re-randomised on focus (`HELPERS` in `(tabs)/index.tsx`), now **expanded to 12 sub-prompts** (in the 10–15 target) grouped by angle: ease / value / time-saving / mode / gentle nudges. All mode-neutral (no "mic" — kept off this surface per MOB-124), no FourteenFish jargon; de-duplicated the old "we handle the…" repetition. Copy is drafted and can still be tuned with UX.
- [x] **MOB-027** [DONE] Verified 2026-07-13 — already implemented in `WelcomeModule` (`setupLine`): a first-run GP user sees "You're set up for General Practice, GP Specialty Training Year 1." Renders only when specialty + stage are set (guaranteed post-MOB-022 onboarding). No code change needed; optional future copy trim of the verbose stage label.
- [ ] **MOB-093** [LATER] Deferred 2026-07-16 — will be done later. Personalise the dashboard with the user's name.
- [x] **MOB-124** [DONE] Done 2026-07-16 — dashboard primary CTA (`StartNewEntryCard`) now uses Ionicons **`chatbubbles`** (two-bubble conversation glyph) instead of `mic`, distinguishing it from the composer's record mic; icon `24→26` and accent circle `36→40` for more weight (`ctaIconCircle`, renamed from `micCircle`). Disabled/guest state keeps `lock-closed`. Also removed the "Last case …" recency line from the card (no longer needed) — dropped the `lastEntryDate` prop.
- [x] **MOB-125** [DONE] Done 2026-07-16 — replaced the horizontal "Recent cases" carousel with a **vertical list of the top 3** (`RECENT_LIMIT`) + gated **"See all"** (shown only when `total > 3`; count dropped per product). Rows are compact cards: single-line title + a meta line (compact coloured `StatusPill` + relative time) directly under it — symmetric for any title length, no snippet/type/chevron. Order stays pure recency; the pill carries status triage. Empty state reworded (no "mic"). Density chosen (3 rows) to coexist with PDP goals. Also unified the meta separator with the coverage card (shared round `statDot`). Follow-up (non-UI): AI title quality so near-duplicate titles don't collide under single-line truncation.
- [ ] **MOB-126** [LATER] Deferred 2026-07-16 — will be done later. Add icons/imagery to entry cards for scannability (AI-picked per type/ARCP area). *(differentiation risk: most entries are the same type)*

### Chat / voice input
- [x] **MOB-029** [DONE] Done 2026-07-13 — resolved by the MOB-031 composer work: the text field and the filled mic button now sit side by side as clear, distinct affordances, so both input modes are visually evident without extra "talk or type" copy.
- [x] **MOB-030** [WON'T DO] ~~Remove the mic icon from the record button; relabel "Record your case".~~ Decided against 2026-07-13 — the mic icon is retained as the filled accent primary action introduced in MOB-031 (a recognisable voice affordance beside the text field); no text label added to the button.
- [x] **MOB-031** [DONE] Done 2026-07-13 — in `ChatComposer.tsx`, made the mic a filled accent circle with a white glyph (matching the send button) so the composer has one clear coloured primary action at rest that morphs to send when typing. Also shrank the placeholder to a 13px custom overlay (typed text stays 16px) and tightened the copy to "Describe your case".
- [x] **MOB-033** [DONE] Done 2026-07-14 — retired the disappearing `ChatEmptyState` and replaced it with four client-only assistant bubbles (`IntroBubbles.tsx`) pinned to the top of every thread via the inverted list's `ListFooterComponent`, so the guidance (what to talk about, "send as many messages as you need" by voice/text, when analysis unlocks, and the PII warning) persists instead of vanishing on the first message. The PII bubble uses a distinct warning treatment (error-tinted + shield icon). Bubbles are purely presentational — never persisted, sent to the backend, or counted in grouping/analysis/edit-lock.
- [x] **MOB-035** [DONE] Done 2026-07-14 — in `BubbleShell.tsx`, moved the double-tick threshold earlier: a message shows a grey double tick as soon as the server has it (processing states `PENDING`…`DEIDENTIFYING`) and a blue double tick once AI-processed (`COMPLETE`). Clock (uploading) and error/rejected icons unchanged. Removes the single tick that read as "not delivered".
- [x] **MOB-036** [WON'T DO] ~~Label transcribed voice text "Transcription" (voice messages only).~~ Decided against 2026-07-14 — the transcript already sits above the audio player pill in the bubble, which makes its voice provenance clear enough; no separate "Transcription" label added.
- [x] **MOB-056** [N/A] Not applicable — decided 2026-07-14.

### Entry-type classification & confidence
- [x] **MOB-040** [WON'T DO] Decided 2026-07-15 — not doing.
- [x] **MOB-041** [DONE] Done 2026-07-15 — reworked the reasoning disclosure in the shared `SingleSelect` (classification) and `MultiSelect` (capabilities): the bare chevron/`%` chip became an **accent, underlined "Why?" link + chevron** (clear "tappable" signifier), enlarged to a 44pt touch target via `hitSlop`. Also: confidence `%` badge dropped entirely (uninformative — every value was ~90%; also satisfies the MOB-040 direction), selection tap confined to the radio/checkbox + label, and pressed-state + `accessibilityRole="button"`/`expanded` added. **"Keep first item expanded" was deliberately reversed** → all rows collapsed by default (product decision, 2026-07-15). Separately fixed a free-text follow-up bug found in review: the question text clipped mid-sentence (overflowed the bubble) — resolved with `flexShrink: 1` on `promptText` in `FreeTextPrompts`.
- [x] **MOB-042** [WON'T DO] Decided 2026-07-15 — not doing.

### Loading / progress feedback
- [x] **MOB-044** [DONE] Done 2026-07-14 — removed the pipeline-leaking step-label "reason" line entirely (`ActionBar` status mode + `reason` type field + `THINKING_STEP_LABELS`/`thinkingStepLabel`), leaving a single generic rotating word. Expanded `THINKING_WORDS` to a 15-word interchangeable, entry-focused, non-clinical set. Loading feedback is now generic and exposes nothing about the analysis pipeline.

### Follow-up questions & copy
- [ ] **MOB-045** [KEEP] One follow-up question at a time — validated as good; retain.
- [x] **MOB-046** [DONE] Done 2026-07-14 — no exact count is shown anywhere: one-question-per-round (MOB-045) plus the count-free tiered follow-up copy (MOB-047) removed the old "a few more questions" count claim. No "X of Y" display exists in the question UI.
- [x] **MOB-047** [DONE] Done 2026-07-14 — replaced the random two-bucket follow-up copy with a readiness-tiered system (`apps/api/src/portfolio-graph/followup-copy.ts`): 4 tone tiers driven by `readinessScore` + an honest terminal signal, monotonic (never regresses), no back-to-back repeats, and "final" only on the genuinely-last round. Old `FOLLOWUP_PROMPTS` removed; 8 new unit tests. Copy wording still to be finalised with UX — see MOB-047a.
- [ ] **MOB-047a** [TODO/COPY] Revisit, evaluate and finalise the follow-up intro copy after seeing it on real journeys. The readiness-tiered mechanism is built (`apps/api/src/portfolio-graph/followup-copy.ts`), but the four `FOLLOWUP_LINES` banks are **placeholder wording pending UX sign-off**. Also tune the two knobs against real runs: the readiness band cut-points (`3.0` / `5.5`) and the tier-4 terminal signal (`askedRound >= maxFollowupRounds`).
- [x] **MOB-076** [DONE] Done 2026-07-14 — dropped the filler "Thanks" openers from the user-facing acknowledgement copy: the follow-up intro lines + default (`followup-copy.ts`) and the clarification retry prompt (`portfolio-graph.service.ts`) now lead straight with the purpose.

### Question typography & examples
- [x] **MOB-048** [DONE] Done 2026-07-14 — question promoted to the H1 (16px/600, `accessibilityRole="header"`) in `FreeTextPrompts`; the free-text lead-in demoted (14px, AA-safe `BUBBLE_MUTED_TEXT`) in `QuestionContent`; lone "1." numbering dropped for single-prompt rounds; lead-in↔question gap tightened. The section-eyebrow tier was built then **hidden for MVP** — see MOB-048a.
- [ ] **MOB-048a** [TODO/POST-MVP] Restore the section eyebrow (clinical section as an overline above the question — the third NHS tier). Built in MOB-048 then removed for MVP (recover from git); when ready, wire a `sectionId → label` source (client-side prettify of `key`, or a backend label).
- [x] **MOB-049** [DONE] Done 2026-07-14 — confirmed the hint failed WCAG AA on 4 of 7 themes (theme `textSecondary` on the fixed bubble bg). Fixed with a fixed, AA-compliant `BUBBLE_MUTED_TEXT` token (`#5c5c5c` / `#a9b0b5`, ≥6:1 on the bubble), applied to all hint text in `HintCard`.
- [x] **MOB-050** [DONE] Done 2026-07-14 — removed `fontStyle: 'italic'` from both the always-visible example and the expanded examples in `HintCard.tsx`.
- [x] **MOB-051** [DONE] Done 2026-07-14 — visible example labelled "Example answer"; further examples behind a "See more examples" / "Hide examples" accordion; examples bulleted. Note: per product decision the toggle is styled as an **underlined text link** (background/chevron removed) — a deliberate reversal of the original "looks like a hyperlink" concern.
- [ ] **MOB-052** [FIX/ANALYTICS] Track "More examples" clicks (high reliance may signal poorly framed questions). *(needs analytics tooling)*
- [ ] **MOB-053** [LATER] Deferred 2026-07-15 — will be done later. Gate examples to the first ~5 entries (by entry count, not training year). Needs the user's entry count plumbed to the client so `HintCard` can hide examples past entry ~5.

### Capability tagging
- [ ] **MOB-058** [FIX] Group confidence + reasoning under "Why I suggested this" (below, left-aligned, first expanded) — here confidence *is* important.
- [x] **MOB-059** [WON'T DO] Decided 2026-07-15 — not doing. The in-conversation capability-verification card (the actual target) isn't built yet, so there are no controls to re-align; and on the one surface that does render capabilities (artefact detail, shared `EditableReflectionSection`), the `space-between` header keeps the edit/expand controls right-aligned by design. Left-alignment will be handled natively when/if the verification card is built (059 folded into that build), not as a standalone patch.
- [ ] **MOB-061** [DEFERRED] Deferred 2026-07-15 — belongs to the in-conversation capability-verification card, which isn't built yet. Fix the touch targets (≥44pt/48dp, `minHeight` + adequate `hitSlop`, ≥8pt gap between adjacent controls) as part of that card's build, not as a standalone patch to the shared `EditableReflectionSection` on the entry-detail screen.
- **MOB-077** [RISK] Capability-mapping hallucination is ~1/10 and can't be fully eliminated — track error rate; rely on user verification (constraint, not a fix).

### Entry review screen
- [x] **MOB-062** [WON'T DO] Decided 2026-07-16 — not doing. The answered select-card summary already collapses to the chosen option(s); the imperative-heading/disabled-control nuance isn't worth the shell + both-cards churn pre-launch.
- [ ] **MOB-063** [FIX] Vary the completion message (currently "All done" every time). *(minor)*
- [ ] **MOB-064** [FIX] Separate "Needs review" (an action → top) from "Clinical case review" (type/metadata tag).
- [ ] **MOB-065** [FIX] Expand "Needs review" into a guidance info box ("Your draft is ready. Please check it manually").
- [ ] **MOB-067** [FIX] Disable emoji input in entries (serious cases).
- [ ] **MOB-068** [FIX/VERIFY] Verify bullets/formatting paste cleanly into FourteenFish.
- [ ] **MOB-071** [FIX] Fix dark/light colour mapping (green reads "Batman-villain" in dark mode); define semantic colour tokens for both modes.

### Editing, saving & completion status
- [ ] **MOB-083** [FIX] Add a discard-changes safety confirmation on the X/close control ("keep editing / discard").
- [ ] **MOB-084** [FIX] Clarify Version History (one-line description/tooltip explaining revert).
- [ ] **MOB-085** [FIX] Simplify the two-level "edit-saved vs completed" status model (drives MOB-086/087/088/089); user-test the mental model.
- [ ] **MOB-098** [FIX] Don't silently disable "Mark as Done" — surface why (validate on tap or add helper text).
- [ ] **MOB-097** [FIX/A11Y] Missing-review-date error: MVP NHS-style pattern — red highlight + message ("You must enter a review date to continue") + scroll to field. *(empty section = warning, not error; full NHS error summary deferred)*

### PDP goals (this-version fixes)
- [ ] **MOB-073** [FIX] Reframe the current PDP screen: "Goal 1/2" structure; present the goal then "Do you want to add this goal? Yes/No"; allow a review date; remove the on/off toggle; frame "PDP goals based on this case".
- [ ] **MOB-080** [FIX] Add a tick/"Confirm" affordance when a date is set.
- [ ] **MOB-081** [FIX] Consolidate the duplicate "Add" buttons for goal actions/notes into one control, positioned below the list.
- [ ] **MOB-082** [FIX] Simplify note-deletion copy ("This note will be removed"). *(low priority)*
- [ ] **MOB-104** [FIX] Make the disabled "Complete goal" button unmistakably read as disabled (not secondary).
- [ ] **MOB-105 / MOB-133** [FIX] Build one reusable "Change dates / extend" control shared by PDP goals and review periods (users usually push deadlines back).
- [ ] **MOB-108** [FIX] Give PDP-goal reflection its own screen (currently squeezed inline; feels skippable).
- [ ] **MOB-109** [FIX] Add celebratory framing before reflection ("Amazing, well done. Now let's start your reflection"); keep skippable.
- [ ] **MOB-075** [FIX/VERIFY] Confirm PDP goals also upload/export to FourteenFish.

### Entries list & export
- [ ] **MOB-099** [FIX/VERIFY] Confirm portfolio copy/export as text or PDF (entry points + formats).
- [ ] **MOB-100** [FIX] Clarify Archive vs Delete (labels, help text, placement). *(Delete-must-truly-remove is a §3 gate.)*
- [ ] **MOB-101** [FIX] Show created/updated timestamps on entry rows ("Updated 1 minute ago", "Created 12/7").

### Profile / account creation
- [ ] **MOB-118** [FIX] Settings surface: use off-white/off-grey even in light mode (currently "really hard to read"). *(settings are dummy screens for now)*
- [ ] **MOB-120** [FIX/OPEN] Split name and OTP onto separate screens (name first). *(reuse-vs-split for returning users is OPEN — see §5)*
- [ ] **MOB-122** [FIX] Interim profile avatar: drop the initial "M" circle (show full name left-aligned) or offer selectable avatars.

### Review-period (ARCP capability-coverage) tracker
- [ ] **MOB-123** [FIX/BUILD] Build/complete the ARCP capability-coverage tracker on the homepage (% covered).
- [ ] **MOB-128** [FIX] Make capability tiles clickable — show meaning + linked entries. *(needs entry↔capability linking, MOB-134)*
- [ ] **MOB-129** [FIX] Celebratory animation at 100% coverage.
- [ ] **MOB-132** [FIX] Explain what a review period is; rewrite the setup copy ("See what capabilities your entries cover" reads as "very weird").
- [ ] **MOB-133** [FIX] Review-period management: "Change dates" + a clearer "I'm done with this period / start next review period" CTA, both at the bottom. *(shares control with MOB-105)*
- [ ] **MOB-134** [FIX] Link each entry to its review period; add a period drop-down to filter entries by current/past period.

---

## 5. Open questions to resolve

Each blocks a clean build decision; resolve before or at launch.

- **MOB-023** [OPEN] Final home-screen name (not "portfolio"; "dashboard" lukewarm, "diary" rejected). — Product/UX
- **MOB-028** [OPEN] Reconcile the expected centred-mic start vs the chat layout (usability test). — Mobile UX
- **MOB-032** [OPEN] Keep or remove the visible 3-minute recording countdown given the crash-safety rationale? — Mobile UX / Engineering
- **MOB-038** [OPEN] How to detect "finished" vs "still adding" (one-shot voice vs typed bursts): single "Continue chat" vs dual "Send and continue / Send and finish". Most-emphasised unresolved item. — Product/Engineering
- **MOB-060** [OPEN] Cap capabilities at 3, or allow many and decide in FourteenFish? — Product
- **MOB-088** [OPEN] Final labels for the two save actions ("Save for Later / Finished for now / Mark as Done / Complete Entry"). — UX/Content
- **MOB-091** [OPEN] Merge the second confirmation screen into the review/edit screen, or keep two? — UX
- **MOB-102** [OPEN] Make the linked case tappable from a PDP goal — interaction pattern (tap vs slider). — UX
- **MOB-120** [OPEN] Split name and OTP screens vs the single reused component for returning users. — UX/Engineering
- **MOB-125** [OPEN] Recent-entries-vs-PDP-goals hierarchy on the homepage (how many entries; what gets pushed down). — UX
- **MOB-127** [OPEN] Define the "PDP goals due soon" window (under a month?). — UX/Product
- **MOB-131** [OPEN] Does the "Coverage by domain" section add value, or remove it? — UX
- **MOB-141** [OPEN/RESEARCH] Define brand tone of voice (authoritarian vs mentor vs buddy) — informs colours/brand. — UX/Research
- **MOB-142** [OPEN] Review-period dates: user-selected vs auto-populated from a fixed training calendar (Aug/Feb; may vary by deanery — verify). — Product/Engineering

---

## 6. Deferred / post-launch (parked — not launch blockers)

Explicitly deferred by the participants. Kept here so they aren't lost.

- **MOB-010 / MOB-112** [DEFERRED] Guest → **existing**-account merge (guest→new-account transfer works; merging into a pre-existing account is unbuilt and harder). Define the fallback warning when a merge isn't possible. Data-loss risk.
- **MOB-043** [DEFERRED] AI suggests an alternative entry type (Doctor judged low value).
- **MOB-054** [DEFERRED/RESEARCH] Map early (first-14-day / first-5-entry) behaviour to validate example-reliance decay.
- **MOB-055** [DEFERRED] Tone/intonation analysis of voice.
- **MOB-057** [DEFERRED v2] Manually add a missing capability (user writes the justification).
- **MOB-072** [DEFERRED v2] PDP goals mis-modeled — redesign so goals are strategic across a 6-month period (generated from all entries after ~7–8/10), not per-case. *(Engineer conceded the design mistake; interim fixes in MOB-073.)*
- **MOB-074** [DEFERRED v2] Create-new vs link-to-existing PDP goal (AI: "5 entries relate to goal X — link this one?").
- **MOB-090** [DEFERRED] Dedicated "visibility of system status" design pass (post-MVP).
- **MOB-117** [DEFERRED] Multi-account gaming of free entry caps — monitor once traction grows; no action now.
- **MOB-130** [DEFERRED] Trust text confirming capabilities map to RCGP areas ("Okay, later").
- **MOB-136** [DEFERRED] Due-date notifications.
- **MOB-137** [DEFERRED] Opt-in motivational check-ins / "Help me stay on track" reminders (day/frequency selection).
- **MOB-138** [DEFERRED] Social-proof / peer-comparison nudges — opt-in only, careful tone (anxiety risk flagged).
- **MOB-139** [DEFERRED] Gamification module (points/stars) as an optional unlockable.
- **MOB-140** [DEFERRED] Communication/content calendar aligned to the UK training year & deanery. *(depends on MOB-142)*

---

## 7. Merged duplicates & cross-transcript links

For traceability, items combined above because they describe the same underlying work:

- **Auto-return after save/complete:** MOB-092 (entry) + MOB-111 (PDP goal).
- **Guest → existing-account merge:** MOB-010 (T1) + MOB-112 (T3).
- **"Change dates / extend" reusable control:** MOB-105 (PDP goal) + MOB-133 (review period).
- **"Record a Case" / case-based primary CTA:** MOB-025 (T1) + MOB-103 (T2); icon in MOB-124 (T3).
- **Status vocabulary (entry ↔ PDP):** MOB-089 (Needs review/Completed) + MOB-106 (Started→In progress).
- **Disabled-button clarity:** MOB-098 (Mark as Done) + MOB-104 (Complete goal styling).
- **Homepage decluttering / scannability:** MOB-093, MOB-094/095, MOB-124, MOB-125, MOB-126.
- **Colour/theme:** MOB-002 (OS mirroring) + MOB-071 (semantic tokens, dark-mode green).
- **Entry↔capability & entry↔period linking:** MOB-128 depends on MOB-134.

---

## 8. Platform note

No item in any of the three reviews was scoped to iOS or Android specifically — **all are `Platform not stated`**. Transcript 2 hinted at a desktop/web surface; transcript 3 showed on-device mobile signals (airplane mode, notification OTP, OS text-size setting). Confirm the target surface before routing any item to a single-platform engineering track.

---

*Compiled from the three `mobile-ux-review-transcript-*.md` analyses. 142 source findings; duplicates merged per §7. Confirmed decisions in §1, bugs in §2, legal gates in §3, fixes in §4, open questions in §5, deferred work in §6.*
