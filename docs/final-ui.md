# Portfolio Assistant — Final UI/UX Specification

> Mobile-first portfolio capture app for UK GP registrars (ST1–ST3).
> Core workflow: **capture → convert → polish → export → track**.

---

## 0) Backend Readiness Snapshot

### Available now

- User auth (register, login, guest, JWT)
- Create artefact + auto-create linked conversation
- Send messages (text or audio) to a conversation
- Audio upload via presigned S3 URL → AssemblyAI transcription with PII redaction → LLM cleaning
- Poll message processing status
- Portfolio Graph: classify → check completeness → ask follow-up → tag capabilities → reflect → generate PDP → save
- List artefacts (paginated, status filter)
- List messages (cursor-based)
- GP specialty config (14 entry types, 50+ capabilities, section templates)

### Not built yet

- Artefact PATCH (edit title, reflection sections, capabilities, tags)
- PDP action CRUD (list, update status, edit, delete)
- Conversation status update (mark as converted/archived)
- Artefact status transitions (NEEDS_REVIEW, READY_TO_EXPORT)
- Dashboard aggregation queries
- Full-text search on conversations or artefacts
- PDF generation and export history
- Artefact versioning
- Pre-export identifier scan on artefact text
- WebSocket/SSE for real-time processing updates

---

## 1) Information Architecture & Navigation

### Design decision: 4 tabs, not 5

The original spec has 5 tabs (Home, Conversations, Artefacts, PDP, Dashboard). Reduced to 4 for MVP:

- **Dashboard is redundant with Home** at low data volumes. A registrar with 8 artefacts doesn't need a dedicated analytics tab. Summary stats merge into Home.
- **PDP actions are always tied to artefacts.** A standalone PDP tab makes sense eventually, but for MVP, PDP actions are accessed through their parent artefact and surfaced on Home as "due soon" nudges.
- **Conversations don't need a dedicated tab.** The backend creates a conversation automatically when an artefact is created (1:1). Exposing conversations as a separate top-level entity creates a mental model problem: "Is my work in the conversation or the artefact?" The entry point is always "start a new entry" or "resume an entry," and the conversation lives inside the artefact.

### Bottom tabs (4)

| Tab | Label | Purpose |
|-----|-------|---------|
| 1 | **Home** | Quick start + what needs attention + stats |
| 2 | **Entries** | All artefacts (portfolio entries) with status filters |
| 3 | **PDP** | Personal development actions across all entries |
| 4 | **Profile** | Settings, help, privacy, about |

### Terminology change

"Artefacts" becomes **"Entries"** throughout the UI. Registrars think in terms of portfolio entries, not artefacts. "Artefact" is FourteenFish jargon; "entry" is plainer.

### Why this is better

The original 5-tab structure fragments the user's mental model. A registrar after a clinic thinks: "I need to log something." They don't think: "Should I start a conversation or create an artefact?" By making the entry the primary object (with the conversation embedded inside it), the app matches how they think. One object, one lifecycle: **draft → in review → ready → exported**.

> **Label:** `Available now` for navigation shell. Tab 3 (PDP) is `UI-first (backend needed)` — requires PDP list/filter endpoint.

---

## 2) Home Screen

### Layout: scrollable, 4 modules

**Header**

- Left: "Portfolio" (app name)
- Right: profile avatar (taps to Profile tab)
- Subheader: "Saturday 1 March" + "All changes saved"

---

#### Module A — Start new entry

`Available now`

Full-width card, visually prominent, always first.

```
┌─────────────────────────────────┐
│  What did you learn today?      │
│                                 │
│  [🎙  Talk about it]  ← primary │
│  [✏️  Write instead]  ← secondary│
│                                 │
│  30–90 seconds is enough.       │
│  You can refine it later.       │
└─────────────────────────────────┘
```

**Behaviour:** Tapping either button creates a new artefact (via `POST /artefacts`) with auto-generated title, which also creates a linked conversation. The user lands directly in the conversation chat screen inside that entry.

**Design decision:** No context chips (Clinical, Teaching, QI...) on the home card. Context selection happens during the convert step, not at capture time. At capture time, the registrar just wants to talk. Adding chips here creates hesitation ("which one am I?") at the moment they should be speaking.

---

#### Module B — Continue recent entries

`Available now`

Horizontal scroll of up to 5 entry cards, sorted by last updated.

