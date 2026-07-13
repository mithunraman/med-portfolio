# Mobile UX & Product Review — Transcript 2

**Source:** `labelled_transcript-mobile-2.txt`
**Product:** Logit (voice/text → structured portfolio entries for UK GP training)
**Participants:** Engineer, UX Designer, Doctor
**Scope of this session:** Entry review/edit screen, PDP goals, the save/complete flow (draft vs done), dashboard/homepage, Entries list, PDP tab.
**Analyst:** Senior mobile product & UX analyst
**Date of analysis:** 2026-07-13

> **ID continuity note.** This is the second review transcript. To avoid ID collisions with `mobile-ux-review-transcript-1.md` (which used MOB-001…MOB-077), findings here are numbered from **MOB-078** onward. IDs are stable across all sections of *this* document.

> **Platform note.** The transcript never names iOS or Android, so **every item is `Platform not stated`**. Note also that the session references "the desktop" (line 116) and page/`viewport`/scroll-to-top behaviour (lines 171–184), which suggests the prototype under review may have been shown on a desktop/web surface. This is an *observation only* — it does not establish a target platform, and no item should be routed to iOS or Android engineering on this evidence alone. Flagged as an open question (see §8).

---

## 1. Executive summary

**Main themes.** The session was a walkthrough of the *post-analysis* portfolio flow — reviewing/editing an AI-generated entry, attaching a PDP goal, and saving/completing the entry. The dominant, recurring problem was the **two-level status model** (an entry can be "edited & saved" but not yet "added to the portfolio / completed"), which the Engineer himself repeatedly admitted is confusing ("There are two levels. I know it's confusing. I need to simplify it a bit"). Almost every other finding radiates from this: draft-vs-complete buttons, terminology, status values, error handling on completion, and screen consolidation.

**Most important user problems.**
- Users fear losing their work if they step away mid-review; there is no clearly-safe "leave for now" exit (MOB-086).
- The edit-saved vs completed distinction is opaque, and the Engineer could not explain it cleanly in-session (MOB-085).
- Completion is blocked by a silently-disabled button and an unclear message when a review date is missing (MOB-097, MOB-098).
- Several duplicated/confusing controls: two "Add" buttons that do the same thing (MOB-081), a confusing slider/checkbox for adding a PDP goal (MOB-078), and a "Quick Pick" date shortcut that misled the user (MOB-079).

**Most frequently mentioned improvements.** Two save actions ("Save for Later" + "Complete Entry / Mark as Done"); proper NHS-style error handling for the missing review date; removing/renaming confusing controls (slider, Quick Pick, duplicate Add button); adding timestamps to entry rows; personalising the dashboard.

**Confirmed decisions (this session).**
- Implement **two buttons — "Save for Later" and "Complete Entry / Mark as Done"** — both of which persist to the profile (MOB-086).
- **Remove the edit-lock:** entries remain editable after completion; completion status exists only for later filtering (MOB-087).
- **Remove "Quick Pick"** date shortcuts (MOB-079).
- **Remove the checkbox / confusing slider** for the PDP-goal add control (MOB-078).
- **Status mapping:** Save for Later → "Needs review"; Mark as Done → "Completed" (MOB-089).
- After Save for Later / Mark as Done, **auto-return to the homepage/dashboard** (MOB-092).
- **Remove the date/time from the homepage** (MOB-094), while keeping it on the individual entry/record view (MOB-095).
- Adopt an **NHS-style error pattern** for the missing-review-date error, at MVP a minimal version: red highlight + message + scroll-to-field (MOB-097).

**Major disagreements / alternatives.** No hard disagreements; mostly convergent iteration. The one live design divergence is whether the **second confirmation screen should be merged into the review/edit screen** (UX Designer floated it; not resolved — MOB-091), and unsettled **button terminology** (Save for Later / Finished for now / Mark as Done / Complete Entry — MOB-088).

**Bugs / reliability.** One acknowledged bug: a saved/"In Progress" entry did not reflect correctly in the Entries list; the Engineer said "I guess that's a bug… I need to fix that" (MOB-096).

**Key risks / constraints / open questions.** Terminology not finalised (MOB-088); system-status visibility design explicitly deferred (MOB-090); Archive-vs-Delete distinction and placement unresolved (MOB-100); whether the linked case should be tappable from a PDP goal (MOB-102); and the platform/surface ambiguity noted above.

---

## 2. Consolidated mobile-app improvements

Grouped by theme. Every field uses `Not stated` where the transcript is silent.

### Theme: PDP goal creation

| ID | Platform | Type | Actionable item | User problem | Proposed improvement or alternatives | Screen or journey | Stakeholders | Evidence | Priority signals | Dependencies or questions | Recommended next step |
| -- | -------- | ---- | --------------- | ------------ | ------------------------------------ | ----------------- | ------------ | -------- | ---------------- | ------------------------- | --------------------- |
| MOB-078 | Platform not stated | UX improvement | Replace the confusing slider/checkbox control for adding a PDP goal | The control for adding the case as a PDP goal used a slider/checkbox that stakeholders found confusing | UX Designer: slider "very confusing"; Engineer: "I'll remove the checkbox"; spell out the goal instead | PDP goal creation from a case | Engineer, UX Designer, Doctor | L4–8: "I'll remove the checkbox"; "I think that is very confusing. The slider" | Not stated | Depends on final PDP-goal add pattern | Design a single clear add-to-goal control; validate wording |
| MOB-079 | Platform not stated | UX improvement | Remove "Quick Pick" review-date shortcuts | "Quick Pick" (1 week / 1 month / 2 months) plus "Custom" misled the Doctor, who expected a quick random date | Engineer: "Quick Pick should go away" | Setting a PDP-goal review/target date | Engineer, Doctor | L9–11: "Quick Pick should go away. Okay" | Not stated | None stated | Confirm removal; ensure the custom date picker alone is discoverable |
| MOB-080 | Platform not stated | UI improvement | Change the date-set action to a tick/"Confirm" affordance | The confirmation of a set date lacked a clear success affordance | UX Designer: "could change to a little tick, like a confirmation"; Engineer: "we can" | Setting the review/target date | UX Designer, Engineer | L13–15: "change to a little tick, like a confirmation"; "Confirm" | Not stated | Follows MOB-079 | Add a tick/confirmed-state micro-interaction on date set |
| MOB-081 | Platform not stated | UX improvement | Consolidate the duplicate "Add" buttons for goal actions/notes | Two buttons appeared to do the same thing (both open the same add flow) | UX Designer: "it should be one or the other"; move the Add button "below"; Engineer weighed "Add Note" | PDP goal — adding actions/notes | Doctor, UX Designer, Engineer | L22–33: "these two do the same thing"; "it should be one or the other"; "the Add button probably wants to go below" | Not stated | Layout: avoid two buttons back-to-back | Redesign to a single Add control positioned below the list |
| MOB-082 | Platform not stated | Content or terminology | Simplify note-deletion messaging | Deleting a note showed a message; wording/necessity questioned | UX Designer: just say "This note will be removed"; no confirm needed on save-delete — "not a biggie" | PDP goal — note editing | UX Designer, Engineer | L34–37: "you can just say 'This note will be removed'… It's not a biggie" | Low ("not a biggie") | None stated | Adopt the shorter copy; low priority |

### Theme: Editing, saving & completion status

