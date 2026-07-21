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
- [x] **MOB-005** [DECISION] Remove the duplicate "Skip" on intro step 3. *(DONE — `apps/mobile/app/(auth)/intro.tsx:138-144`: header "Skip" is hidden on the last slide (spacer); step 3's only bottom control is the "Let's Go" CTA. No duplicate Skip.)*
- [ ] **MOB-011** [LATER] Deferred 2026-07-21 — will be done later. Keep guest mode for the first 100–1,000 users; document the removal trigger.
- [x] **MOB-023** [DECISION] "Portfolio" is banned as the home-screen name. *(DONE — home screen is titled "Home"/"Welcome" (`apps/mobile/app/(tabs)/index.tsx:535`, tab "Home" in `_layout.tsx:23`); not named "Portfolio". The remaining collection-noun standardisation in prose is tracked as the §5 open question.)*
- [x] **MOB-034** [DECISION] De-emphasise the pause button. *(DONE — resolved as **de-emphasise rather than remove**: in `VoiceNoteRecorderBar.tsx` the pause control is shrunk to match the delete icon (`pauseButtonSize: 24` / `pauseIconSize: 14`) so Send (48) stays the primary; a raised `hitSlop={10}` keeps a ≥44pt touch target (added an optional `hitSlop` prop to `CircularButton`). Pause capability retained in the hook for the auto-pause-on-dialog behaviour. Typecheck passes. Same recorder pass also centred the timer and removed the decorative dotted line.)*
- [x] **MOB-037** [DECISION] Replace "analysis" wording. *(DONE — `apps/mobile/src/components/ActionBar.tsx`: both the first ("start") and follow-up ("continue") hand-off buttons now read "Continue" with a `brain` (think) icon, replacing "Start Analysis"/"Continue Analysis". Chosen as a model-agnostic label that stays truthful whether the AI then asks a question or finishes, so it survives whichever way MOB-038 (finished-vs-still-adding) resolves. `variant` retained in `ActionBarState` but no longer drives the label/icon.)*
- [ ] **MOB-039** [DECISION] Move entry-type selection to the start of the chat (type-first; don't auto-select).
- [x] **MOB-066** [DECISION] Section titles (Description / Reflection / Learning needs) are non-editable (fixed FourteenFish names). *(DONE — passed `hideTitle` to the entry-section `FullScreenSectionEditor` (and the capability editor) in `apps/mobile/app/(entry)/[artefactId].tsx`. The read-view card title was already plain text; the full-screen editor previously showed an editable title field whose edits were silently discarded (`handleSectionSave`/`handleCapabilitySave` ignore `_title`) — `hideTitle` removes that misleading field, keeps the FourteenFish name fixed, labels the editor header with the section name, and auto-focuses the body. Typecheck passes. **Follow-up fix:** surfacing the real title in the header exposed a latent layout bug — a long title (e.g. a capability name) pushed the Done button off-screen; fixed in `FullScreenTextEditor.tsx` by giving `headerTitle` `flex:1` + `numberOfLines={1}` + centered/ellipsised so it truncates instead of overflowing.)*
- [x] **MOB-070** [DONE] Done 2026-07-17 — `EditableReflectionSection` header restructured (shared by entry sections + capabilities): chevron moved to the leading edge inside a whole-heading toggle; edit isolated far-right. Done together with MOB-069.
- [x] **MOB-078** [DONE] Done 2026-07-20 — replaced the per-goal `Switch` in `PdpGoalSelector` with an **opt-in Track/Untrack** model: goals default **untracked** (dashed "ghost" card, full-opacity, whole-card tappable, "＋ Track this goal"); tracking discloses the review date + actions and shows a tertiary **Untrack**. Rationale (searched): NN/G — toggles are for *instant* effect, wrong for a Submit-gated selection; a command button is justified here because tracking produces an immediate result (disclosure). Decisions: default **opt-in** (no preselection dark-pattern), **gentle** non-blocking hint under the section title ("Optional — track any goals…"), **tertiary** untrack, **dashed-ghost** untracked visual. Props/finalise/archive logic unchanged (still key off `selected`); config preserved across untrack→re-track. *(Not the deferred goal-model redesign, MOB-072/074.)* **Refinements (review follow-ups):** removed the tracked-state leading check badge (was causing a layout shift + redundant with border/disclosure/Untrack); review-date chip turns **amber (`warning`) while unset** (required-but-incomplete = attention, not error), primary once set; Track button stays **left-aligned** (title rail); actions **default selected** on track; deduped the selection initializer into a single exported `initGoalSelections`; **removed the LayoutAnimation** tween (no-op under the New Arch / SDK 57 — RN Animated is fine, `LayoutAnimation` isn't). **OPEN (product):** with the opt-in flip, "Mark as done" with **zero tracked** goals archives all AI suggestions **without a confirm** (the confirm gate is `selectedGoals.length > 0`). Archiving is intended + recoverable (Archived filter), but the silent common-path needs an explicit call: accept-and-document, or add a light "no goals tracked — mark as done anyway?" confirm.
- [ ] **MOB-079** [DECISION] Remove "Quick Pick" review-date shortcuts; keep a discoverable custom date picker.
- [x] **MOB-086** [DONE] Done 2026-07-17 — review entries now show two explicit commits via the new `EntryActionBar`: **Save for later** (outline) + **Mark as done** (filled). "Save for later" reuses the existing save (`editArtefact`/`replaceNotes`) only when there are edits — no status API (the entry is already IN_REVIEW) and no toast on a clean buffer. Labels resolved under MOB-088: "Save for later" / "Mark as done" / (completed) "Save".
- [x] **MOB-087** [DONE] Done 2026-07-17 — edit-lock removed. Backend `editArtefact` + `restoreVersion` gates widened to `{IN_REVIEW, COMPLETED}` (ARCHIVED/IN_CONVERSATION still blocked; editing never touches `completedAt`); client `isEditable` includes COMPLETED. A completed entry shows an edit-conditional single **Save** that keeps it COMPLETED (no demotion) and stays in place with a toast. `duplicateToReview`/clone is now redundant — left in place, flagged for later removal.
- [x] **MOB-089** [DONE] Done 2026-07-17 — Save for later → "Needs review", Mark as done → "Completed" (`STATUS_MAP` already carried these; the two commits now drive the mapping).
- [x] **MOB-092** [DONE] Done 2026-07-17 (entry half) — Save for later / Mark as done `router.back()` to the dashboard after a fulfilled save/finalise, with a toast ("Saved" / "Marked as done"). **MOB-111** (auto-return after completing a PDP *goal*, a different screen) still open — see below.
- [ ] **MOB-111** [DECISION] After completing a PDP goal, auto-return to the homepage/dashboard. *(PDP-goal screen — not the entry screen; entry half shipped as MOB-092.)*
- [x] **MOB-094** [DONE] Done 2026-07-13 — removed the date row from the home header (`(tabs)/index.tsx`), along with the now-unused `formatDate()` helper and `dateText` style. Date is retained on the individual entry view per MOB-095. *(Also hid the persistent "Start New Entry" capture card in the first-run/welcome state so new users get a single CTA via the WelcomeModule.)*
- [x] **MOB-095** [DONE] Done 2026-07-16 — entry detail header now shows `Created {date}` in the metadata line (`formatShortDate`), keeping the date visible on the record view.
- [x] **MOB-106** [DONE] Done 2026-07-20 — PDP-goal status "Started" → "In progress" in the canonical mapper (`utils/pdpGoalStatus.ts`), so the PDP tab, goal detail, and export all update; also renamed the hardcoded PDP-tab filter chip. Removed the entry screen's verbatim duplicate `getPdpGoalStatusDisplay` and pointed it at the shared util (unify + dedupe). Enum name (`STARTED`) and colours unchanged — display-only. *(Noted but not changed: PDP `Completed` is `info`/blue vs entry `Completed` `success`/green — a colour-unification question separate from this vocabulary rename.)*
- [ ] **MOB-107** [DECISION] Split a PDP goal into a short (AI-generated) title + a description.
- [ ] **MOB-110** [DECISION] Integrate voice input into every entry/text field (reflection included). *(account for usage/cost — MOB-114/115)*
- [ ] **MOB-114** [DECISION] Stop showing "AI credits"; express usage as entries ("X of 10 entries created"); keep credits internal.
- [ ] **MOB-115** [DECISION] Simplify limits to hard entry caps (guest 5, user 10, pay for the 11th); drop session limits and the weekly-credit model; weekly limits only on the paid tier. *(exact numbers OPEN)*
- [ ] **MOB-121** [DECISION] Add a resend-code time expectation to the OTP "Didn't receive a code?" state; consider a resend throttle.

---

## 2. Bugs to fix

- [x] **MOB-069** [DONE] Done 2026-07-17 — de-nested the header (was button-in-button) into sibling controls; edit + expand now sit at opposite ends of the row (chevron left, edit far right), well past the 24px WCAG 2.5.8 spacing. Edit is a compact icon with `hitSlop` keeping a ≥44pt touch target. Fixed centrally in `EditableReflectionSection` (MOB-070 same change).
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
- [x] **MOB-001** [FIX] Remove the stray desktop-only button; make the start CTA unambiguous ("Just Talk" was mistaken for the CTA). *(DONE — single primary CTA per onboarding screen; welcome screen = one "Continue as guest" button; intro carousel visual zone non-interactive; no "Just Talk" button remains.)*
- [x] **MOB-003a** [DONE] Add a first-run welcome message — done 2026-07-13 (👋 welcome slide as slide 1 of the intro carousel).
- [x] **MOB-003b** [WON'T DO] ~~Persist run-once so the intro doesn't repeat every launch.~~ Decided against 2026-07-13 — the carousel may re-show on launch; no `hasSeenIntro` flag / navigation gating will be built.
- [x] **MOB-004** [FIX] Rewrite the 3-step carousel copy (replace "We'll do the paperwork" with "We'll ask you some questions", etc.). *(DONE — carousel rewritten in `apps/mobile/app/(auth)/intro.tsx`: "Building your portfolio, simplified" / "Talk it through" / "Stay ARCP-ready"; no "paperwork" copy remains repo-wide.)*
- [x] **MOB-006** [FIX] Reword "Your portfolio simplified" → "Building your portfolio, simplified" (it's the *process* that's simplified). *(DONE — `apps/mobile/app/(auth)/intro.tsx:34`, verbatim.)*

### Onboarding — training year & step fatigue
- [x] **MOB-020** [DONE] Verified 2026-07-13 — GP stages are already GP-specific (`ST1/ST2/ST3` → "GP Specialty Training Year 1/2/3" in `apps/api/src/specialties/gp/gp.training-stages.ts`); inactive IM/Psychiatry configs kept as the generic templates for later specialties. No code change needed.
- [x] **MOB-021** [DONE] Done 2026-07-13 — removed the `StepIndicator` from `select-stage` and `select-specialty` (onboarding is now a single question, so the progress bar manufactured "step fatigue"). Component kept for a future real multi-step wizard.
- [x] **MOB-022** [DONE] Done 2026-07-13 — onboarding auto-selects GP and opens on the training-year question. Gate redirect repointed `select-specialty` → `select-stage` (`decide-onboarding-route.ts`, single-line reversal marked in a comment); `select-stage` defaults to GP, self-fetches specialties, and hides the back button when reached without a specialty param. The `select-specialty` route/`SpecialtyList` stay intact (dormant) for settings + future multi-specialty; the back button auto-restores when a specialty param is passed again. Hardening (code review P1): `select-stage` now owns the only `fetchSpecialties` dispatch on the GP path, so it models an explicit `loading/error/ready` state and surfaces fetch failures via `ErrorBanner` + Retry (no unrecoverable spinner); warm-path condition-abort guarded.

### Registration / login / guest mode
- [x] **MOB-007** [FIX] Rename "Try the app" → "Continue as guest". *(DONE — `apps/mobile/app/(auth)/welcome.tsx:67`; no "Try the app" copy remains repo-wide.)*
- [ ] **MOB-008** [LATER] Deferred 2026-07-21 — will be done later. Make login a proper sign-in screen: "Sign in to save your progress" primary, "Continue as guest" secondary (note it won't save; state it's free).
- [ ] **MOB-009** [FIX] Persistent guest data-loss banner + inline Sign-in CTA.
- [ ] **MOB-013** [LATER] Deferred 2026-07-21 — will be done later. Create a content guide / key-message doc so app copy matches the website's one-sentence description (credibility). *(Cross-functional.)*
- [x] **MOB-119** [FIX] Replace "Verify your email…" copy. *(DONE — `apps/mobile/app/claim-account.tsx:57` email-step subtitle now reads "Enter your email to save your entries and access them from any device." Fixes the wrong verb ("Verify" before anything is entered) and keeps the multi-device benefit.)*
- [x] **MOB-113** [FIX] Reword guest-session messaging in user language. *(DONE — `apps/mobile/app/(tabs)/profile/index.tsx:131-136`: "Your data isn't being saved" + "Guest sessions are temporary. Create an account to keep your reflections, cases and goals and track your progress.")*
- [ ] **MOB-116** [LATER] Deferred 2026-07-21 — will be done later. On the upgrade page, lead with the concrete benefit — more entries ("10 entries a week vs 5"). *(Entangled with the credits→entries reframe MOB-114/115; do together.)*
- [ ] **MOB-015** [LATER] Deferred 2026-07-21 — will be done later. Add a policy/ToS TL;DR summary — on the **website** privacy page, not in-app. *(nice-to-have)*
- [x] **MOB-018** [WON'T DO] ~~Remove the flashing text on the consent screen.~~ Decided against 2026-07-13 — the data-driven consent screen has no flashing/animated text in the current implementation (the flashing was on the old pre-rewrite screen); nothing to remove.
- [x] **MOB-019** [DONE] Done 2026-07-13 — bumped the consent disclaimer from 12px → 13px (lineHeight 18 → 20); the rest of the screen's type hierarchy (28 title / 16 body & links / 15 checkbox) was already coherent.

### Home / dashboard
- [x] **MOB-024** [WON'T DO] ~~Different home message for guest (action-first "Start your first…") vs logged-in (possessive welcome).~~ Decided against 2026-07-13 — the header instead reads "Home" for guests and "Welcome" for logged-in users (`(tabs)/index.tsx`); no separate action-first vs possessive copy.
- [x] **MOB-025 / MOB-103** [DONE] Done 2026-07-16 — returning-user dashboard CTA (`StartNewEntryCard`) is now a fixed **"Talk about your case"** (was a rotating reflective question). Renamed all user-facing "entry/entries" → "case/cases" across the home screen (`(tabs)/index.tsx`): section headers "Recent cases", empty states, recency "Last case", "Untitled case", ARCP/combined empty copy, and matching a11y labels. First-run `WelcomeModule` CTA kept as "Record your first case" (product choice). Copy-only — selectors/props/routes/DTOs untouched.
- [x] **MOB-026** [DONE] Done 2026-07-16 — fixed primary CTA ("Talk about your case") with a **rotating helper sub-line** re-randomised on focus (`HELPERS` in `(tabs)/index.tsx`), now **expanded to 12 sub-prompts** (in the 10–15 target) grouped by angle: ease / value / time-saving / mode / gentle nudges. All mode-neutral (no "mic" — kept off this surface per MOB-124), no FourteenFish jargon; de-duplicated the old "we handle the…" repetition. Copy is drafted and can still be tuned with UX. **Refinement 2026-07-21:** reserved two lines of height on the helper (`captureHelper minHeight: 38` = 2 × lineHeight) so the card no longer changes height as the rotating 1-line vs 2-line prompts cycle.
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
- [x] **MOB-045** [DONE] One follow-up question at a time — validated as good; retained. *(One-question-per-round behaviour is live; nothing to change.)*
- [x] **MOB-046** [DONE] Done 2026-07-14 — no exact count is shown anywhere: one-question-per-round (MOB-045) plus the count-free tiered follow-up copy (MOB-047) removed the old "a few more questions" count claim. No "X of Y" display exists in the question UI.
- [x] **MOB-047** [DONE] Done 2026-07-14 — replaced the random two-bucket follow-up copy with a readiness-tiered system (`apps/api/src/portfolio-graph/followup-copy.ts`): 4 tone tiers driven by `readinessScore` + an honest terminal signal, monotonic (never regresses), no back-to-back repeats, and "final" only on the genuinely-last round. Old `FOLLOWUP_PROMPTS` removed; 8 new unit tests. Copy wording still to be finalised with UX — see MOB-047a.
- [ ] **MOB-047a** [LATER] Deferred 2026-07-21 — will be done later (data-gated: needs real journeys + analytics MOB-144/145 to calibrate; edit constants and spec assertions in lockstep). Revisit, evaluate and finalise the follow-up intro copy after seeing it on real journeys. The readiness-tiered mechanism is built (`apps/api/src/portfolio-graph/followup-copy.ts`), but the four `FOLLOWUP_LINES` banks are **placeholder wording pending UX sign-off**. Also tune the two knobs against real runs: the readiness band cut-points (`3.0` / `5.5`) and the tier-4 terminal signal (`askedRound >= maxFollowupRounds`).
- [x] **MOB-076** [DONE] Done 2026-07-14 — dropped the filler "Thanks" openers from the user-facing acknowledgement copy: the follow-up intro lines + default (`followup-copy.ts`) and the clarification retry prompt (`portfolio-graph.service.ts`) now lead straight with the purpose.

### Question typography & examples
- [x] **MOB-048** [DONE] Done 2026-07-14 — question promoted to the H1 (16px/600, `accessibilityRole="header"`) in `FreeTextPrompts`; the free-text lead-in demoted (14px, AA-safe `BUBBLE_MUTED_TEXT`) in `QuestionContent`; lone "1." numbering dropped for single-prompt rounds; lead-in↔question gap tightened. The section-eyebrow tier was built then **hidden for MVP** — see MOB-048a.
- [ ] **MOB-048a** [TODO/POST-MVP] Restore the section eyebrow (clinical section as an overline above the question — the third NHS tier). Built in MOB-048 then removed for MVP (recover from git); when ready, wire a `sectionId → label` source (client-side prettify of `key`, or a backend label).
- [x] **MOB-049** [DONE] Done 2026-07-14 — confirmed the hint failed WCAG AA on 4 of 7 themes (theme `textSecondary` on the fixed bubble bg). Fixed with a fixed, AA-compliant `BUBBLE_MUTED_TEXT` token (`#5c5c5c` / `#a9b0b5`, ≥6:1 on the bubble), applied to all hint text in `HintCard`.
- [x] **MOB-050** [DONE] Done 2026-07-14 — removed `fontStyle: 'italic'` from both the always-visible example and the expanded examples in `HintCard.tsx`.
- [x] **MOB-051** [DONE] Done 2026-07-14 — visible example labelled "Example answer"; further examples behind a "See more examples" / "Hide examples" accordion; examples bulleted. Note: per product decision the toggle is styled as an **underlined text link** (background/chevron removed) — a deliberate reversal of the original "looks like a hyperlink" concern.
- [ ] **MOB-052** [LATER] Deferred 2026-07-21 — will be done later. Track "More examples" clicks (high reliance may signal poorly framed questions). *(needs analytics tooling)*
- [ ] **MOB-053** [LATER] Deferred 2026-07-15 — will be done later. Gate examples to the first ~5 entries (by entry count, not training year). Needs the user's entry count plumbed to the client so `HintCard` can hide examples past entry ~5.

### Capability tagging
- [ ] **MOB-058** [FIX] Group confidence + reasoning under "Why I suggested this" (below, left-aligned, first expanded) — here confidence *is* important.
- [x] **MOB-059** [WON'T DO] Decided 2026-07-15 — not doing. The in-conversation capability-verification card (the actual target) isn't built yet, so there are no controls to re-align; and on the one surface that does render capabilities (artefact detail, shared `EditableReflectionSection`), the `space-between` header keeps the edit/expand controls right-aligned by design. Left-alignment will be handled natively when/if the verification card is built (059 folded into that build), not as a standalone patch.
- [ ] **MOB-061** [DEFERRED] Deferred 2026-07-15 — belongs to the in-conversation capability-verification card, which isn't built yet. Fix the touch targets (≥44pt/48dp, `minHeight` + adequate `hitSlop`, ≥8pt gap between adjacent controls) as part of that card's build, not as a standalone patch to the shared `EditableReflectionSection` on the entry-detail screen.
- **MOB-077** [RISK] Capability-mapping hallucination is ~1/10 and can't be fully eliminated — track error rate; rely on user verification (constraint, not a fix).

### Entry review screen
- [x] **MOB-062** [WON'T DO] Decided 2026-07-16 — not doing. The answered select-card summary already collapses to the chosen option(s); the imperative-heading/disabled-control nuance isn't worth the shell + both-cards churn pre-launch.
- [x] **MOB-063** [DONE] Done 2026-07-16 — completion card copy now varies via a 5-message pool (`src/utils/completionMessages.ts`), picked deterministically off the artefact id so it's stable per entry.
- [x] **MOB-064** [DONE] Done 2026-07-16 — detail header reworked (Option A): type demoted to a quiet metadata line (`{type} · Created {date}`), status pill removed; the "Needs review" action is promoted into the guidance banner below (see MOB-065). Word "review" no longer collides in the metadata line.
- [x] **MOB-065** [DONE] Done 2026-07-16 — `ArtefactAdvisoryBanner` now shows for the whole IN_REVIEW state as two stackable cards: a calm, non-dismissible **info/blue** "Needs review" ("Your draft is ready. Please check each section…") + a dismissible **warning/amber** "Some sections need more detail" (only when sections are thin). Colours evidence-backed (amber = review/attention per Jira/GitHub; blue reserved for the persistent guidance card).
- [x] **MOB-067** [DONE] Done 2026-07-17 — new `stripEmoji` util (`emoji-regex`) removes emoji (flags/skin-tone/ZWJ) from entry text while keeping accents & medical symbols. Applied silently at the source in `EditableTitle` (title) and `FullScreenTextEditor` (section/capability/note title + text) — covers typing and paste. Chat composer deliberately out of scope. *(Review follow-up: the controlled-`TextInput` "stripped==current value → skipped reconcile" concern was verified on-device (RN 0.86) as NOT reproducing — RN re-asserts native text; no save-layer/blur fix needed.)*
- [ ] **MOB-068** [FIX/VERIFY] Verify bullets/formatting paste cleanly into FourteenFish.
- [x] **MOB-071** [DONE] Done 2026-07-17 — semantic `success`/`info` accent tokens added earlier (light/dark, all themes) and the detail-screen greens routed through `colors.success`. Now closed fully: new `src/theme/statusColors.ts` holds a mode-aware `{surface, text}` pair per variant (default/processing/warning/success/info), hand-picked per mode (no inversion) with AA contrast; `success`/`info` text aligned to `colors.success`/`colors.info`. `StatusPill` refactored to consume it — `VARIANT_COLORS` deleted; `StatusVariant` moved to the token module + re-exported. Housed as one theme-family-independent module (not duplicated ×7). Fixes the "Batman green" and reconciles the "Completed" pill/accent. App-wide (9 `StatusPill` usages) — needs a light/dark visual sweep.

### Editing, saving & completion status
- [x] **MOB-083** [DONE] Done 2026-07-17 — resolved by the new save model: the standing discard (X) control is retired and discard now lives at the single exit decision point. Leaving with unsaved edits raises a three-way prompt — **Save for later / Save** (status-aware) · **Discard** · **Keep editing** — mirroring the canonical iOS unsaved-changes dialog.
- [x] **MOB-084** [DONE] Done 2026-07-17 — Version History nav row now shows a subtitle "See and restore previous versions" (title/subtitle stack via `navRowText`/`navRowTitle`/`navRowSubtitle`).
- [x] **MOB-085** [DONE] Done 2026-07-17 — the two-level model is collapsed into one: an entry is always editable; you choose where to file it (Save for later → "Needs review", Mark as done → "Completed") and neither locks anything. Delivered via MOB-086/087/089 + the exit-time discard (MOB-083). Only real save happens through the `EntryActionBar`; the overloaded "Save changes" sticky bar is retired. *(Residual: user-test the mental model on device.)*
- [x] **MOB-098** [DONE] Done 2026-07-17 — resolved via the MOB-097 validate-on-tap pattern: the completion action (now **"Mark as done"**) is never a greyed-out mystery button. It's rendered only in review (contextual, not disabled) and validates on tap, surfacing the themed error dialog when a PDP review date is missing. Transient `loading` disable during the save/finalise request is expected feedback. *(Updated 2026-07-17 for the MOB-086 model: the commit bar is now always present in review — edits are committed **through** Save for later / Mark as done, not via a separate save-first step. The genuine disabled-button case is MOB-104 on the PDP screen.)*
- [x] **MOB-097** [DONE] Done 2026-07-17 — replaced the native `Alert` with a themed **error dialog** (new reusable `AppDialog`, `tone="error"` + ⚠ icon): "Add a review date" / "Set a review date for each goal you're keeping…". *Scope note:* shipped the **simplified dialog** variant, not the full NHS inline pattern (per-field red highlight + scroll-to-field) — that's deferred if we want the field-level treatment later. Also migrated the finalise-confirm to `AppDialog` for same-flow consistency.

### PDP goals (this-version fixes)
- [ ] **MOB-073** [FIX] Reframe the current PDP screen: "Goal 1/2" structure; present the goal then "Do you want to add this goal? Yes/No"; allow a review date; remove the on/off toggle; frame "PDP goals based on this case".
- [ ] **MOB-080** [FIX] Add a tick/"Confirm" affordance when a date is set.
- [ ] **MOB-081** [FIX] Consolidate the duplicate "Add" buttons for goal actions/notes into one control, positioned below the list.
- [x] **MOB-082** [FIX] Simplify note-deletion copy ("This note will be removed"). *(DONE — copy was already simplified; also migrated the imperative `Alert.alert` to the themed `AppDialog` (warning tone, trash icon) in `apps/mobile/app/(entry)/[artefactId].tsx` for consistency with the other 5 dialogs on the screen. iOS modal-race fix: the edit-to-blank path defers opening the confirm dialog via `InteractionManager.runAfterInteractions` (mirrors handleDelete/handleArchive) so AppDialog's Modal isn't presented in the same commit the editor Modal dismisses. Typecheck passes. **Device QA:** empty an existing note → tap Done → confirm the delete dialog appears on a physical iPhone.)*
- [ ] **MOB-104** [FIX] Make the disabled "Complete goal" button unmistakably read as disabled (not secondary).
- [ ] **MOB-105 / MOB-133** [FIX] Build one reusable "Change dates / extend" control shared by PDP goals and review periods (users usually push deadlines back).
- [ ] **MOB-108** [FIX] Give PDP-goal reflection its own screen (currently squeezed inline; feels skippable).
- [ ] **MOB-109** [FIX] Add celebratory framing before reflection ("Amazing, well done. Now let's start your reflection"); keep skippable.
- [ ] **MOB-075** [FIX/VERIFY] Confirm PDP goals also upload/export to FourteenFish.

### Entries list & export
- [ ] **MOB-099** [FIX/VERIFY] Confirm portfolio copy/export as text or PDF (entry points + formats).
- [x] **MOB-100** [DONE] Done 2026-07-17 — Archive/Delete migrated to themed `AppDialog`s with differentiated copy; menu labels shortened to `Archive`/`Delete`; Delete uses `destructive` variant (red, not filled), Archive neutral/reversible. *(Delete-must-truly-remove is a separate §3 legal gate — line 78 — still open.)* **FINAL copy:**
- Menu **Archive** → body: "This entry will be hidden. You can restore it anytime from your archive."
- Menu **Delete** → body: "This permanently deletes the entry, its conversation and linked goals. This can't be undone." (red destructive)

Friction ladder scaled to reversibility (Archive light; Delete explicit-consequence). Verb+noun buttons (`Archive`/`Cancel`, red `Delete`/`Cancel`), no Yes/No, serious-not-alarming tone.
- [ ] **MOB-101** [FIX] Show created/updated timestamps on entry rows ("Updated 1 minute ago", "Created 12/7").

### Profile / account creation
- [ ] **MOB-118** [FIX] Settings surface: use off-white/off-grey even in light mode (currently "really hard to read"). *(settings are dummy screens for now)*
- [ ] **MOB-120** [LATER] Deferred 2026-07-21 — will be done later. Split name and OTP onto separate screens (name first). *(reuse-vs-split for returning users is OPEN — see §5)*
- [ ] **MOB-122** [LATER] Deferred 2026-07-21 — will be done later. Interim profile avatar: drop the initial "M" circle (show full name left-aligned) or offer selectable avatars.

### Review-period (ARCP capability-coverage) tracker
- [ ] **MOB-123** [FIX/BUILD] Build/complete the ARCP capability-coverage tracker on the homepage (% covered).
- [ ] **MOB-128** [LATER] Deferred 2026-07-21 — will be done later. Make capability tiles clickable — show meaning + linked entries. *(needs entry↔capability linking, MOB-134)*
- [ ] **MOB-129** [FIX] Celebratory animation at 100% coverage.
- [ ] **MOB-132** [FIX] Explain what a review period is; rewrite the setup copy ("See what capabilities your entries cover" reads as "very weird").
- [ ] **MOB-133** [FIX] Review-period management: "Change dates" + a clearer "I'm done with this period / start next review period" CTA, both at the bottom. *(shares control with MOB-105)*
- [ ] **MOB-134** [LATER] Deferred 2026-07-21 — will be done later. Link each entry to its review period; add a period drop-down to filter entries by current/past period.

### Analytics
- [ ] **MOB-144** [BUILD] Investigate the events that must be captured for the MVP release (define the minimum event taxonomy: onboarding funnel, entry created/completed, follow-up interactions, upgrade/limit hits, etc.).
- [ ] **MOB-145** [BUILD] Integrate analytics with PostHog. *(depends on MOB-144's event list)*

---

## 5. Open questions to resolve

Each blocks a clean build decision; resolve before or at launch.

- **MOB-023** [OPEN] Final home-screen name (not "portfolio"; "dashboard" lukewarm, "diary" rejected). — Product/UX
- **MOB-028** [OPEN] Reconcile the expected centred-mic start vs the chat layout (usability test). — Mobile UX
- **MOB-032** [OPEN] Keep or remove the visible 3-minute recording countdown given the crash-safety rationale? — Mobile UX / Engineering
- **MOB-038** [OPEN] How to detect "finished" vs "still adding" (one-shot voice vs typed bursts): single "Continue chat" vs dual "Send and continue / Send and finish". Most-emphasised unresolved item. — Product/Engineering
- **MOB-060** [OPEN] Cap capabilities at 3, or allow many and decide in FourteenFish? — Product
- [x] **MOB-088** [RESOLVED] Done 2026-07-17 — labels locked: **Save for later** (secondary/outline, → "Needs review") + **Mark as done** (primary/filled, → "Completed") in review; **Save** for the completed-edit state. Rationale (searched industry patterns): asymmetric draft-vs-commit pair (one save-flavoured, one state-flavoured) reads as two *kinds* of action, not two saves; "done" is reversible-toned (completion is no longer a lock) and predicts the resulting pill; "Finalise/Submit/Lock" rejected as falsely permanent. — UX/Content
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
- **MOB-143** [TODO/LATER] Migrate native `Alert.alert` → themed `AppDialog` app-wide for brand consistency (**53 call sites / 13 files**, surveyed 2026-07-17). **Not a hand-wire job:** `Alert.alert` is imperative but `AppDialog` is declarative, and **8 calls live in hooks/utils** (`useOtpFlow.ts` ×5, `utils/export/exportArtefact.ts` ×3) with no render surface. **Prereq:** build a `DialogProvider` + `useDialog()` imperative bridge (plus a non-hook singleton handle for utils) so any code can `show({tone,title,message,buttons})`; also add a lightweight **`Toast`** (none exists today). **Then:** ~38 confirmations/errors → `AppDialog`; ~7 success/acks ("Saved"/"Copied"/"Code Sent") → **Toast, not a modal**; ~6 "coming soon"/hints optional. Reusable `AppDialog` already built (`src/components/AppDialog.tsx`); entry-screen review-date error + finalise confirm already migrated (MOB-097).

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