```
┌────────────┐ ┌────────────┐ ┌────────────┐
│ Chest pain  │ │ Safeguarding│ │ ENT referral│
│ safety-net  │ │ concern     │ │             │
│             │ │             │ │             │
│ Draft       │ │ Needs review│ │ Draft       │
│ 2h ago      │ │ Yesterday   │ │ 3 days ago  │
│             │ │             │ │             │
│ [Continue]  │ │ [Review]    │ │ [Continue]  │
└────────────┘ └────────────┘ └────────────┘
```

**CTA label changes by status:**

- "Continue" for drafts → takes to conversation
- "Review" for needs-review → takes to artefact editor
- "Export" for ready-to-export → takes to artefact editor scrolled to checks

**Empty state:**

> "No entries yet. After your next clinic, tap the mic and talk through what happened."

> **Note:** CTA routing by status is `UI-first (backend needed)` — requires artefact status values NEEDS_REVIEW and READY_TO_EXPORT.

---

#### Module C — Actions due soon

`UI-first (backend needed)`

Compact list, max 3 items.

```
PDP actions due soon
─────────────────────
◻ Complete safeguarding Level 3    Due in 5 days
◻ Reflect on palliative case       Due in 12 days
◻ Book DOPS with supervisor        Overdue

[View all PDP actions →]
```

**Empty state:**

> "No actions due in the next 14 days. Actions are created when you convert an entry."

> **Requires:** `GET /pdp-actions?status=PENDING&sort=timeframe&limit=3` endpoint.

---

#### Module D — Progress snapshot

`UI-first (backend needed)`

Three simple stat cards, no charts.

```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ This week     │ │ Entries       │ │ Capabilities  │
│               │ │               │ │               │
│ 4 captured    │ │ 2 to review   │ │ 9 of 13       │
│ 2 exported    │ │ 1 ready       │ │ covered       │
└──────────────┘ └──────────────┘ └──────────────┘
```

Tapping any card navigates to the relevant filtered view in Entries or PDP tab.

> **Requires:** Aggregation endpoints for counts by status, date range, and capability coverage.

---

## 3) Entries List (Tab 2)

### Top bar

- Title: "Entries"
- Search icon (tap to expand search field)
- Filter icon (opens bottom sheet)

### Status segmented control

Horizontally scrollable pills, one active at a time:

`All` · `Draft` · `Needs review` · `Ready to export` · `Exported`

> **Note:** `Draft` and `Exported` filters work now (map to DRAFT and SUBMITTED). `Needs review` and `Ready to export` are `UI-first (backend needed)`.

### List items

```
┌─────────────────────────────────────────┐
│ Safeguarding referral — reflection      │
│ Clinical encounter · Updated 2h ago     │
│ Tags: Safeguarding, Communication       │
│                                    [Needs review] │
└─────────────────────────────────────────┘
```

Each item shows: title, entry type, last updated, tags (if any), status pill. Tap opens the entry detail. Long-press or swipe reveals Archive / Delete.

### Search and filtering

For MVP, keep this minimal:

- **Search:** client-side filter on title and tags (no backend full-text search needed for <100 entries)
- **Filter sheet:** Status only. Add tag and date filters post-MVP.

> **Label:** Basic list is `Available now`. Client-side search is `Available now`. Advanced filters are `Out of scope for MVP`.

---

## 4) Entry Detail — The Core Screen

This is the most important screen. It has two modes: **Capture** (conversation) and **Review** (structured artefact). The mode depends on the entry's status.

### Design decision: unified entry screen with two phases

The original spec treats Conversation Detail and Artefact Detail as completely separate screens. This creates a jarring transition and a confusing mental model ("Where did my conversation go?"). Instead, the entry is one screen with a phase indicator:

```
┌─────────────────────────────────────┐
│ ← Safeguarding referral        ••• │
│ ──────────────────────────────────  │
│ [Capture]  [Review]  ← phase tabs  │
│                                     │
```

**Capture tab** shows the conversation chat. **Review tab** shows the structured artefact sections. The user can switch between them at any time. The "Convert to entry" action populates the Review tab; it doesn't navigate away.

**Why this is better:** The registrar never loses context. They can flip back to "what did I actually say?" while editing their reflection. The conversation and the structured output are two views of the same entry, not two separate objects.

> **Label:** Navigation structure is `Available now` (both conversation and artefact data exist). The tab switching is pure frontend.

---

### 4a) Capture Phase (conversation chat)

#### Chat area

Messages displayed as a chat thread:

