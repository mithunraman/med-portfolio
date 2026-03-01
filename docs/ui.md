## 1) Users & jobs-to-be-done

### Primary users

- **UK GP registrars (ST1–ST3)** using FourteenFish (or similar) to evidence learning quickly after clinics.
- **Supervisors/educators** are indirect users (they receive exported PDF uploads).

### Goals & critical tasks (3–5)

1. **Capture learning fast (post-clinic, low effort)**
   - Start a **voice-first conversation** in seconds.
   - Add quick context (placement, session type) and tags.

2. **Clarify and deepen reflection without writing an essay**
   - Ask the AI to **summarise**, **prompt follow-up questions**, and **suggest reflection structure**.
   - Correct key terms in the transcript (drug names, conditions) with minimal friction.

3. **Convert capture into a structured portfolio ARTEFACT**
   - Review for **patient identifiers**.
   - Choose a template (e.g., “Clinical encounter reflection”, “Leadership/Teaching”, “Audit/QI”) and generate sections.

4. **Review/edit the ARTEFACT to a standard suitable for FourteenFish**
   - Edit reflections, add/adjust **PDP actions**, map **capabilities**, add evidence/notes.
   - Handle required fields and completeness checks.

5. **Export to PDF (primary route) + track PDP**
   - Export a clean PDF, download/share/copy for upload.
   - Track PDP actions due soon and link evidence back to artefacts.

---

## 2) Information architecture & navigation

### Proposed primary navigation (bottom tab bar, mobile-first)

Bottom tabs (5 max for thumb reach; everything else via Home shortcuts + “More” within tabs):

1. **Home** (Workspace)
2. **Conversations**
3. **Artefacts**
4. **PDP**
5. **Dashboard**

**Justification**

- Registrars think in a lifecycle: **capture → convert → polish → export → track**.
- Bottom tabs support one-handed use and rapid switching after clinics.
- **Reflections and Capabilities** live primarily _inside Artefacts_; they also appear as filtered views within Artefacts/Dashboard to avoid tab overload.

### Where “Exports / PDFs” live (integrated into Artefacts)

**Choice:** integrate export history **inside each artefact** + an **Exports filter** within Artefacts.

- In MVP, users usually export _per artefact_ and upload to FourteenFish.
- A separate “Exports” top-level area adds complexity without adding much value early.
- Within **Artefacts**, provide a filter: “Exported” + in-artefact “Export history”.

### Top-level structure

- **Home / Workspace:** Next actions + recents + quick start
- **Conversations:** in-progress capture + search/tags
- **Artefacts:** structured entries (drafts/completed/exported) + export status
- **PDP:** action list, due dates, evidence links
- **Dashboard:** summary counts, coverage gaps, workload view

---

## 3) Home screen (Workspace)

### Layout (scrollable, stacked modules)

**Header**

- Left: “Workspace”
- Right: profile icon (menu sheet: Settings, Help, Privacy, Report issue)
- Subheader: today + subtle reassurance: “All changes saved automatically”

#### Module A — Start new conversation (voice-first)

- Primary card, full width
- **Primary button:** 🎙️ **Start voice conversation**
- Secondary: **Type instead**
- Optional quick context chips: `Clinical`, `Teaching`, `QI`, `Leadership`, `Tutorial`

**Microcopy**

- Title: “Capture something while it’s fresh”
- Helper: “Talk for 30–90 seconds. You can tidy it up later.”

#### Module B — Continue in-progress conversations

- Horizontal list (3–5 items) with status pill + last updated time
- Each item shows: title (auto), tags, “Resume” CTA

**Empty state**

- “No conversations in progress.”
- “Start one after your next clinic—voice works best on the go.”

#### Module C — Artefacts needing attention

Three sub-rows with count + tap-through:

- **Needs review** (e.g., “3”)
- **Ready to export** (e.g., “1”)
- **Recently exported** (e.g., last 7 days)

Each row: small list preview + “See all”

**Microcopy examples**

- “Needs review: add capability mapping before export.”
- “Ready to export: all required sections complete.”

#### Module D — PDP actions due soon

- List of next 3 actions with due date + status + quick “Mark done” (with confirmation)
- CTA: “View all PDP actions”

