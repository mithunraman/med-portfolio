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
- [ ] **MOB-094** [DECISION] Remove the date/time from the homepage.
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

- [ ] **MOB-014** [LEGAL] Confirm whether "By tapping Continue" is GDPR-sufficient or an explicit consent **checkbox** ("I agree to the privacy policy and terms of service") is required. Add checkbox if needed.
- [ ] **MOB-016** [LEGAL] Add an "I am a UK doctor in training" attestation checkbox.
- [ ] **MOB-017** [LEGAL / OPEN] Resolve whether the "I will anonymise patient identifiers" consent is legally required; reword to be friendly (not threatening); consider an optional record-time reminder. Redaction is a secondary safety net, not a substitute. *(Doctor: onus is on the doctor; voice lowers users' guard vs typing.)*
- [ ] **MOB-012** [FIX] Show consent on first run only, before continuing.
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
- [ ] **MOB-020** [FIX] Make the training-year question GP-specific now (year 1/2/3); keep generic templates for later specialties.
- [ ] **MOB-021** [FIX] Remove/repurpose the onboarding progress bar (it manufactures ~8-step "step fatigue"; intro isn't a step).
- [ ] **MOB-022** [FIX] Skip the generic first step; open with the training-year question.

### Registration / login / guest mode
- [ ] **MOB-007** [FIX] Rename "Try the app" → "Continue as guest".
- [ ] **MOB-008** [FIX] Make login a proper sign-in screen: "Sign in to save your progress" primary, "Continue as guest" secondary (note it won't save; state it's free).
- [ ] **MOB-009** [FIX] Persistent guest data-loss banner + inline Sign-in CTA.
- [ ] **MOB-013** [FIX] Create a content guide / key-message doc so app copy matches the website's one-sentence description (credibility). *(Cross-functional.)*
- [ ] **MOB-119** [FIX] Replace "Verify your email to save it" → "Enter your email to save your entries in progress".
- [ ] **MOB-113** [FIX] Reword guest-session messaging in user language: "You're currently in a temporary session. Create an account to keep your cases and track your progress"; specify "your reflections, cases and goals aren't being saved".
- [ ] **MOB-116** [FIX] On the upgrade page, lead with the concrete benefit — more entries ("10 entries a week vs 5").
- [ ] **MOB-015** [FIX] Add a policy/ToS TL;DR summary — on the **website** privacy page, not in-app. *(nice-to-have)*
- [ ] **MOB-018** [FIX] Remove the flashing text on the consent screen.
- [ ] **MOB-019** [FIX] Review/normalise the consent text size.

### Home / dashboard
- [ ] **MOB-024** [FIX] Different home message for guest (action-first "Start your first…") vs logged-in (possessive welcome).
- [ ] **MOB-025 / MOB-103** [FIX] Adopt "case"-based primary CTA language ("Record a Case" / "Talk about your case") — Doctor: "case is the right word". Avoid FourteenFish-associated words.
- [ ] **MOB-026** [FIX] Keep the primary CTA text fixed; rotate 10–15 sub-prompts underneath.
- [ ] **MOB-027** [FIX] First-run confirmation: "You're set up for general practice".
- [ ] **MOB-093** [FIX] Personalise the dashboard with the user's name.
- [ ] **MOB-124** [FIX] Primary CTA: use a conversation-bubble icon (not a mic) and give it more weight/size.
- [ ] **MOB-125** [FIX] Scannable "Recent entries" (list of ~5 + "See all") with richer cards. *(balance vs PDP-goals space — OPEN)*
- [ ] **MOB-126** [FIX] Add icons/imagery to entry cards for scannability (AI-picked per type/ARCP area). *(differentiation risk: most entries are the same type)*

### Chat / voice input
- [ ] **MOB-029** [FIX] Clarify the input accepts text + voice ("Talk or type about it") — "talk" over-implies speaking.
- [ ] **MOB-030** [FIX] Remove the mic icon from the record button; relabel "Record your case".
- [ ] **MOB-031** [FIX] Strengthen visual hierarchy so the input/record button is clearly the primary action (it currently "looks disabled").
- [ ] **MOB-033** [FIX] Deliver tips as the first AI chat bubble (progressive disclosure; "send as many messages as you need").
- [ ] **MOB-035** [FIX] Use two ticks for message status (sent vs AI-processed); one tick reads as "not delivered".
- [ ] **MOB-036** [FIX] Label transcribed voice text "Transcription" (voice messages only).
- [ ] **MOB-056** [FIX] Strip filler words ("uh/um") from the cleaned transcription.

### Entry-type classification & confidence
- [ ] **MOB-040** [FIX] Remove confidence percentages at the classification step (they don't sum to 100; retain confidence for capability tagging).
- [ ] **MOB-041** [FIX] Enlarge/label the "why this type" reasoning expander; keep the first item expanded.
- [ ] **MOB-042** [FIX] Show the top 3 type suggestions + "see more", not 5.

### Loading / progress feedback
- [ ] **MOB-044** [FIX] Replace the ~15 random "thinking" phrases with 2–3 ordered, progress-reflecting stages (generic, don't expose the pipeline).

### Follow-up questions & copy
- [ ] **MOB-045** [KEEP] One follow-up question at a time — validated as good; retain.
- [ ] **MOB-046** [FIX] Don't show an exact remaining-question count ("A few more questions. Let's start here").
- [ ] **MOB-047** [FIX] Sequence the ~15 hard-coded follow-up messages (not random; they repeated "a few final questions"). Engineer to send the 15 variants for UX review.
- [ ] **MOB-076** [FIX] Trim greeting copy (drop "Thanks"; every extra word adds reading time).

### Question typography & examples
- [ ] **MOB-048** [FIX] Make the question the largest element (H1); apply the NHS type hierarchy (section title / question / hint).
- [ ] **MOB-049** [FIX] Verify hint-text colour contrast against WCAG/NHS (possible failure).
- [ ] **MOB-050** [FIX] Remove italics from hint text.
- [ ] **MOB-051** [FIX] Hide example answers under a "See more examples" accordion (currently looks like a page-leaving hyperlink); label the visible one "Example answer".
- [ ] **MOB-052** [FIX/ANALYTICS] Track "More examples" clicks (high reliance may signal poorly framed questions). *(needs analytics tooling)*
- [ ] **MOB-053** [FIX] Gate examples to the first ~5 entries (by entry count, not training year).

### Capability tagging
- [ ] **MOB-058** [FIX] Group confidence + reasoning under "Why I suggested this" (below, left-aligned, first expanded) — here confidence *is* important.
- [ ] **MOB-059** [FIX] Left-align actionable controls (heavy screen-magnification users miss right-hand controls).
- [ ] **MOB-061** [FIX] Bigger thumb/touch targets on capability rows.
- **MOB-077** [RISK] Capability-mapping hallucination is ~1/10 and can't be fully eliminated — track error rate; rely on user verification (constraint, not a fix).

### Entry review screen
- [ ] **MOB-062** [FIX] "You've selected" + bullet points (friendlier than "What you selected").
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