```
┌─────────────────────────────────────┐
│ You (voice, 1:23)            14:02  │
│ I saw a patient today with chest    │
│ pain, turned out to be...           │
│                                     │
│ Portfolio Assistant             AI  │
│ That sounds like an important       │
│ learning point. What was your       │
│ differential diagnosis?             │
│                                     │
│ You                          14:05  │
│ I was thinking PE initially but...  │
└─────────────────────────────────────┘
```

- User messages show "(voice, 1:23)" badge if from audio, with duration
- AI messages have a subtle "AI" badge — never pretend to be human
- Processing state: message shows a shimmer/skeleton with "Transcribing..." or "Processing..." until COMPLETE

> **Label:** `Available now` — messages endpoint with role, type, content, and processing status all exist.

#### Composer

```
┌─────────────────────────────────────┐
│ [Summarise] [Follow-up] [Reflect]   │  ← AI action pills
├─────────────────────────────────────┤
│ [🎙]  Type a message...      [Send] │  ← input bar
└─────────────────────────────────────┘
```

- Mic button is visually prominent (filled, coloured) — text input is secondary
- AI action pills trigger the portfolio graph's specific nodes
- Tapping "Summarise" sends a system-level request that returns an AI summary message

#### Voice recording overlay

```
┌─────────────────────────────────────┐
│                                     │
│         ∿∿∿∿∿∿∿∿∿∿∿∿              │
│           0:34                      │
│                                     │
│  Avoid names, DOB, and addresses.   │
│                                     │
│  [Cancel]  [Pause]  [Done]          │
└─────────────────────────────────────┘
```

On "Done," the audio uploads to S3 and the message enters the processing pipeline. The user sees their message immediately with a "Transcribing..." state, then it resolves to the cleaned transcript.

**Design decision:** No transcript review sheet after recording. The cleaning pipeline already fixes medical terms. If the user wants to correct something, they can send a follow-up message ("I meant amoxicillin, not amoxycillin") and the AI handles it in context. Post-MVP, add an optional "review before sending" toggle in settings.

> **Label:** Voice recording + upload + transcription + cleaning is `Available now`. AI action pills (summarise, follow-up, reflect) map to graph nodes — `Available now` via `POST /conversations/:id/analysis`.

#### Convert banner

After sufficient content (4+ messages or 60+ seconds of audio), a sticky banner appears:

```
┌─────────────────────────────────────┐
│ Ready to build your portfolio entry?│
│                                     │
│ [Convert to entry →]    [Not yet]   │
└─────────────────────────────────────┘
```

> **Label:** Content threshold check is frontend logic. Convert action triggers the full portfolio graph — `Available now`.

---

### 4b) Convert Flow (review gate)

When the user taps "Convert to entry," a bottom sheet sequence begins (not full-screen modals).

#### Sheet 1: Safety check

```
┌─────────────────────────────────────┐
│ Quick check before we continue      │
│                                     │
│ ☑ I've avoided patient names,       │
│   DOB, addresses, and NHS numbers   │
│                                     │
│ ☑ This is for reflective learning,  │
│   not clinical decisions            │
│                                     │
│ [Continue →]                        │
│                                     │
│ What counts as identifiable? ↗      │
└─────────────────────────────────────┘
```

**Design decision:** Collapsed from 3 checkboxes to 2. The original had "No screenshots or identifiable details" which overlaps with the first item. Two taps, not three.

**After 5+ conversions:** Collapse to a single confirmation: "I've checked for identifiers. [Continue →]" with a "Show full checklist" link.

> **Label:** Frontend only. PII redaction already happened at transcription — this is a human responsibility gate.

#### Sheet 2: Entry type selection

The portfolio graph's classify node runs, classifies the conversation, and presents options:

```
┌─────────────────────────────────────┐
│ What type of entry is this?         │
│                                     │
│ Based on your conversation:         │
│                                     │
│ ● Clinical encounter (recommended)  │
│ ○ Communication & consultation      │
│ ○ Significant event                 │
│ ○ Other...                          │
│                                     │
│ [Generate entry →]                  │
└─────────────────────────────────────┘
```

**Design decision:** No "Choose content" step (include full conversation vs. select parts). Always include the full conversation. Partial selection adds complexity for a rare use case.

> **Label:** `Available now` — this is the graph's classify → present_classification interrupt point, already built.

#### Sheet 3: Generating