**Empty state**

- “No PDP actions due in the next 14 days.”
- “Add actions from an artefact when you convert.”

#### Module E — Dashboard snapshot

Simple cards (no charts needed for MVP):

- “Conversations captured this week”
- “Artefacts exported this month”
- “Capabilities covered: 9 / 13” (example)

**Returning user state**

- “Welcome back, Sam”
- “Next best action: Review 2 artefacts before exporting.”

---

## 4) Conversation experience (capture)

### 4a) Conversation list

**Top bar**

- Title: “Conversations”
- Search field: “Search conversations, tags, keywords…”
- Filter icon opens bottom sheet

**Statuses (chips / segmented)**

- **In progress** (default)
- **Converted** (linked to an artefact)
- **Archived**

**Sorting**

- Default: “Last updated”
- Options: “Created date”, “Title A–Z”

**Tags**

- User tags + suggested tags (e.g., `ENT`, `Safeguarding`, `Prescribing`, `Communication`)
- Filter sheet: Status, Tag, Date range, “Has voice”, “Has identifier warning”

**List item design**

- Title (auto-generated): “Chest pain safety-netting — 2 mins”
- Subtitle: “Last updated 14:05 • Tags: Prescribing, Communication”
- Status pill: “In progress”
- Trailing: kebab menu (Rename, Archive, Delete)

### 4b) Conversation detail (chat)

**Header**

- Back
- Title editable inline (tap to rename)
- Status: “In progress”
- Menu: Archive, Delete, View linked artefact (if converted)

**Chat area**

- Messages labelled clearly:
  - User: “You said…”
  - AI: “Portfolio Assistant (AI)” with badge

**Composer (bottom)**

- Voice button (primary)
- Text input “Type or dictate…”
- Attachment (MVP: none, or “Add note” as plain text)

#### Voice input UI (record/pause/cancel)

- Tap mic → **recording state**:
  - Large waveform + timer
  - Buttons: **Pause**, **Finish**, **Cancel**
  - Microcopy: “Avoid patient names, DOB, addresses.”

- On Finish → **Transcript review sheet**:
  - Title: “Review transcript”
  - Editable text with highlight for suspected clinical terms
  - “Play back” (optional MVP) and “Confirm”
  - **Quick correction UI:** tap-highlighted term → suggestions list
    - Example: “amoxycillin” → “amoxicillin”
    - “Keep as is” / “Replace”

#### AI controls (persistent action bar above composer)

Three quick actions as pills:

- **Summarise so far**
- **Ask follow-up questions**
- **Generate reflection prompts**

Example AI microcopy patterns:

- Summarise: “Here’s a brief summary based on what you’ve said so far…”
- Follow-up: “To make this stronger for your portfolio, I’d ask: …”
- Prompts: “Pick one: What went well? What would you do differently? What evidence supports your learning?”

#### Milestone CTA: Convert

A sticky banner appears after a minimum content threshold (e.g., 4 messages or 30 seconds audio):

- “Ready to turn this into a portfolio entry?”
- **Primary:** “Convert to artefact”
- Secondary: “Not yet”

### Autosave & reassurance cues

- Subtle toast: “Saved”
- In header, tiny status: “Saving…” → “Saved just now”

### Trust UX

- AI label + info icon: “AI suggestions may be incomplete. You remain responsible for accuracy.”
- Uncertainty cues:
  - If AI isn’t sure: “I’m not certain—please verify against local guidance.”
  - If clinical safety topic: “Consider checking NICE / local pathways before acting.”

---

## 5) Convert to Artefact (transition + review gate)

### Step-by-step conversion flow

**Step 1: Pre-conversion safety checklist (modal, must complete)**
Title: “Before you convert”
Checklist items (tick-to-confirm):

- “I’ve removed patient identifiers (names, DOB, address, NHS number).”
- “No screenshots or identifiable details are included.”
- “This is for reflective learning, not clinical decision support.”

Actions:

- **Primary:** “Continue”
- Secondary: “Review conversation”

Helpful link: “What counts as identifiable?” (opens short sheet)

**Step 2: Choose what to include**
Screen: “Choose content”