| ID | Platform | Type | Actionable item | User problem | Proposed improvement or alternatives | Screen or journey | Stakeholders | Evidence | Priority signals | Dependencies or questions | Recommended next step |
| -- | -------- | ---- | --------------- | ------------ | ------------------------------------ | ----------------- | ------------ | -------- | ---------------- | ------------------------- | --------------------- |
| MOB-083 | Platform not stated | UX improvement | Add a discard-changes safety confirmation on the X/close control | Tapping X discards all edits with no warning | UX Designer: safety message "Are you sure you want to?"; Engineer: "keep editing or discard" | Entry edit screen — close/discard | UX Designer, Engineer, Doctor | L39–43: "Is there a safety message…?"; "keep editing or discard. Nice" | Not stated | None stated | Implement a keep-editing / discard confirmation dialog |
| MOB-084 | Platform not stated | UX improvement | Improve clarity/discoverability of Version History | The Doctor did not understand what Version History was until explained | Engineer explained it stores prior versions to revert | Entry edit screen — Version History | Doctor, Engineer | L46–47: "That Version History is just… Whatever"; Engineer explains revert | Not stated | None stated | *Inferred:* add a one-line description/tooltip clarifying revert purpose |
| MOB-085 | Platform not stated | UX improvement | Simplify the two-level status model (edit-saved vs added-to-portfolio) | Distinction between "saved edits" and "completed/added to portfolio" is confusing; Engineer could not explain it cleanly | Engineer: "there are two levels… I need to simplify it a bit"; ultimately folded into two clear buttons (see MOB-086/087) | Entry review → completion | Engineer, Doctor, UX Designer | L48–92: "there are two levels. I know it's confusing. I need to simplify it a bit"; "I'm having difficulty explaining it" | Engineer flagged as confusing (self-identified) | Drives MOB-086/087/088/089 | Model the states explicitly; user-test the mental model |
| MOB-086 | Platform not stated | Decision | Provide two save actions: "Save for Later" and "Complete Entry / Mark as Done", both persisting | User feared stepping away would lose work; only options felt like "finish or lose it" | UX Designer: need a Save Draft / "Save for Later"; two buttons, both save to profile; Engineer: "I will implement both buttons" | Entry review → exit | UX Designer, Engineer, Doctor | L73–85, L118: "you need a Save Draft button… I'd be nervous to step away"; "I will implement both buttons" | High (repeatedly stressed by UX Designer as "a key thing we need to make clear") | Terminology unresolved (MOB-088); status mapping (MOB-089) | Build both buttons; confirm labels; ensure both persist |
| MOB-087 | Platform not stated | Decision | Remove the edit-lock after completion (entries stay editable) | Completing an entry originally froze it, which alarmed the user | Engineer reversed: "why am I putting a restriction on it?… Always make them editable"; completion now only drives filtering | Entry completion | Engineer, UX Designer | L87–90: "why can't they edit it?… Always make them editable" | Not stated | Affects status semantics (MOB-089) | Remove freeze; keep completion as a filter/status only |
| MOB-088 | Platform not stated | Open question | Finalise the terminology for the two save actions | Multiple candidate labels floated, none confirmed | Alternatives: "Save for Later" / "Finished for now" / "Mark as Done" / "Complete Entry" | Entry review → exit buttons | Engineer, UX Designer, Doctor | L82–93: "Finished for now"; "Save for Later. Mark as Done"; "Complete Entry" | Not stated | Blocks final build of MOB-086 | Pick labels; validate comprehension with users |
| MOB-089 | Platform not stated | Decision | Map save actions to statuses: Save for Later → "Needs review"; Mark as Done → "Completed" | Users need the status to reflect which action they took | Confirmed mapping in-session | Entry status / later filtering | Doctor, Engineer | L95–97: "if I do Save for Later, the status will say 'Needs review'"; "mark it as done, the status gets completed" | Not stated | Depends on final labels (MOB-088) | Implement status mapping; ensure filter uses it |
| MOB-090 | Platform not stated | UX improvement | Design how system status is displayed (visibility of status) | Status display not yet designed; UX Designer cites "visibility of system status" as the #1 heuristic | Dedicated design pass; explicitly deferred ("Probably not for this") | Status display across entries | UX Designer | L100–102: "Visibility of system status is the number one heuristic… Probably not for this. We probably need to think about it" | Flagged important by heuristic, but **deferred** | Depends on status model (MOB-085/089) | Schedule a status-visibility design exploration post-MVP |
| MOB-091 | Platform not stated | UX improvement | Consider merging the second confirmation screen into the review/edit screen | The second screen adds only three options; may be an unnecessary step | UX Designer: put Save for Later/Complete at the bottom of the review screen; Engineer floated moving to top / sticky; kept at bottom | Review screen → confirmation screen | UX Designer, Engineer | L106–117: "do I actually need this second screen?… the only additions… are these three options" | Not stated | Interacts with MOB-086 button placement | Prototype merged single-screen flow; compare to two-screen |
| MOB-092 | Platform not stated | Decision | After Save for Later / Mark as Done, auto-return to the homepage/dashboard | Users need a clear end-of-flow destination | Confirmed: either action returns to homepage/dashboard | Completion → homepage | Engineer, UX Designer | L116: "selecting Save for Later or Mark as Done would take you back to this homepage" | Not stated | None stated | Implement navigation return on both actions |

### Theme: Dashboard / homepage

| ID | Platform | Type | Actionable item | User problem | Proposed improvement or alternatives | Screen or journey | Stakeholders | Evidence | Priority signals | Dependencies or questions | Recommended next step |
| -- | -------- | ---- | --------------- | ------------ | ------------------------------------ | ----------------- | ------------ | -------- | ---------------- | ------------------------- | --------------------- |
| MOB-093 | Platform not stated | Feature request | Personalise the dashboard with the user's name | Impersonal dashboard; personalisation drives engagement | UX Designer: e.g. "Cat's dashboard" — "people love seeing their name" (cites Tesla, Monday); Engineer: "easy to do" | Dashboard / homepage | UX Designer, Engineer | L124–129: "personalise this, like 'Cat's dashboard'… people love seeing their name" | Not stated (framed as an easy win) | Requires user's name available | Add name to dashboard header; A/B if measurable |
| MOB-094 | Platform not stated | Decision | Remove the date/time from the homepage | Date/time adds no value and feels "formal" | Engineer: "remove that date and time… not adding any value"; UX Designer agrees | Homepage / dashboard | Engineer, UX Designer | L131–135: "I need to remove that date and time. It's not adding any value" | Not stated | Contrast with MOB-095 | Remove from homepage only |
| MOB-095 | Platform not stated | UX improvement | Keep the date visible when viewing an individual entry/record | Date is useful in the records/entry context (not the homepage) | Doctor: "found it useful for records"; Engineer: "you can still see the date when you view it" | Entry/record view | Doctor, Engineer | L136–140: "I found it useful for records"; "you can still see the date when you view it" | Not stated | Pairs with MOB-094 | Retain date on entry view; confirm placement |
| MOB-103 | Platform not stated | Content or terminology | Align the primary dashboard CTA to "Record a Case" language | Primary action label/terminology to be standardised | Engineer: dashboard "will follow the language of 'Record a Case'" | Dashboard primary CTA | Engineer, UX Designer | L122–123: "follow the language of 'Record a Case,' or whatever we want to use" | Not stated (tentative — "or whatever we want to use") | None stated | Confirm final CTA wording |

### Theme: Entries list