```
┌─────────────────────────────────────┐
│ Building your entry...              │
│                                     │
│ ✓ Structuring sections              │
│ ✓ Mapping capabilities              │
│ ● Writing reflection...             │
│ ○ Suggesting PDP actions            │
│                                     │
│ This usually takes 10–15 seconds.   │
└─────────────────────────────────────┘
```

Honest progress. No spinners without context. Each step ticks as the graph progresses.

**Error state:**

```
┌─────────────────────────────────────┐
│ Something went wrong                │
│                                     │
│ We couldn't generate your entry.    │
│ Your conversation is safe.          │
│                                     │
│ [Try again]  [Save as draft]        │
└─────────────────────────────────────┘
```

> **Label:** `Available now` — graph execution with checkpoint recovery. Step-by-step progress is `UI-first (backend needed)` (currently polling only). For MVP, show an indeterminate progress bar with reassurance text and resolve when polling detects completion.

**On completion:** The bottom sheet dismisses, and the Review tab auto-selects, showing the populated artefact.

---

### 4c) Review Phase (artefact editor)

The Review tab shows the structured entry with section navigation.

#### Section chips (horizontal scroll, sticky below header)

```
[Overview] [Reflection] [PDP] [Capabilities] [Evidence] [Checks]
```

Each chip shows a status dot: green (complete), amber (needs attention), grey (empty).

---

#### Section 1: Overview

```
┌─────────────────────────────────────┐
│ Overview                            │
│                                     │
│ Summary                             │
│ ┌─────────────────────────────────┐ │
│ │ A 45-year-old patient presented │ │
│ │ with acute chest pain. Initial  │ │
│ │ differential included PE and... │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Key learning points                 │
│ • Importance of structured          │
│   differential diagnosis            │
│ • Safety-netting communication      │
│ • When to escalate vs reassure      │
│                                     │
│ Entry type: Clinical encounter      │
│ Date: 1 March 2026                  │
└─────────────────────────────────────┘
```

All fields are inline-editable. Tap any text block to edit.

> **Label:** Data is `Available now` (artefact schema has title, tags, artefactType). Editing is `UI-first (backend needed)` — requires `PATCH /artefacts/:id` endpoint.

---

#### Section 2: Reflection

Uses the structured model from the GP templates (e.g., "What happened / What I learned / What I'll do differently").

```
┌─────────────────────────────────────┐
│ Reflection                          │
│                                     │
│ What happened                       │
│ ┌─────────────────────────────────┐ │
│ │ The patient presented with...   │ │
│ └─────────────────────────────────┘ │
│                            [Edit ✎] │
│                                     │
│ ┌ AI suggestion ─────────────────┐  │
│ │ "Consider also reflecting on   │  │
│ │  your emotional response to    │  │
│ │  the diagnostic uncertainty."  │  │
│ │                                │  │
│ │ [Accept]  [Dismiss]            │  │
│ └────────────────────────────────┘  │
│                                     │
│ What I learned                      │
│ ┌─────────────────────────────────┐ │
│ │ I reinforced the importance of │ │
│ │ systematic assessment...        │ │
│ └─────────────────────────────────┘ │
│                                     │
│ What I'll do differently            │
│ ┌─────────────────────────────────┐ │
│ │ Next time I will...            │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

- AI suggestions collapsed by default — tap to expand
- Accept inserts the text; Dismiss hides permanently
- "Regenerate this section" in overflow menu per section (with warning: "This will replace the current text")

> **Label:** Generated reflection data is `Available now` (graph's reflect node populates `artefact.reflection[]`). Editing and regeneration are `UI-first (backend needed)`.

---

#### Section 3: PDP Actions

```
┌─────────────────────────────────────┐
│ PDP Actions                         │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Complete safeguarding Level 3   │ │
│ │ Due: 15 March 2026              │ │
│ │ Status: [Not started ▾]        │ │
│ │                        [Edit ✎] │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Book DOPS with supervisor       │ │
│ │ Due: 20 March 2026              │ │
│ │ Status: [Not started ▾]        │ │
│ │                        [Edit ✎] │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [+ Add action]                      │
│                                     │
│ AI suggested 1 more action          │
│ [View suggestion]                   │
└─────────────────────────────────────┘
```

- Status dropdown: Not started → In progress → Done
- Each action is editable (title, due date, notes)
- AI-suggested actions appear as dismissable cards below

> **Label:** PDP data generated by graph is `Available now` (saved to `pdp_actions` collection). Editing, status changes, and adding new actions are `UI-first (backend needed)` — requires full CRUD on `pdp-actions`.

---

#### Section 4: Capability Mapping

```
┌─────────────────────────────────────┐
│ Capabilities                        │
│                                     │
│ Mapped from your conversation:      │
│                                     │
│ ☑ Communication & consultation      │
│   "discussed safety-netting with    │
│    the patient and their family"    │
│                                     │
│ ☑ Clinical management               │
│   "formed a differential of PE,     │
│    ACS, and musculoskeletal cause"   │
│                                     │
│ ☐ Data handling (low confidence)    │
│   "mentioned reviewing blood        │
│    results" — tap to confirm        │
│                                     │
│ [+ Add capability]                  │
└─────────────────────────────────────┘
```

- Each capability shows the evidence quote from the conversation
- Low-confidence items are unchecked by default with an explanation
- "Why was this suggested?" expandable per item
- Tap "+ Add capability" → picker from the full GP capability list

> **Label:** Capability data with evidence is `Available now` (graph's tag_capabilities node). Editing (tick/untick, add more) is `UI-first (backend needed)`.

---

#### Section 5: Evidence / Notes

```
┌─────────────────────────────────────┐
│ Evidence & Notes                    │
│                                     │
│ What evidence will you upload?      │
│ ┌─────────────────────────────────┐ │
│ │ Feedback form from supervisor   │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Setting / Supervisor (optional)     │
│ ┌─────────────────────────────────┐ │
│ │ GP surgery, Dr. Patel           │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Private note (not exported)         │
│ ┌─────────────────────────────────┐ │
│ │ Felt uncertain during this —    │ │
│ │ discuss at next tutorial.       │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