- Toggle: “Include full conversation” (default on)
- Option: “Select parts” → opens message picker with checkboxes + preview
- Field: “Context” (optional): “Placement, clinic type, supervisor…” (adds to artefact header)

**Step 3: Template choice**
Screen: “Pick a template”
Cards:

- “Clinical encounter reflection”
- “Communication & consultation”
- “QI / Audit”
- “Teaching / Learning event”
- “Leadership / Teamworking”

Microcopy: “Templates shape headings to suit FourteenFish-style entries.”

**Step 4: Generate**
Progress state:

- Title: “Creating your artefact…”
- Subtext: “Drafting reflection, PDP actions and capability mapping.”
- Spinner + steps list (non-magic, honest):
  - “Structuring sections”
  - “Suggesting PDP actions”
  - “Drafting capability mapping”

Failure/retry:

- Error: “We couldn’t generate that just now.”
- Buttons: **Retry**, “Try a simpler template”, “Save as draft notes”

### What happens to the conversation after conversion

- Conversation becomes **Converted** and remains **editable**, but changes trigger a prompt:
  - “This conversation is linked to an artefact. Update the artefact draft too?”
  - Options:
    - **Regenerate from latest conversation** (creates a new artefact version)
    - “Keep artefact unchanged”

- Conversation shows a **linked artefact banner**: “Linked to: Artefact v1 (Draft)”

---

## 6) Artefact experience (structured portfolio entry)

### 6a) Artefact list view

Top bar: “Artefacts”

- Search: “Search artefacts, tags, capabilities…”
- Filters: Status, Template type, Tags, Date, “Exported”

**Status pills**

- **Draft**
- **Needs review** (e.g., missing required fields/capability mapping incomplete)
- **Ready to export**
- **Exported** (with last export date)

List item:

- Title: “Safeguarding referral — reflection”
- Meta: “Template: Clinical • Updated 2h ago • Tags: Safeguarding”
- Status pill + small “Exported” icon if applicable

### 6b) Artefact detail (main editing + export surface)

**Sticky header (top)**

- Title (editable)
- Date/time (editable)
- Tags (add/remove)
- Linked conversation chip: “View conversation”
- Status indicator: “Needs review”
- Overflow menu: Rename, Duplicate, Archive, Delete

**Primary CTA (prominent)**

- Bottom sticky button: **Export to PDF**
- If blocked: button disabled with helper text: “Complete required sections to export.”

**Section navigation (within artefact)**

- Mini table-of-contents bar (scroll chips):
  - `Overview` `Reflection` `PDP actions` `Capabilities` `Evidence/Notes` `Checks`

#### Sections (concrete fields)

1. **Overview**

- Auto summary (editable)
- “Learning point” bullet list (editable)
- Microcopy: “Keep it specific and anonymised.”

2. **Reflection(s)**

- Use a structured model by default (Gibbs or “What / So what / Now what”)
- Each subsection has:
  - Text block with inline edit
  - AI suggestion panel (collapsed by default): “Suggested wording”
  - Buttons: **Accept**, “Edit”, “Discard”
  - “Regenerate section” (secondary, with note: “Regenerates from the linked conversation + your edits may be overwritten in this section.”)

3. **PDP actions**

- Action cards with:
  - Action title
  - Due date
  - Status dropdown: Not started / In progress / Done
  - “Evidence note” field
  - Link to capability (optional)

- Add action: “+ Add PDP action”
- AI suggestion: “Suggested actions (3)” with Accept per item

4. **Capability mapping**

- A simple checklist mapped to the relevant GP curriculum categories (MVP approach):
  - “Suggested capabilities” list with confidence tags:
    - “Communication (high confidence)”
    - “Clinical management (medium confidence)”

  - User can:
    - Tick/untick
    - Add more
    - Tap a capability → shows “Why suggested” snippet (from conversation) + edit note

5. **Evidence / Notes**

- Free text: “What evidence will you upload with this?” (e.g., feedback, learning log)
- Optional fields:
  - Supervisor / setting (if registrar wants it in PDF)
  - “Confidential note (not exported)” toggle for personal reminders

6. **Checks (pre-export)**