| ID | Platform | Type | Actionable item | User problem | Proposed improvement or alternatives | Screen or journey | Stakeholders | Evidence | Priority signals | Dependencies or questions | Recommended next step |
| -- | -------- | ---- | --------------- | ------------ | ------------------------------------ | ----------------- | ------------ | -------- | ---------------- | ------------------------- | --------------------- |
| MOB-096 | Platform not stated | Bug | Entry not reflecting/updating correctly in the Entries ("In Progress") list | A saved/in-progress entry did not appear/update as expected during the walkthrough | Engineer to fix | Entries list — In Progress | Engineer, Doctor, UX Designer | L151–156: "I guess that's a bug… I need to fix that"; "Why is this not working?" | Acknowledged as a bug to fix | Reproduction details not stated | Reproduce, diagnose, fix; add regression check |
| MOB-097 | Platform not stated | Accessibility | Proper error handling for a missing review date on Mark as Done (NHS error pattern) | Completion blocked by a disabled button with an unclear message; error not visually distinct | UX Designer: NHS pattern — error summary "There is a problem" at top, red highlight, scroll to field. **MVP minimum:** red highlight + message ("You must enter a review date to continue") + move viewport | Mark as Done — validation | UX Designer, Engineer, Doctor | L164–185: "this should be red"; "scroll you to the top"; "The minimal way… highlight it in red… move the viewport" | MVP-scoped (explicit minimum agreed) | Only known error case is the review date; empty section yields a *warning*, not error (L174) | Implement MVP error state; plan full NHS summary later |
| MOB-098 | Platform not stated | UX improvement | Don't silently disable the Mark as Done button — communicate why | A disabled button left the user unsure why they couldn't proceed | Engineer: "Maybe I should not disable it. Then people won't know why it's disabled" | Mark as Done | Engineer, UX Designer | L163: "Maybe I should not disable it. Then people won't know why it's disabled" | Not stated | Interacts with MOB-097 | Keep enabled + surface validation error, or add helper text |
| MOB-099 | Platform not stated | Feature request | Copy/export the portfolio as text or PDF | Users want to take their portfolio content out | Engineer: copies whole portfolio's text, or as a PDF | Entry/portfolio — export | Doctor, Engineer | L196–199: "it'll just copy the whole portfolio's text, or as a PDF" | Not stated | None stated | Confirm export formats and entry points; observed as existing |
| MOB-100 | Platform not stated | UX improvement | Clarify Archive vs Delete (meaning + placement) | Difference between Archive and Delete unclear; placement questioned | Engineer: Archive = stop tracking but still viewable; Delete = fully removed. UX Designer questions whether they should be bottom buttons; PII-by-mistake → Delete | Entries list — row actions (Archive/Duplicate/Delete) | UX Designer, Engineer, Doctor | L200–216: "how is that different from Delete?"; "Archive means it's still there… under a separate status"; "if I entered PII by mistake… I would want to delete it" | Not stated | Ties to PII-removal need (Delete must truly remove) | Clarify labels/help text; decide placement; confirm Delete removal semantics |
| MOB-101 | Platform not stated | Feature request | Show created/updated timestamps on entry list items | Rows lack recency/creation context | UX Designer: "Updated one minute ago", "Created on 12/7"; Engineer: "Very nice" | Entries list — row metadata | UX Designer, Engineer | L217–220: "show the date or time… 'Updated one minute ago,' 'Created…'" | Not stated | Depends on timestamp data availability | Add relative/absolute timestamps to rows |

### Theme: PDP tab

| ID | Platform | Type | Actionable item | User problem | Proposed improvement or alternatives | Screen or journey | Stakeholders | Evidence | Priority signals | Dependencies or questions | Recommended next step |
| -- | -------- | ---- | --------------- | ------------ | ------------------------------------ | ----------------- | ------------ | -------- | ---------------- | ------------------------- | --------------------- |
| MOB-102 | Platform not stated | Feature request | Make the linked case tappable from a PDP goal | User wanted to click through from a PDP goal to its linked case | Engineer: "Maybe I can make every one a little slider or something?" (uncertain) | PDP tab — goal → linked case | Doctor, Engineer | L223–225: "So can I click on that?"; "Maybe I can make every one a little slider or something?" | Not stated | Interaction pattern unresolved | Design a clear tap-through from goal to case |

---

## 3. Detailed findings

#### MOB-078 — Replace the confusing slider/checkbox control for adding a PDP goal
- **Theme:** PDP goal creation
- **Type:** UX improvement (secondary: Decision — checkbox removal agreed)
- **Platform:** Platform not stated
- **Current problem or observation:** The control to turn a case into a PDP goal used a slider/checkbox the stakeholders found confusing.
- **Underlying user need:** A clear, unambiguous way to add the case as a PDP goal.
- **Proposed improvement or alternatives:** UX Designer called the slider "very confusing"; Engineer will "remove the checkbox"; approach is to spell the goal out.
- **Expected outcome:** Not stated (implied: less confusion).
- **Screen, flow, or journey:** PDP goal creation from a case.
- **Stakeholders:** Engineer, UX Designer, Doctor.
- **Supporting evidence:** L4–8 — "Like spelling it out?"; "I'll remove the checkbox"; "I think that is very confusing. The slider".
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** Final add-to-goal pattern TBD.
- **Decision status:** Partial decision — checkbox removal agreed; replacement control not finalised.
- **Unresolved questions:** What replaces the slider/checkbox?
- **Recommended next step:** Design one clear add-to-goal control and validate the wording.

#### MOB-079 — Remove "Quick Pick" review-date shortcuts
- **Theme:** PDP goal creation
- **Type:** UX improvement (secondary: Decision)
- **Platform:** Platform not stated
- **Current problem or observation:** "Quick Pick" (1 week / 1 month / 2 months) alongside "Custom" misled the Doctor, who expected a quick auto date.
- **Underlying user need:** A predictable way to set a review/target date.
- **Proposed improvement or alternatives:** Engineer: "Quick Pick should go away."
- **Expected outcome:** Not stated.
- **Screen, flow, or journey:** Setting a PDP-goal review/target date.
- **Stakeholders:** Engineer, Doctor.
- **Supporting evidence:** L9–11 — "Quick Pick was like one week, one month, two months"; "Quick Pick should go away."
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** None stated.
- **Decision status:** Decision — remove Quick Pick.
- **Unresolved questions:** Does the custom date picker remain sufficiently discoverable?
- **Recommended next step:** Confirm removal; verify the custom picker alone is clear.

#### MOB-080 — Change the date-set action to a tick/"Confirm" affordance
- **Theme:** PDP goal creation
- **Type:** UI improvement
- **Platform:** Platform not stated
- **Current problem or observation:** Setting a date lacked a clear success/confirmation affordance.
- **Underlying user need:** Feedback that the date was accepted.
- **Proposed improvement or alternatives:** UX Designer: "change to a little tick, like a confirmation"; Engineer agreed.
- **Expected outcome:** Not stated.
- **Screen, flow, or journey:** Setting the review/target date.
- **Stakeholders:** UX Designer, Engineer.
- **Supporting evidence:** L13–15 — "change to a little tick, like a confirmation"; "Confirm."
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** Follows MOB-079.
- **Decision status:** Agreed in principle ("Yeah, we can").
- **Unresolved questions:** None stated.
- **Recommended next step:** Add a tick/confirmed micro-interaction on date set.

#### MOB-081 — Consolidate the duplicate "Add" buttons for goal actions/notes
- **Theme:** PDP goal creation
- **Type:** UX improvement
- **Platform:** Platform not stated
- **Current problem or observation:** Two buttons appeared to do the same thing (both open the same add flow), confusing the Doctor.
- **Underlying user need:** One obvious way to add an action/note.
- **Proposed improvement or alternatives:** UX Designer: "it should be one or the other," and the Add button "probably wants to go below"; Engineer considered relabelling to "Add Note" and worried about two buttons back-to-back.
- **Expected outcome:** Not stated.
- **Screen, flow, or journey:** PDP goal — adding actions/notes.
- **Stakeholders:** Doctor, UX Designer, Engineer.
- **Supporting evidence:** L22–33.
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** Avoid two adjacent buttons.
- **Decision status:** Direction agreed (consolidate + move below); exact layout unconfirmed.
- **Unresolved questions:** Final label and placement.
- **Recommended next step:** Redesign to a single Add control below the list.