> **Label:** `UI-first (backend needed)` — artefact schema needs these additional fields.

---

#### Section 6: Pre-Export Checks

```
┌─────────────────────────────────────┐
│ Export Checklist                     │
│                                     │
│ ✅ Reflection sections complete     │
│ ✅ At least one capability mapped   │
│ ⚠️  PDP action missing due date     │
│ ✅ No identifiers detected          │
│                                     │
│ Fix 1 issue before exporting.       │
└─────────────────────────────────────┘
```

Computed client-side from the artefact data. The "No identifiers detected" check is a simple regex scan (dates, NHS number patterns, postcodes) run in the browser — not a guarantee, but a helpful nudge.

> **Label:** Frontend logic — `Available now` for checks based on existing artefact fields.

---

#### Sticky bottom CTA

Always visible at the bottom of the Review tab:

```
┌─────────────────────────────────────┐
│ [Export to PDF]                      │  ← primary, full-width
└─────────────────────────────────────┘
```

Disabled with helper text if checks fail: "Complete required sections to export."

> **Label:** `UI-first (backend needed)` — PDF generation doesn't exist yet.

---

## 5) Export to PDF

### Step 1: Export options (bottom sheet)

```
┌─────────────────────────────────────┐
│ Export to PDF                        │
│                                     │
│ Template: FourteenFish-friendly     │
│                          [Change ▾] │
│                                     │
│ Include:                            │
│ ☑ Capability mapping                │
│ ☑ PDP actions                       │
│ ☐ Evidence notes                    │
│                                     │
│ [Generate PDF →]                    │
└─────────────────────────────────────┘
```

**Design decision:** Default to the last-used template. Don't show 3 template options on every export — most users will always pick the same one. "Change" is there for the 10% who want it.

### Step 2: Generating

```
┌─────────────────────────────────────┐
│ Creating your PDF...                │
│ ████████████░░░░░░░░                │
│                                     │
│ Exporting: Entry v1 (saved 14:22)   │
└─────────────────────────────────────┘
```

### Step 3: Done

```
┌─────────────────────────────────────┐
│ ✓ PDF ready                         │
│                                     │
│ Safeguarding_reflection_2026-03.pdf │
│                                     │
│ [Download]  [Share]  [Copy text]    │
│                                     │
│ Upload this to FourteenFish to      │
│ complete your portfolio entry.      │
└─────────────────────────────────────┘
```

### Error state

```
┌─────────────────────────────────────┐
│ Export failed                        │
│                                     │
│ Your entry is safe — nothing was    │
│ lost.                               │
│                                     │
│ [Try again]  [Copy as text]         │
└─────────────────────────────────────┘
```