- Required field list with status:
  - ✅ “Reflection complete”
  - ⚠️ “PDP action has no due date”
  - ✅ “No identifiers detected” (or “Review identifiers” with link)

### Editing model

- Inline edits everywhere
- AI suggestions are clearly labelled and always optional
- Regenerate per section (not whole artefact by default) to reduce risk

### Versioning

- Versions list in overflow menu: “Versions”
- Each version shows:
  - “v1 Generated from conversation (2 Mar 2026)”
  - “v2 Edited by you (3 Mar 2026)”
  - “v3 Regenerated Reflection section (3 Mar 2026)”

- Restore option: “Restore this version” (creates new latest)

---

## 7) Export to PDF (from Artefact)

### Flow A: Tap Export → options

Bottom sheet: “Export to PDF”

- Template dropdown:
  - “FourteenFish-friendly (recommended)”
  - “Compact”
  - “Detailed (includes capability rationale)”

- Toggles:
  - “Include capability mapping”
  - “Include PDP actions”
  - “Exclude confidential notes” (locked on if marked non-exportable)

- Filename field (editable):
  - Default: “2026-03-01_Safeguarding_reflection.pdf”

Primary: **Generate PDF**
Secondary: “Cancel”

### Flow B: Generation state

Screen: “Generating PDF…”

- Progress + reassurance: “You can keep editing—export will use the saved version shown below.”
- Shows snapshot: “Exporting: Artefact v3 (Saved 14:22)”

Failure/retry:

- “Export failed.”
- Buttons: **Retry**, “Change template”, “Download as text” (MVP fallback: copyable text)

### Flow C: PDF preview (mobile-friendly)

- Inline preview with:
  - Top: file name + version
  - Section jump links: Overview / Reflection / PDP / Capabilities

- Banner if something looks off:
  - “Layout warning: Some headings may wrap on smaller screens.”

Actions:

- **Primary:** “Download”
- Secondary: “Share…”
- Tertiary: “Copy sections”

### Flow D: Download/share/copy + export history

After successful export:

- Confirmation: “PDF ready”
- Buttons:
  - **Download PDF**
  - **Share** (system share sheet)
  - **Copy for FourteenFish** (copies key sections as plain text with headings)

- “Export history” list (within artefact):
  - “Export 1 • v3 • FourteenFish-friendly • 1 Mar 2026, 14:25”
  - “View / Re-download”

### Edge cases + microcopy

- **Missing required section**
  - “Can’t export yet: Add at least one PDP action or mark ‘No PDP actions needed’.”

- **Formatting mismatch**
  - “Some bullet lists may appear differently when uploaded. Preview before submitting.”

- **User edits after export**
  - Banner on artefact: “You’ve changed this artefact since the last export.”
  - CTA: **Export new version** (creates Export 2 tied to latest artefact version)

---

## 8) Reflections, PDP Actions, Capabilities (first-class views)

### Reflections

**Within artefact (primary):** structured reflection sections.
**Dedicated view (via Artefacts filter or Dashboard tap-through):**

- List of reflection blocks across artefacts:
  - Status: Draft / Completed / Exported
  - Linked artefact

- Useful because registrars often want “what reflections are still half-written?”

Microcopy:

- “Draft reflections (4) — finish these before ES meeting.”

### PDP Actions (dedicated tab)

- List with filters: Due soon / Overdue / In progress / Done
- Each action card:
  - Title, due date, status, linked artefact(s)
  - “Add evidence note”

- MVP reminder approach:
  - Optional “Add to phone reminders” (system-level export) or “In-app due soon” list only (no push required for MVP)

Microcopy:

- “Due in 7 days”
- “Add a due date to keep this moving.”

### Capability mapping

**Within artefact (primary):** capability checklist + notes.
**Dedicated view (inside Dashboard or via Artefacts filter):**

- Coverage summary:
  - “Capabilities covered: 9 / 13”
  - “Gaps: Leadership, QI”

- Tap a capability → list supporting artefacts + export status

Microcopy:

- “You’re light on QI evidence—convert one conversation using the QI template.”

---

## 9) Dashboard

### MVP content (practical, not gimmicky)