#### MOB-082 — Simplify note-deletion messaging
- **Theme:** PDP goal creation
- **Type:** Content or terminology
- **Platform:** Platform not stated
- **Current problem or observation:** Note deletion showed a message whose wording/necessity was questioned.
- **Underlying user need:** Clear, non-alarming feedback when a note is removed.
- **Proposed improvement or alternatives:** UX Designer: just say "This note will be removed"; no save-time confirmation needed — "not a biggie."
- **Expected outcome:** Not stated.
- **Screen, flow, or journey:** PDP goal — note editing.
- **Stakeholders:** UX Designer, Engineer.
- **Supporting evidence:** L34–37.
- **Priority or urgency signals:** Low — "It's not a biggie."
- **Dependencies or technical constraints:** None stated.
- **Decision status:** Soft agreement; low priority.
- **Unresolved questions:** None stated.
- **Recommended next step:** Adopt shorter copy when convenient.

#### MOB-083 — Add a discard-changes safety confirmation on the X/close control
- **Theme:** Editing, saving & completion status
- **Type:** UX improvement
- **Platform:** Platform not stated
- **Current problem or observation:** Tapping X discards all edits with no warning.
- **Underlying user need:** Protection against accidental loss of edits.
- **Proposed improvement or alternatives:** UX Designer asked for an "Are you sure?" message; Engineer: "keep editing or discard."
- **Expected outcome:** Prevent accidental data loss.
- **Screen, flow, or journey:** Entry edit screen — close/discard.
- **Stakeholders:** UX Designer, Engineer, Doctor.
- **Supporting evidence:** L39–43.
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** None stated.
- **Decision status:** Agreed in principle ("Nice").
- **Unresolved questions:** None stated.
- **Recommended next step:** Implement a keep-editing / discard dialog.

#### MOB-084 — Improve clarity/discoverability of Version History
- **Theme:** Editing, saving & completion status
- **Type:** UX improvement
- **Platform:** Platform not stated
- **Current problem or observation:** The Doctor did not understand Version History until the Engineer explained it.
- **Underlying user need:** Understand that edits can be reverted to a prior version.
- **Proposed improvement or alternatives:** *Inferred* — add a brief description/tooltip.
- **Expected outcome:** Not stated.
- **Screen, flow, or journey:** Entry edit screen — Version History.
- **Stakeholders:** Doctor, Engineer.
- **Supporting evidence:** L46–47 — "That Version History is just… Whatever"; Engineer: "it'll store the previous version if you want to go back."
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** None stated.
- **Decision status:** Observation only — no decision.
- **Unresolved questions:** Is a label/tooltip change warranted, or is this a one-off?
- **Recommended next step:** *Inferred* — add a one-line explainer; consider light usability check.

#### MOB-085 — Simplify the two-level status model (edit-saved vs added-to-portfolio)
- **Theme:** Editing, saving & completion status
- **Type:** UX improvement
- **Platform:** Platform not stated
- **Current problem or observation:** The distinction between "saved edits" and "completed / added to portfolio" is confusing; the Engineer struggled to explain it live.
- **Underlying user need:** A clear mental model of what "saving" vs "completing" does.
- **Proposed improvement or alternatives:** Engineer: "I need to simplify it a bit"; the session resolved toward two explicit buttons (MOB-086) and no edit-lock (MOB-087).
- **Expected outcome:** Reduced confusion about entry state.
- **Screen, flow, or journey:** Entry review → completion.
- **Stakeholders:** Engineer, Doctor, UX Designer.
- **Supporting evidence:** L48–92 — "there are two levels. I know it's confusing. I need to simplify it a bit"; "I'm having difficulty explaining it."
- **Priority or urgency signals:** Self-identified by Engineer as confusing.
- **Dependencies or technical constraints:** Drives MOB-086/087/088/089.
- **Decision status:** Problem acknowledged; concrete fixes captured in linked items.
- **Unresolved questions:** Final conceptual model + copy.
- **Recommended next step:** Define states explicitly; user-test the model.

#### MOB-086 — Provide two save actions ("Save for Later" and "Complete Entry / Mark as Done"), both persisting
- **Theme:** Editing, saving & completion status
- **Type:** Decision (secondary: UX improvement)
- **Platform:** Platform not stated
- **Current problem or observation:** The user felt the only options were "finish it" or "lose it," and was nervous to step away mid-review.
- **Underlying user need:** Leave safely and return later without losing work.
- **Proposed improvement or alternatives:** UX Designer: add a Save Draft / "Save for Later"; two buttons, both persist to profile. Engineer: "I will implement both buttons."
- **Expected outcome:** Users can pause and resume across sessions confidently.
- **Screen, flow, or journey:** Entry review → exit.
- **Stakeholders:** UX Designer (primary), Engineer, Doctor.
- **Supporting evidence:** L73–85, L118 — "you need a Save Draft button… I'd be nervous to step away"; "I will implement both buttons."
- **Priority or urgency signals:** UX Designer stressed it as "a key thing that we need to make clear."
- **Dependencies or technical constraints:** Terminology (MOB-088); status mapping (MOB-089).
- **Decision status:** **Confirmed** — both buttons to be implemented.
- **Unresolved questions:** Final labels.
- **Recommended next step:** Build both; finalise labels; verify persistence on both.

#### MOB-087 — Remove the edit-lock after completion (entries stay editable)
- **Theme:** Editing, saving & completion status
- **Type:** Decision
- **Platform:** Platform not stated
- **Current problem or observation:** Completing an entry originally froze it against further edits, which alarmed the user.
- **Underlying user need:** Ability to revise an entry even after marking it done.
- **Proposed improvement or alternatives:** Engineer reversed the restriction: "Always make them editable"; completion now only drives filtering.
- **Expected outcome:** No lock-in; completion = filterable status only.
- **Screen, flow, or journey:** Entry completion.
- **Stakeholders:** Engineer, UX Designer.
- **Supporting evidence:** L87–90 — "why can't they edit it?… Always make them editable"; "the only reason to Complete Entry is for you to filter them later."
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** Affects status semantics (MOB-089).
- **Decision status:** **Confirmed** — remove freeze.
- **Unresolved questions:** None stated.
- **Recommended next step:** Remove the lock; retain completion purely as status/filter.

#### MOB-088 — Finalise the terminology for the two save actions
- **Theme:** Editing, saving & completion status
- **Type:** Open question
- **Platform:** Platform not stated
- **Current problem or observation:** Several candidate labels floated; none confirmed.
- **Underlying user need:** Labels that clearly convey "pause" vs "finish."
- **Proposed improvement or alternatives:** "Save for Later" / "Finished for now" / "Mark as Done" / "Complete Entry."
- **Expected outcome:** Not stated.
- **Screen, flow, or journey:** Entry review → exit buttons.
- **Stakeholders:** Engineer, UX Designer, Doctor.
- **Supporting evidence:** L82–93.
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** Blocks final build of MOB-086.
- **Decision status:** Unresolved.
- **Unresolved questions:** Which two labels?
- **Recommended next step:** Choose labels; validate comprehension with target users.

#### MOB-089 — Map save actions to statuses (Save for Later → "Needs review"; Mark as Done → "Completed")
- **Theme:** Editing, saving & completion status
- **Type:** Decision
- **Platform:** Platform not stated
- **Current problem or observation:** Status must reflect which save action the user took, to support later filtering.
- **Underlying user need:** Find entries that still need attention vs those finished.
- **Proposed improvement or alternatives:** Confirmed mapping in-session.
- **Expected outcome:** Filterable statuses.
- **Screen, flow, or journey:** Entry status / later filtering.
- **Stakeholders:** Doctor, Engineer.
- **Supporting evidence:** L95–97.
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** Final labels (MOB-088); filtering UI.
- **Decision status:** **Confirmed** — mapping agreed.
- **Unresolved questions:** Exact status label strings.
- **Recommended next step:** Implement mapping; wire to the entries filter.