"Copy as text" is the MVP fallback — copies all sections as formatted plain text. This works even if PDF generation fails.

> **Label:** Entire export flow is `UI-first (backend needed)`. "Copy as text" fallback could ship as `Available now` (frontend formats artefact data as text).

---

## 6) PDP Tab (Tab 3)

### Layout

```
┌─────────────────────────────────────┐
│ PDP Actions                         │
│                                     │
│ [Due soon] [Overdue] [Done] [All]   │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Complete safeguarding Level 3   │ │
│ │ From: Safeguarding referral     │ │
│ │ Due: 15 March · Not started     │ │
│ │                    [Mark done]  │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Book DOPS with supervisor       │ │
│ │ From: Chest pain reflection     │ │
│ │ Due: 20 March · Not started     │ │
│ │                    [Mark done]  │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Overdue (1)                         │
│ ┌─────────────────────────────────┐ │
│ │ Reflect on palliative case      │ │
│ │ From: Palliative care entry     │ │
│ │ Due: 20 Feb · ⚠️ Overdue        │ │
│ │              [Mark done] [Edit] │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

Each action links back to its parent entry. "Mark done" triggers a confirmation: "Mark as completed? You can undo this."

**Empty state:**

> "No PDP actions yet. They're created automatically when you convert an entry."

> **Label:** `UI-first (backend needed)` — requires `GET /pdp-actions` with filters (status, due date sorting) and `PATCH /pdp-actions/:id` for status updates.

---

## 7) Trust & Safety UX

Woven throughout, not bolted on.

### During capture

- Persistent subtle reminder near mic button: "Avoid patient names, DOB, and addresses"
- AssemblyAI redacts PII automatically (already built) — but never tell the user "we handle it for you." The responsibility message stays.

### On AI messages

- Small "AI" badge + on first use, a one-time tooltip: "AI suggestions may be incomplete. You're responsible for accuracy."
- Flag button on every AI message → sheet with: "Incorrect clinical content / Privacy concern / Unhelpful / Other"
- If the AI isn't sure: "I'm not certain about this — verify against local guidelines."

### Before conversion

- Safety checklist (described in Section 4b)

### Before export

- Pre-export checks with identifier scan
- "We can't guarantee detection. Review carefully before uploading."

> **Label:** PII redaction at transcription is `Available now`. Client-side identifier scan is frontend. Flag/report is `UI-first (backend needed)` (needs a reporting endpoint, or MVP: mailto link).

---

## 8) Autosave & Status Cues

- Every text edit debounces and saves after 1 second of inactivity
- Header shows: "Saving..." → "Saved" (subtle, never blocks interaction)
- Messages are saved immediately on send (already built)
- If offline: "You're offline. Changes will save when you reconnect." (banner)

> **Label:** Message saving is `Available now`. Artefact field autosave is `UI-first (backend needed)` (requires PATCH endpoint). Offline handling is `Out of scope for MVP`.

---

## 9) Profile Tab (Tab 4)

Simple settings screen:

```
┌─────────────────────────────────────┐
│ Profile                             │
│                                     │
│ Sam Williams                        │
│ sam.williams@nhs.net                │
│                                     │
│ ─────────────────────────────────── │
│                                     │
│ Settings                            │
│ Privacy & data                      │
│ Help & feedback                     │
│ About                               │
│                                     │
│ [Log out]                           │
└─────────────────────────────────────┘
```

**Privacy & data** includes:

- "We store your conversations and artefacts so you can edit and export them."
- "PDFs you generate are stored on your device and in export history metadata."
- "Confidential notes are never included in exports."

> **Label:** `Available now` for auth info. Settings content is frontend.

---

## 10) Accessibility & Inclusivity

- **One-handed use:** bottom nav, sticky primary CTAs, thumb-friendly chips
- **Large text support:** dynamic type, reflowing layouts, no fixed-height text areas
- **Contrast:** WCAG AA, clear focus states, non-colour status indicators (icons + labels)
- **Voice accessibility:** large record controls, pause/resume, transcript is always editable
- **Fatigue-friendly:** defaults to concise summaries, collapsible AI suggestions, minimal mandatory fields until export

---

## 11) Key Improvements Over Original Spec

| Original | Revised | Why |
|---|---|---|
| 5 bottom tabs | 4 tabs | Dashboard merged into Home; Conversations absorbed into Entries |
| Conversations as separate top-level entity | Conversations embedded in Entries | One object, one lifecycle — reduces confusion |
| Transcript review sheet after recording | Direct send with async processing | Removes friction from voice-first capture |
| 3-item safety checklist every time | 2 items, collapsing to 1 after 5 uses | Respects repeat users |
| "Choose content" step in conversion | Always include full conversation | Removes a decision point that rarely varies |
| Context chips on Home screen | Context selected during conversion | Don't make them think at capture time |
| "Artefact" terminology | "Entry" | Plain language for registrars |
| Separate Conversation Detail + Artefact Detail screens | Unified screen with Capture/Review tabs | Maintains context, reduces navigation |
| 3 export templates shown every time | Default to last-used, "Change" link for exceptions | Reduce decision fatigue on repeat use |

---

## 12) Smallest Backend Changes for Maximum UX Value

Ranked by impact:

| Priority | Change | Unlocks |
|---|---|---|
| **1** | `PATCH /artefacts/:id` — update title, reflection, capabilities, tags | The entire artefact editing experience |
| **2** | PDP action CRUD — `GET /pdp-actions` (filtered), `PATCH /pdp-actions/:id`, `POST /pdp-actions`, `DELETE /pdp-actions/:id` | PDP tab, Home "due soon" module, "Mark done" |
| **3** | Add `NEEDS_REVIEW` and `READY_TO_EXPORT` to ArtefactStatus enum | Status-based filtering and CTAs across the app |
| **4** | Aggregation endpoint — `GET /dashboard/summary` (counts by status, capability coverage, weekly activity) | Home progress snapshot |
| **5** | PDF generation service (server-side HTML→PDF or client-side with a library like react-pdf) | Export flow — the entire reason the app exists |
| **6** | `PATCH /conversations/:id/status` — mark as CONVERTED | Clean lifecycle management |

Items 1–3 are likely a few days of work each and unlock the majority of the editing and review experience. Item 5 (PDF) is the critical path feature that doesn't exist at all.

---

## 13) Reusable Component Inventory

| Component | Used in |
|-----------|---------|
| **Status pill** (Draft, Needs review, Ready to export, Exported) | Entry lists, headers, home cards |
| **Bottom sheet** | Filters, export options, safety check, flag/report |
| **Sticky CTA button** | Entry detail (Export to PDF), convert flow |
| **Scroll chips** | Section nav, status filters |
| **AI suggestion panel** (Accept/Dismiss) | Reflection sections, PDP actions |
| **Voice recorder overlay** (waveform + controls) | Conversation composer |
| **Progress screen** (step-by-step) | Artefact generation, PDF export |
| **Entry card** (horizontal scroll) | Home module B |
| **PDP action card** | PDP tab, artefact PDP section, Home module C |
| **Stat card** | Home module D |
| **Empty state card** | All list views and modules |
| **Phase tabs** (Capture / Review) | Entry detail |
| **Confidence tag** | Capability mapping suggestions |
| **Identifier warning banner** | Safety checklist, pre-export checks |

---

## 14) Risks & Assumptions

- **Assumption:** Registrars will predominantly use voice, not text. If wrong, the text input path needs more prominence and the transcript review step may need to return.
- **Assumption:** One conversation per artefact is sufficient. The backend enforces this (1:1). If registrars want to merge multiple conversations into one entry, this model breaks.
- **Risk:** The portfolio graph takes 10–15 seconds. On slow connections this could feel like 30+. The "Copy as text" fallback is essential.
- **Risk:** Without versioning (not built), regenerating a reflection section could lose manual edits. For MVP, show a clear warning and require confirmation. Build versioning in the next phase.
- **Risk:** Client-side identifier detection (regex) will produce false positives (dates that aren't DOBs, common names). Frame it as "possible identifiers to review" — never "identifiers found."

---

## 15) Success Metrics (MVP)

1. **Time-to-capture**: median time from Home → first saved conversation message (target: <30s)
2. **Voice adoption rate**: % of conversations started via voice
3. **Conversation completion**: % of conversations that reach "Convert to entry"
4. **Conversion success rate**: % conversions completed without retry/error
5. **Entry completion rate**: % entries reaching "Ready to export"
6. **Export success rate**: % export attempts producing a PDF successfully
7. **Time-to-export**: median time from conversion → first export
8. **Edits per entry**: number of manual edits before export (proxy for AI quality)
9. **PDP adoption**: % entries that create at least one PDP action
10. **Trust signals**: rate of "Flag incorrect/unsafe" reports