Cards with tap-through:

- **This week**
  - “Conversations captured: 6”
  - “Converted to artefacts: 3”

- **Artefacts**
  - “Needs review: 2”
  - “Ready to export: 1”

- **PDP**
  - “Due soon: 4” / “Overdue: 1”

- **Capabilities**
  - “Covered: 9 / 13”
  - “Top gaps” (2–3 items)

Interactions:

- Tap any card → filtered list (e.g., Artefacts filtered to “Needs review”)
- Capability gap → suggested next action: “Start a QI conversation” (deep link)

---

## 10) Safety, privacy, and trust (UK clinical context)

### Identifier warnings + redaction gates

- Always show a small reminder near voice record and conversion:
  - “Don’t include patient-identifiable information.”

- Before conversion and before export:
  - Run a simple “identifier check” (pattern-based MVP) and present findings as _review prompts_, not guarantees:
    - “We found possible identifiers: ‘Mrs K’, ‘14/02/…’ — please review.”

Microcopy:

- “We can’t guarantee detection. You’re responsible for anonymising.”

### Storage transparency (plain language)

In Settings > Privacy (and linked from conversion checklist):

- “We store your conversations and artefacts so you can edit and export them.”
- “PDFs you generate are stored on your device and in export history metadata (date/template/version).”
- “Confidential notes are never included in exports.”

### Reporting unsafe/incorrect suggestions

On every AI message and in artefact suggestion panels:

- “Flag as incorrect/unsafe” (opens sheet)
  - Options: Incorrect clinical content / Inappropriate tone / Privacy concern / Other
  - “Add details (optional)”

- “Report an issue” in profile menu

---

## 11) Accessibility & inclusivity

- **One-handed use:** bottom nav, sticky primary CTAs, thumb-friendly chips.
- **Large text support:** dynamic type, reflowing layouts, no fixed-height text areas.
- **Contrast:** WCAG AA, clear focus states, non-colour status indicators (icons + labels).
- **Voice accessibility:**
  - Large record controls, pause/resume.
  - Transcript is always editable.
  - Optional playback (MVP if feasible); otherwise clear segmented transcript paragraphs for easy scanning.

- **Fatigue-friendly:** defaults to concise summaries, collapsible AI suggestions, minimal mandatory fields until export.

---

## 12) UX patterns used & rationale

- **Progressive disclosure:** AI controls and section rationale collapsed by default → reduces cognitive load after clinics.
- **Review gates:** identifier checklist + required fields before export → supports safety and portfolio quality.
- **Status-based grouping:** In progress / Needs review / Ready to export / Exported → matches registrar workflow and reduces searching.
- **Recognition over recall:** templates, suggested capabilities, prefilled titles/tags → faster than blank pages.
- **Human-in-the-loop editing:** accept/reject suggestions + regenerate-by-section → preserves trust and prevents overwriting.
- **Versioning:** explicit versions tied to generation/edits/exports → supports supervisor scrutiny and auditability.

---

## 13) Success metrics (MVP)

1. **Time-to-capture**: median time from Home → first saved conversation message (target: <30s).
2. **Voice adoption rate**: % of conversations started via voice.
3. **Conversation completion**: % of conversations that reach “Convert to artefact”.
4. **Conversion success rate**: % conversions completed without retry/error.
5. **Artefact completion rate**: % artefacts reaching “Ready to export”.
6. **Export success rate**: % export attempts producing a PDF successfully.
7. **Time-to-export**: median time from conversion → first export.
8. **Edits per artefact**: number of manual edits before export (proxy for quality + AI usefulness).
9. **Regeneration frequency**: how often “Regenerate section” is used; which sections most.
10. **PDP adoption**: % artefacts that create at least one PDP action; completion rate of PDP actions.
11. **Trust signals**: rate of “Flag incorrect/unsafe suggestion” + qualitative reasons.
12. **Privacy gate compliance**: % exports where identifier check surfaced warnings and user acknowledged review.

---

If you want, I can also provide:

- a **screen-by-screen storyboard list** (Home → Conversation → Convert → Artefact → Export), or
- a **component inventory** (cards, chips, sheets, banners) for faster wireframing.