#### MOB-090 — Design how system status is displayed (visibility of status)
- **Theme:** Editing, saving & completion status
- **Type:** UX improvement
- **Platform:** Platform not stated
- **Current problem or observation:** The way status is surfaced to the user is not yet designed.
- **Underlying user need:** Always know the current state of an entry.
- **Proposed improvement or alternatives:** Dedicated design pass; UX Designer cites "visibility of system status" as the #1 heuristic.
- **Expected outcome:** Not stated.
- **Screen, flow, or journey:** Status display across entries.
- **Stakeholders:** UX Designer.
- **Supporting evidence:** L100–102 — "Visibility of system status is the number one heuristic… Probably not for this. We probably need to think about it."
- **Priority or urgency signals:** Flagged important by heuristic, but **explicitly deferred**.
- **Dependencies or technical constraints:** Depends on status model (MOB-085/089).
- **Decision status:** Deferred.
- **Unresolved questions:** How/where status is displayed.
- **Recommended next step:** Schedule a status-visibility design exploration post-MVP.

#### MOB-091 — Consider merging the second confirmation screen into the review/edit screen
- **Theme:** Editing, saving & completion status
- **Type:** UX improvement
- **Platform:** Platform not stated
- **Current problem or observation:** The second screen adds only three options; it may be an unnecessary extra step.
- **Underlying user need:** Complete the flow with minimum friction.
- **Proposed improvement or alternatives:** UX Designer: put Save for Later / Complete at the bottom of the review screen. Engineer floated moving buttons to top or making them sticky; the group kept them at the bottom.
- **Expected outcome:** Fewer steps; single coherent flow.
- **Screen, flow, or journey:** Review screen → confirmation screen.
- **Stakeholders:** UX Designer, Engineer.
- **Supporting evidence:** L106–117.
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** Interacts with MOB-086 button placement.
- **Decision status:** Unresolved — discussed, not decided.
- **Unresolved questions:** Merge screens or keep two?
- **Recommended next step:** Prototype the merged single-screen flow and compare.

#### MOB-092 — Auto-return to the homepage/dashboard after Save for Later / Mark as Done
- **Theme:** Editing, saving & completion status
- **Type:** Decision
- **Platform:** Platform not stated
- **Current problem or observation:** Users need a clear destination after saving/completing.
- **Underlying user need:** Confident end-of-task landing.
- **Proposed improvement or alternatives:** Both actions return the user to the homepage/dashboard.
- **Expected outcome:** Clear flow completion.
- **Screen, flow, or journey:** Completion → homepage.
- **Stakeholders:** Engineer, UX Designer.
- **Supporting evidence:** L116 — "selecting Save for Later or Mark as Done would take you back to this homepage."
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** None stated.
- **Decision status:** **Confirmed.**
- **Unresolved questions:** None stated.
- **Recommended next step:** Implement navigation return on both actions.

#### MOB-093 — Personalise the dashboard with the user's name
- **Theme:** Dashboard / homepage
- **Type:** Feature request
- **Platform:** Platform not stated
- **Current problem or observation:** The dashboard is impersonal.
- **Underlying user need:** A sense of ownership/engagement.
- **Proposed improvement or alternatives:** UX Designer: e.g. "Cat's dashboard" — "people love seeing their name" (cites Tesla, Monday). Engineer: "that's easy to do."
- **Expected outcome:** Higher engagement (*inferred* from rationale).
- **Screen, flow, or journey:** Dashboard / homepage.
- **Stakeholders:** UX Designer, Engineer.
- **Supporting evidence:** L124–129.
- **Priority or urgency signals:** Framed as an easy win; no explicit urgency.
- **Dependencies or technical constraints:** Needs the user's name available.
- **Decision status:** Receptive ("point taken," "easy to do") — not formally decided.
- **Unresolved questions:** Exact copy/placement.
- **Recommended next step:** Add name to dashboard header.

#### MOB-094 — Remove the date/time from the homepage
- **Theme:** Dashboard / homepage
- **Type:** Decision
- **Platform:** Platform not stated
- **Current problem or observation:** Homepage date/time adds no value and feels "formal."
- **Underlying user need:** An uncluttered, informal homepage.
- **Proposed improvement or alternatives:** Engineer: remove it; UX Designer agrees.
- **Expected outcome:** Cleaner homepage.
- **Screen, flow, or journey:** Homepage / dashboard.
- **Stakeholders:** Engineer, UX Designer.
- **Supporting evidence:** L131–135 — "I need to remove that date and time. It's not adding any value."
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** Contrast with MOB-095.
- **Decision status:** **Confirmed** for the homepage.
- **Unresolved questions:** None stated.
- **Recommended next step:** Remove from homepage only.

#### MOB-095 — Keep the date visible when viewing an individual entry/record
- **Theme:** Dashboard / homepage
- **Type:** UX improvement
- **Platform:** Platform not stated
- **Current problem or observation:** Date is useful in the records/entry context though not on the homepage.
- **Underlying user need:** Know when a record was created/relevant.
- **Proposed improvement or alternatives:** Retain date on the entry/record view.
- **Expected outcome:** Not stated.
- **Screen, flow, or journey:** Entry/record view.
- **Stakeholders:** Doctor, Engineer.
- **Supporting evidence:** L136–140 — "I found it useful for records"; "you can still see the date when you view it."
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** Pairs with MOB-094.
- **Decision status:** Agreed to retain.
- **Unresolved questions:** Placement on the entry view.
- **Recommended next step:** Confirm date placement on the entry view.

#### MOB-096 — Entry not reflecting/updating correctly in the Entries ("In Progress") list
- **Theme:** Entries list
- **Type:** Bug
- **Platform:** Platform not stated
- **Current problem or observation:** During the walkthrough a saved/in-progress entry did not appear/update as expected.
- **Underlying user need:** See saved entries reliably in the list.
- **Proposed improvement or alternatives:** Engineer to fix.
- **Expected outcome:** Entries reflect their true state in the list.
- **Screen, flow, or journey:** Entries list — In Progress.
- **Stakeholders:** Engineer, Doctor, UX Designer.
- **Supporting evidence:** L151–156 — "I guess that's a bug… I need to fix that"; "Why is this not working?"
- **Priority or urgency signals:** Acknowledged bug.
- **Dependencies or technical constraints:** Reproduction details not stated.
- **Decision status:** Confirmed bug (to fix).
- **Unresolved questions:** Repro steps, frequency, cause — all not stated.
- **Recommended next step:** Reproduce, diagnose, fix; add a regression check.

#### MOB-097 — Proper error handling for a missing review date on Mark as Done (NHS error pattern)
- **Theme:** Entries list / completion
- **Type:** Accessibility (secondary: UX improvement)
- **Platform:** Platform not stated
- **Current problem or observation:** Completion is blocked by a disabled button with an unclear message; the error isn't visually distinct, and the Doctor missed it.
- **Underlying user need:** Understand what's wrong and how to fix it to proceed.
- **Proposed improvement or alternatives:** UX Designer: NHS pattern — top-of-page error summary "There is a problem," red highlighting, and scroll/link to the field. **MVP minimum:** red highlight + message ("You must enter a review date to continue") + move the viewport to the field.
- **Expected outcome:** Users can resolve the block and complete the entry.
- **Screen, flow, or journey:** Mark as Done — validation.
- **Stakeholders:** UX Designer (primary), Engineer, Doctor.
- **Supporting evidence:** L164–185.
- **Priority or urgency signals:** MVP-scoped; explicit minimum agreed.
- **Dependencies or technical constraints:** Only the review date is an error case; an empty section yields a *warning*, not an error (L174).
- **Decision status:** MVP approach agreed; full NHS summary deferred.
- **Unresolved questions:** Whether multi-error handling is ever needed.
- **Recommended next step:** Build the MVP error state; plan the full NHS error summary later.

#### MOB-098 — Don't silently disable the Mark as Done button — communicate why
- **Theme:** Entries list / completion
- **Type:** UX improvement
- **Platform:** Platform not stated
- **Current problem or observation:** A disabled button left the user unsure why they couldn't proceed.
- **Underlying user need:** Understand and remove the blocker.
- **Proposed improvement or alternatives:** Engineer: "Maybe I should not disable it. Then people won't know why it's disabled."
- **Expected outcome:** Users understand the blocker.
- **Screen, flow, or journey:** Mark as Done.
- **Stakeholders:** Engineer, UX Designer.
- **Supporting evidence:** L163.
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** Interacts with MOB-097.
- **Decision status:** Proposal — not finalised.
- **Unresolved questions:** Keep enabled + validate on tap, or add helper text?
- **Recommended next step:** Decide enable-and-validate vs helper text; align with MOB-097.

#### MOB-099 — Copy/export the portfolio as text or PDF
- **Theme:** Entries list
- **Type:** Feature request
- **Platform:** Platform not stated
- **Current problem or observation:** Users want to take their portfolio content out.
- **Underlying user need:** Reuse/share the portfolio outside the app.
- **Proposed improvement or alternatives:** Engineer: copies the whole portfolio's text, or as a PDF.
- **Expected outcome:** Not stated.
- **Screen, flow, or journey:** Entry/portfolio — export.
- **Stakeholders:** Doctor, Engineer.
- **Supporting evidence:** L196–199.
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** None stated.
- **Decision status:** Observed as existing behaviour.
- **Unresolved questions:** Entry points and exact formats.
- **Recommended next step:** Confirm export formats and entry points.

#### MOB-100 — Clarify Archive vs Delete (meaning + placement)
- **Theme:** Entries list
- **Type:** UX improvement (secondary: Privacy — PII removal)
- **Platform:** Platform not stated
- **Current problem or observation:** The difference between Archive and Delete is unclear, and their placement (row action vs bottom buttons) was questioned.
- **Underlying user need:** Confidently remove or hide an entry — and truly delete PII entered by mistake.
- **Proposed improvement or alternatives:** Engineer: Archive = stop tracking but still viewable under a separate status; Delete = fully removed. UX Designer questioned placement; for PII-by-mistake, Delete (not Archive).
- **Expected outcome:** Correct action chosen for the user's intent.
- **Screen, flow, or journey:** Entries list — row actions (Archive / Duplicate / Delete).
- **Stakeholders:** UX Designer, Engineer, Doctor.
- **Supporting evidence:** L200–216.
- **Priority or urgency signals:** Not stated (PII context raises sensitivity — *inferred*).
- **Dependencies or technical constraints:** Delete must genuinely remove data (PII).
- **Decision status:** Semantics clarified verbally; labels/placement unresolved.
- **Unresolved questions:** Labels, help text, placement; confirm Delete's true-removal semantics.
- **Recommended next step:** Clarify labels/help text; decide placement; verify Delete fully removes data.

#### MOB-101 — Show created/updated timestamps on entry list items
- **Theme:** Entries list
- **Type:** Feature request
- **Platform:** Platform not stated
- **Current problem or observation:** Entry rows lack creation/recency context.
- **Underlying user need:** Know when an entry was created/last updated.
- **Proposed improvement or alternatives:** UX Designer: "Updated one minute ago," "Created on 12/7." Engineer: "Very nice."
- **Expected outcome:** Not stated.
- **Screen, flow, or journey:** Entries list — row metadata.
- **Stakeholders:** UX Designer, Engineer.
- **Supporting evidence:** L217–220.
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** Timestamp data must be available.
- **Decision status:** Receptive — not formally decided.
- **Unresolved questions:** Relative vs absolute; which timestamp(s).
- **Recommended next step:** Add created/updated timestamps to rows.

#### MOB-102 — Make the linked case tappable from a PDP goal
- **Theme:** PDP tab
- **Type:** Feature request
- **Platform:** Platform not stated
- **Current problem or observation:** The user wanted to click through from a PDP goal to its linked case.
- **Underlying user need:** Navigate between a goal and the case that generated it.
- **Proposed improvement or alternatives:** Engineer: "Maybe I can make every one a little slider or something?" (uncertain).
- **Expected outcome:** Not stated.
- **Screen, flow, or journey:** PDP tab — goal → linked case.
- **Stakeholders:** Doctor, Engineer.
- **Supporting evidence:** L223–225.
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** Interaction pattern unresolved.
- **Decision status:** Unresolved.
- **Unresolved questions:** Tap target vs slider; navigation behaviour.
- **Recommended next step:** Design a clear tap-through from goal to case.

#### MOB-103 — Align the primary dashboard CTA to "Record a Case" language
- **Theme:** Dashboard / homepage
- **Type:** Content or terminology
- **Platform:** Platform not stated
- **Current problem or observation:** The primary CTA label is to be standardised.
- **Underlying user need:** A clear, consistent primary action.
- **Proposed improvement or alternatives:** Engineer: dashboard "will follow the language of 'Record a Case,' or whatever we want to use."
- **Expected outcome:** Not stated.
- **Screen, flow, or journey:** Dashboard primary CTA.
- **Stakeholders:** Engineer, UX Designer.
- **Supporting evidence:** L122–123.
- **Priority or urgency signals:** Tentative ("or whatever we want to use").
- **Dependencies or technical constraints:** None stated.
- **Decision status:** Tentative direction, not final.
- **Unresolved questions:** Final wording.
- **Recommended next step:** Confirm final CTA wording.

---

## 4. User-journey findings

Only journeys actually discussed are included.

### Core product experience — reviewing & editing an AI-generated entry
- **Main user problems:** discard-without-warning on X (MOB-083); Version History not understood (MOB-084); confusing edit-saved vs completed model (MOB-085).
- **Proposed improvements:** discard confirmation; clearer Version History; simplified status model.
- **Item IDs:** MOB-083, MOB-084, MOB-085.
- **Supporting evidence:** L39–52.
- **Outstanding questions:** Final conceptual model and copy for entry states.

### Task completion — saving vs completing an entry
- **Main user problems:** fear of losing work when stepping away; "finish or lose it" framing; edit-lock on completion; unclear terminology; blocked completion on missing review date; silently disabled button.
- **Proposed improvements:** two persisting buttons (MOB-086); no edit-lock (MOB-087); status mapping (MOB-089); auto-return to homepage (MOB-092); NHS-style error (MOB-097); don't silently disable (MOB-098); possible screen merge (MOB-091).
- **Item IDs:** MOB-085, MOB-086, MOB-087, MOB-088, MOB-089, MOB-090, MOB-091, MOB-092, MOB-097, MOB-098.
- **Supporting evidence:** L48–118, L158–195.
- **Outstanding questions:** Final button labels (MOB-088); merge second screen? (MOB-091); status-visibility design (MOB-090).

### PDP goal creation
- **Main user problems:** confusing slider/checkbox add control; misleading Quick Pick; duplicate Add buttons; weak date-set confirmation; note-deletion copy.
- **Proposed improvements:** MOB-078, MOB-079, MOB-080, MOB-081, MOB-082.
- **Item IDs:** MOB-078 – MOB-082.
- **Supporting evidence:** L1–37.
- **Outstanding questions:** Replacement add control (MOB-078); final Add button label/placement (MOB-081).

### Content discovery / management — Entries list
- **Main user problems:** an entry not reflecting in the list (bug); unclear Archive vs Delete; no timestamps on rows.
- **Proposed improvements:** fix the bug (MOB-096); clarify Archive/Delete (MOB-100); add timestamps (MOB-101); positive: green/amber/In-Progress status colours were liked.
- **Item IDs:** MOB-096, MOB-100, MOB-101.
- **Supporting evidence:** L141–220.
- **Outstanding questions:** Repro for MOB-096; Archive/Delete labels & placement.

### Dashboard / homepage (re-engagement)
- **Main user problems:** impersonal dashboard; unnecessary date/time; CTA wording.
- **Proposed improvements:** personalise with name (MOB-093); remove homepage date/time (MOB-094) while keeping it on entries (MOB-095); "Record a Case" CTA (MOB-103).
- **Item IDs:** MOB-093, MOB-094, MOB-095, MOB-103.
- **Supporting evidence:** L119–140.
- **Outstanding questions:** CTA wording; personalisation copy/placement.

### PDP tab
- **Main user problems:** cannot click through from a goal to its linked case.
- **Proposed improvements:** MOB-102.
- **Item IDs:** MOB-102.
- **Supporting evidence:** L221–225.
- **Outstanding questions:** Interaction pattern (tap vs slider).

> Journeys **not discussed** in this transcript (installation/first launch, onboarding, registration/login, notifications, help/support) are intentionally omitted.

---

## 5. Platform-specific findings

#### iOS
- None. No item was attributed specifically to iOS.

#### Android
- None. No item was attributed specifically to Android.

#### Both platforms
- None. No item was explicitly stated to apply to both platforms. (Do not infer "both" from mobile-ness.)

#### Platform not stated
- **All items — MOB-078 through MOB-103.** The transcript never names iOS or Android. The session additionally references "the desktop" (L116) and page/viewport/scroll behaviour (L171–184), which suggests the prototype may have been reviewed on a desktop/web surface — but this does **not** confirm a target platform. Treat every item as platform-unspecified pending clarification (see §8).

---

## 6. Bugs and technical issues

**MOB-096 — Entry not reflecting/updating in the Entries ("In Progress") list**
- **Item ID:** MOB-096
- **Issue:** A saved/in-progress entry did not appear/update correctly in the Entries list during the walkthrough.
- **Platform:** Platform not stated.
- **Affected screen or flow:** Entries list — "In Progress" tab/section.
- **User impact:** User cannot see/track a saved entry reliably.
- **Reproduction details:** Not stated (occurred live while toggling save/complete state).
- **Frequency:** Not stated.
- **Severity:** Not stated (Engineer treated it as a fix-required bug; UX Designer: "Bugs are part of the effort").
- **Device, OS version, or app version:** Not stated.
- **Supporting evidence:** L151–156 — "I guess that's a bug… I need to fix that"; "Why is this not working?"
- **Suspected cause:** Not stated.
- **Missing information required for investigation:** Repro steps, exact state transition, expected vs actual, platform/build.

> No other defects were explicitly identified. The disabled Mark-as-Done button (MOB-097/098) is a UX/validation issue, not a bug.

---

## 7. Decisions already made

Only explicitly-confirmed decisions are listed.

| Item ID | Decision | Platform | Screen / journey | Reason (if stated) | Owner (if stated) | Evidence | Dependencies | Required action |
| ------- | -------- | -------- | ---------------- | ------------------ | ----------------- | -------- | ------------ | --------------- |
| MOB-086 | Implement two persisting save buttons: "Save for Later" + "Complete Entry / Mark as Done" | Platform not stated | Entry review → exit | Users must be able to leave safely without losing work | Engineer ("I will implement both buttons") | L118, L73–85 | Labels (MOB-088), status mapping (MOB-089) | Build both buttons; both persist to profile |
| MOB-087 | Entries remain editable after completion (remove edit-lock) | Platform not stated | Entry completion | No reason to restrict editing; completion is only for filtering | Engineer | L87–90 | MOB-089 semantics | Remove the freeze behaviour |
| MOB-089 | Status mapping: Save for Later → "Needs review"; Mark as Done → "Completed" | Platform not stated | Entry status / filtering | Enables later filtering by state | Engineer, Doctor | L95–97 | Final labels (MOB-088) | Implement mapping + filter |
| MOB-092 | After Save for Later / Mark as Done, return to the homepage/dashboard | Platform not stated | Completion → homepage | Clear flow completion | Engineer | L116 | None | Implement navigation return |
| MOB-079 | Remove "Quick Pick" review-date shortcuts | Platform not stated | Review-date setting | Confusing vs Custom | Engineer | L11 | None | Remove Quick Pick |
| MOB-078 | Remove the checkbox for the PDP-goal add control (slider deemed confusing) | Platform not stated | PDP goal creation | Slider/checkbox confusing | Engineer, UX Designer | L6–8 | Replacement control TBD | Remove checkbox; design replacement |
| MOB-094 | Remove the date/time from the homepage | Platform not stated | Homepage | No value; feels formal | Engineer, UX Designer | L131–135 | Keep date on entry view (MOB-095) | Remove from homepage only |
| MOB-097 | Adopt NHS-style error handling for the missing review date; MVP = red highlight + message + scroll-to-field | Platform not stated | Mark as Done validation | Clear, standards-aligned error recovery | UX Designer, Engineer | L182–185 | Full NHS summary deferred | Build MVP error state |

> Items like MOB-080 (tick confirmation), MOB-083 (discard dialog), MOB-093 (personalisation), and MOB-101 (timestamps) drew positive/receptive responses but were **not** stated as firm decisions; they are tracked as improvements/requests, not decisions.

---

## 8. Open questions and follow-ups

### Product
- **MOB-088** — Final labels for the two save actions ("Save for Later" / "Finished for now" / "Mark as Done" / "Complete Entry"). *Unresolved:* multiple candidates, none chosen. Owner: Not clear.
- **MOB-091** — Merge the second confirmation screen into the review/edit screen, or keep two screens? *Unresolved:* discussed, not decided. Owner: Not clear.
- **MOB-103** — Final primary CTA wording ("Record a Case"?). *Unresolved:* stated tentatively. Owner: Not clear.

### UX and design
- **MOB-090** — Design the visibility/display of entry status (heuristic #1). *Unresolved:* explicitly deferred ("not for this"). Owner: UX Designer (raised it).
- **MOB-081** — Final label and placement of the consolidated Add control. *Unresolved:* direction agreed, layout not. Owner: Not clear.
- **MOB-100** — Archive vs Delete labels, help text, and placement. *Unresolved:* semantics clarified verbally only. Owner: Not clear.
- **MOB-102** — Interaction pattern for tapping through from a PDP goal to its linked case (tap vs "slider"). *Unresolved:* Engineer uncertain. Owner: Not clear.
- **MOB-078** — What control replaces the confusing slider/checkbox for adding a PDP goal. *Unresolved.* Owner: Not clear.

### iOS engineering
- No iOS-specific follow-ups (platform not stated).

### Android engineering
- No Android-specific follow-ups (platform not stated).

### Backend engineering
- **MOB-096** — Root-cause and fix the Entries-list state bug (repro/state transition unknown). Owner: Engineer (acknowledged).
- **MOB-099** — Confirm export formats (text/PDF) and their entry points. Owner: Not clear.
- **MOB-100** — Confirm that Delete performs true data removal (relevant for PII). Owner: Not clear.

### Analytics
- None explicitly raised. *Inferred* opportunity: instrument Save-for-Later vs Mark-as-Done usage and completion drop-off — not discussed, do not action without confirmation.

### User research
- **MOB-085/MOB-088** — Usability-test the save/complete mental model and button labels. *Inferred* next step; not agreed in-session.

### Privacy and security
- **MOB-100** — PII entered by mistake must be truly deletable (not merely archived). *Unresolved:* raised by Doctor/UX Designer; deletion semantics to be verified. Owner: Not clear.

### Cross-cutting / platform
- **All items** — Clarify the delivery platform(s) (iOS / Android / web-desktop) given the "desktop"/viewport references. *Unresolved:* transcript never states it. Owner: Not clear.

---

## 9. Conflicting viewpoints and alternatives

The session was largely convergent; the following are the genuine divergences, deferrals, and rejected/changed positions.

**MOB-087 — Should completed entries be locked?**
- Shared problem: what "completing" an entry should do.
- Viewpoint A (initial): Engineer — completing freezes the entry ("It's frozen… you can't edit it after that").
- Viewpoint B (final): Engineer reversed — "Always make them editable"; completion is only for filtering. UX Designer agreed.
- Stakeholders: Engineer (both positions), UX Designer.
- Decision status: **Resolved** in favour of B (no lock).
- Evidence: L57 vs L87–90.

**MOB-091 — One screen or two?**
- Shared problem: the second confirmation screen may be redundant.
- Viewpoint A: UX Designer — put Save for Later / Complete at the bottom of the review screen (possibly drop the second screen).
- Viewpoint B: Engineer — floated moving buttons to top or making them sticky; group settled on keeping buttons at the bottom, but the merge question itself was left open.
- Stakeholders: UX Designer, Engineer.
- Decision status: **Undecided** (button position = bottom; screen-merge = open).
- Evidence: L106–117.

**MOB-088 — Button terminology**
- Shared problem: naming the two save actions.
- Alternatives: "Save for Later"; "Finished for now"; "Mark as Done"; "Complete Entry."
- Stakeholders: Engineer, UX Designer, Doctor.
- Decision status: **Undecided.**
- Evidence: L82–93.

**MOB-097 — Error-handling depth (full NHS pattern vs MVP)**
- Shared problem: how to surface the missing-review-date error.
- Viewpoint A: UX Designer — full NHS pattern (top-of-page "There is a problem" summary + link + scroll).
- Viewpoint B (adopted for MVP): minimal — red highlight + message + move viewport ("The minimal way to launch for the MVP").
- Stakeholders: UX Designer, Engineer.
- Decision status: **MVP resolved**, full pattern **deferred**.
- Evidence: L177–185.

**MOB-100 — Archive vs Delete for unwanted/PII entries**
- Shared problem: removing an entry the user doesn't want.
- Viewpoint A: Archive (stop tracking, still viewable).
- Viewpoint B: Delete (fully removed) — preferred for PII-by-mistake ("I would want to delete it, not archive it").
- Stakeholders: Engineer, UX Designer, Doctor.
- Decision status: **Semantics agreed; labels/placement undecided.**
- Evidence: L200–216.

**Deferred / rejected specifics:**
- **Quick Pick** — *rejected* (MOB-079, "should go away").
- **Add-control checkbox / slider** — *rejected* (MOB-078, "I'll remove the checkbox," slider "very confusing").
- **System-status visibility design** — *deferred* (MOB-090, "Probably not for this").
- **Full NHS error summary** — *deferred* to post-MVP (MOB-097).

---

## 10. Prioritisation-ready backlog

| ID | Platform | Theme | Title | Type | Evidence strength | Stated urgency | Expected impact | Estimated effort | Recommended owner |
| -- | -------- | ----- | ----- | ---- | ----------------- | -------------- | --------------- | ---------------- | ----------------- |
| MOB-078 | Platform not stated | PDP goal creation | Replace confusing slider/checkbox for adding a PDP goal | UX improvement | Strong | Not stated | Not stated | Not stated | Mobile UX |
| MOB-079 | Platform not stated | PDP goal creation | Remove "Quick Pick" review-date shortcuts | UX improvement | Strong | Not stated | Not stated | Not stated | Mobile UX |
| MOB-080 | Platform not stated | PDP goal creation | Tick/"Confirm" affordance on date set | UI improvement | Moderate | Not stated | Not stated | Not stated | UI Design |
| MOB-081 | Platform not stated | PDP goal creation | Consolidate duplicate "Add" buttons | UX improvement | Strong | Not stated | Not stated | Not stated | Mobile UX |
| MOB-082 | Platform not stated | PDP goal creation | Simplify note-deletion messaging | Content or terminology | Moderate | Low | Not stated | Not stated | UI Design |
| MOB-083 | Platform not stated | Editing/saving | Discard-changes safety confirmation on X | UX improvement | Moderate | Not stated | Not stated | Not stated | Mobile UX |
| MOB-084 | Platform not stated | Editing/saving | Clarify Version History | UX improvement | Weak | Not stated | Not stated | Not stated | Mobile UX |
| MOB-085 | Platform not stated | Editing/saving | Simplify two-level status model | UX improvement | Strong | Not stated | Not stated | Not stated | Product |
| MOB-086 | Platform not stated | Editing/saving | Two persisting save buttons (Save for Later + Complete) | Decision | Strong | High | Not stated | Not stated | Product |
| MOB-087 | Platform not stated | Editing/saving | Remove edit-lock after completion | Decision | Strong | Not stated | Not stated | Not stated | Product |
| MOB-088 | Platform not stated | Editing/saving | Finalise save-action terminology | Open question | Strong | Not stated | Not stated | Not stated | Product |
| MOB-089 | Platform not stated | Editing/saving | Status mapping (Needs review / Completed) | Decision | Strong | Not stated | Not stated | Not stated | Product |
| MOB-090 | Platform not stated | Editing/saving | Design system-status visibility | UX improvement | Moderate | Not stated | Not stated | Not stated | Mobile UX |
| MOB-091 | Platform not stated | Editing/saving | Merge second confirmation screen into review screen | UX improvement | Moderate | Not stated | Not stated | Not stated | Mobile UX |
| MOB-092 | Platform not stated | Editing/saving | Auto-return to homepage after save/complete | Decision | Moderate | Not stated | Not stated | Not stated | Mobile UX |
| MOB-093 | Platform not stated | Dashboard | Personalise dashboard with user's name | Feature request | Moderate | Not stated | Not stated | Not stated | UI Design |
| MOB-094 | Platform not stated | Dashboard | Remove date/time from homepage | Decision | Strong | Not stated | Not stated | Not stated | UI Design |
| MOB-095 | Platform not stated | Dashboard | Keep date on the entry/record view | UX improvement | Moderate | Not stated | Not stated | Not stated | UI Design |
| MOB-096 | Platform not stated | Entries list | Fix entry not reflecting in In-Progress list | Bug | Strong | Not stated | Not stated | Not stated | Backend Engineering |
| MOB-097 | Platform not stated | Entries list / completion | NHS-style error for missing review date (MVP) | Accessibility | Strong | Not stated | Not stated | Not stated | Mobile UX |
| MOB-098 | Platform not stated | Entries list / completion | Don't silently disable Mark as Done | UX improvement | Moderate | Not stated | Not stated | Not stated | Mobile UX |
| MOB-099 | Platform not stated | Entries list | Copy/export portfolio as text or PDF | Feature request | Moderate | Not stated | Not stated | Not stated | Product |
| MOB-100 | Platform not stated | Entries list | Clarify Archive vs Delete (+ PII deletion) | UX improvement | Strong | Not stated | Not stated | Not stated | Mobile UX |
| MOB-101 | Platform not stated | Entries list | Show created/updated timestamps on rows | Feature request | Moderate | Not stated | Not stated | Not stated | UI Design |
| MOB-102 | Platform not stated | PDP tab | Make linked case tappable from a PDP goal | Feature request | Moderate | Not stated | Not stated | Not stated | Mobile UX |
| MOB-103 | Platform not stated | Dashboard | Align primary CTA to "Record a Case" | Content or terminology | Weak | Not stated | Not stated | Not stated | UI Design |

> No composite priority score is computed — the transcript provides no explicit prioritisation criteria, effort estimates, or impact figures. Owners are analytical routing suggestions only.

---

## Coverage note

- **Transcript reviewed in full:** lines 1–243 (`labelled_transcript-mobile-2.txt`).
- **Lines 226–242** are off-topic (a break/lunch discussion) and contain no actionable product content; line 232 ("we've only got the screen and the homepage to do") is a scope aside, not a distinct backlog item.
- **26 consolidated items** captured (MOB-078 – MOB-103), continuing the ID sequence from transcript 1.
- Every item is **`Platform not stated`**; the "desktop"/viewport references are flagged as an open platform question rather than treated as evidence of iOS/Android.
- Positive signals not tracked as backlog items: the Doctor/UX Designer liked the green/amber/In-Progress status colours (L216), and the "check and review what we captured" framing was praised (L106) — recorded here as validation, not as work.
