# Portfolio Assistant — Build Roadmap

> Sequenced to deliver usable value at the end of every phase.
> Each phase builds on the previous one. No phase ships features that can't be used end-to-end.

---

## Why this order

The roadmap follows the user's journey: **capture → convert → review → export → track**. We build in the order the registrar experiences the app, so each phase produces a testable, demonstrable slice of the product — not isolated pieces that only work when everything is finished.

There are three principles behind the sequencing:

1. **Ship the core loop first.** A registrar should be able to open the app, record a voice note, convert it to a structured entry, and see the result as early as possible. This is the differentiating value. Everything else (editing, export, tracking) layers on top.

2. **Backend before frontend within each phase.** For every feature, the API endpoint must exist before the UI can consume it. Within each phase, backend work is listed first, then frontend. This avoids building UI against mock data that drifts from real behaviour.

3. **Defer what doesn't block the next phase.** Search, versioning, advanced filters, and analytics are useful but don't block any user from completing the core workflow. They come last.

---

## Phase overview

| Phase | Name | What the user can do after this ships |
|-------|------|---------------------------------------|
| **1** | Foundation | Log in, see the app shell, navigate between tabs |
| **2** | Capture | Start a voice/text conversation, see messages transcribed and cleaned |
| **3** | Convert | Turn a conversation into a structured portfolio entry via AI |
| **4** | Review & Edit | Read and edit every section of the generated entry |
| **5** | Export | Generate a PDF or copy text for FourteenFish upload |
| **6** | Track | Manage PDP actions, see what needs attention on Home, filter entries by status |
| **7** | Polish | Search, progressive safety checklist, versioning, error reporting |

---

## Phase 1: Foundation

**Goal:** Auth works, the app shell renders, navigation is wired up, and the user can reach every tab.

### UX experience

The user opens the app, sees a login/register screen. After authenticating, they land on the Home tab with an empty state. The 4-tab bottom bar is visible (Home, Entries, PDP, Profile). Tapping each tab shows a placeholder or empty state. The Profile tab shows their name, email, and a log out button.

This phase is the skeleton. Nothing is functional beyond auth and navigation, but the user can move around the app and understand the structure.

### Backend work

Nothing new. Auth endpoints already exist:
- `POST /auth/register` — register with email/password
- `POST /auth/login` — returns JWT
- `POST /auth/guest` — anonymous guest
- `GET /auth/me` — current user info

**Verify:** Auth flow works end-to-end with the frontend. JWT is stored, refreshed, and cleared on logout.

### Frontend work

| Task | Detail |
|------|--------|
| **Auth screens** | Login screen (email + password), Register screen (name + email + password), error states for invalid credentials / locked account |
| **JWT token management** | Store token securely, attach to all API requests, redirect to login on 401 |
| **Bottom tab bar** | 4 tabs: Home, Entries, PDP, Profile. Active state styling, icons |
| **Home screen shell** | Header ("Portfolio", date, profile avatar), Module A card (start new entry) with buttons wired to nothing yet, empty states for Modules B/C/D |
| **Entries tab shell** | Title, empty list state: "No entries yet." |
| **PDP tab shell** | Title, empty list state: "No PDP actions yet." |
| **Profile tab** | User name/email from `GET /auth/me`, Settings/Privacy/Help/About rows (static content), Log out button |

### Reusable components to build

- Bottom tab bar
- Screen header (title + right action)
- Empty state card
- Text input field
- Primary / secondary button styles
- Status pill (will be reused extensively later)

### Why this phase first

Everything else depends on auth and navigation. If the user can't log in and move between tabs, nothing works. Building the shell also forces decisions about layout, spacing, and typography that propagate through every later phase.

---

## Phase 2: Capture

**Goal:** The user can start a new entry from Home, land in a conversation, send voice and text messages, and see them transcribed and processed.

### UX experience

The registrar taps "Talk about it" on the Home screen. A new entry is created and they land in the Capture tab of the Entry Detail screen. They tap the mic, record 60 seconds of audio about a patient encounter, and tap "Done." The message appears with a "Transcribing..." shimmer, then resolves to cleaned text. They can also type messages. The AI action pills (Summarise, Follow-up, Reflect) are visible but non-functional in this phase — they'll be wired in Phase 3.

The registrar can leave and come back. The entry appears in the Home screen's "Continue recent entries" carousel and in the Entries list. Tapping it resumes the conversation.

### Backend work

Nothing new. All endpoints exist:
- `POST /artefacts` — creates artefact + linked conversation
- `POST /conversations/:conversationId/messages` — send text or audio message
- `GET /conversations/:conversationId/messages` — list messages (cursor-based)
- `POST /media/initiate` — get presigned upload URL
- `GET /media/:mediaId` — get media info
- `GET /conversations/messages/pending` — poll processing status
- `GET /artefacts` — list artefacts (for Entries tab and Home carousel)

**Verify:** The full audio pipeline works end-to-end: upload to S3 → AssemblyAI transcription with PII redaction → LLM cleaning → message status COMPLETE with final content.

### Frontend work

| Task | Detail |
|------|--------|
| **Home Module A — Start new entry** | "Talk about it" calls `POST /artefacts`, navigates to Entry Detail |
| **Home Module B — Recent entries** | Horizontal scroll of entry cards from `GET /artefacts?sort=updatedAt&limit=5`, tapping navigates to Entry Detail |
| **Entries list** | Paginated list from `GET /artefacts`, status pills, tap to open |
| **Entry Detail screen** | Header with back button, editable title, overflow menu. Phase tabs: Capture / Review (Review tab shows "Convert your conversation first" empty state) |
| **Chat UI** | Message list from `GET /conversations/:id/messages`. User messages with role/type badges. AI messages with "AI" badge. Scroll to bottom on new messages. |
| **Composer** | Text input with send button. Mic button (primary, filled). AI action pills (visible, disabled for now) |
| **Voice recorder overlay** | Full-screen overlay on mic tap. Waveform visualisation (or simple pulse animation for MVP). Timer. Cancel / Pause / Done buttons. Privacy reminder: "Avoid names, DOB, and addresses." |
| **Audio upload flow** | On "Done": call `POST /media/initiate` → upload to presigned URL → call `POST /conversations/:id/messages` with mediaId. Show optimistic message with "Transcribing..." state. |
| **Message processing states** | Poll `GET /conversations/messages/pending` every 2 seconds for pending messages. Update message content and remove shimmer when COMPLETE. Show error state if FAILED. |
| **Autosave cues** | "Saving..." → "Saved" in header after message send |

### Reusable components to build

- Phase tabs (Capture / Review)
- Chat message bubble (user + AI variants)
- Message processing shimmer
- Composer bar (mic + text input + send)
- Voice recorder overlay
- Entry card (for horizontal scroll)
- Entry list item

### Why this phase second

Capture is the first thing the registrar does. It's the entry point to all value. If voice capture doesn't work smoothly, nothing else matters. Building this early also validates the audio pipeline end-to-end — any transcription or processing issues surface now, before we build on top of them.

---

## Phase 3: Convert

**Goal:** The user can convert a conversation into a structured portfolio entry. The AI classifies the entry type, generates reflections, maps capabilities, and suggests PDP actions.

### UX experience

After recording enough content (4+ messages), a sticky banner appears: "Ready to build your portfolio entry?" The registrar taps "Convert to entry." A bottom sheet sequence begins:

1. **Safety checklist** — two checkboxes about identifiers and purpose. Tap "Continue."
2. **Entry type selection** — the AI classifies the conversation and suggests "Clinical encounter (recommended)" with alternatives. The registrar confirms or changes. Tap "Generate entry."
3. **Generation progress** — "Building your entry..." with an indeterminate progress bar and reassurance text.
4. On completion, the Review tab auto-selects and shows the populated entry with reflections, capabilities, and PDP actions.

The AI action pills in the composer (Summarise, Follow-up, Reflect) also become functional in this phase.

### Backend work

Nothing new. The portfolio graph and analysis endpoint exist:
- `POST /conversations/:conversationId/analysis` — start or resume the portfolio graph

**Verify:** The full graph executes correctly:
1. `gather_context` → `classify` (INTERRUPT) — returns classification options
2. User selects type → `resume` at `present_classification`
3. `check_completeness` → `tag_capabilities` (INTERRUPT) — returns capabilities
4. User confirms → `resume` at `present_capabilities`
5. `reflect` → `generate_pdp` → `save` — artefact populated with reflection, capabilities, PDP actions

**Verify:** The artefact document is fully populated after the graph completes (reflection[], capabilities[], tags, artefactType). PDP actions are saved to the `pdp_actions` collection.

### Frontend work

| Task | Detail |
|------|--------|
| **Convert banner** | Sticky banner in Capture tab. Appears after 4+ messages (count from message list). "Convert to entry" / "Not yet" buttons. |
| **Safety checklist sheet** | Bottom sheet with 2 checkboxes. "Continue" disabled until both checked. "What counts as identifiable?" opens info sheet. |
| **Entry type selection sheet** | Calls `POST /conversations/:id/analysis` to start graph. Polls for classification result. Displays radio options with recommended label. "Generate entry" resumes graph with selected type. |
| **Generation progress sheet** | Indeterminate progress bar. "Building your entry..." with "This usually takes 10–15 seconds." Polls for graph completion. Error state with "Try again" / "Save as draft." |
| **Review tab population** | On graph completion, fetch updated artefact. Switch to Review tab. Render all sections (read-only for now — editing comes in Phase 4). |
| **Capability confirmation** | Handle the second graph interrupt (present_capabilities). Show capability list with checkboxes. User confirms or modifies. Resume graph. |
| **AI action pills** | Wire Summarise / Follow-up / Reflect to `POST /conversations/:id/analysis` with appropriate node targets. Display AI response as a new message in chat. |

### Reusable components to build

- Bottom sheet (generic, reusable for filters/export/safety)
- Checkbox list
- Radio selection list
- Progress bar (indeterminate)
- Section renderer (for Review tab — reads artefact data and renders Overview, Reflection, PDP, Capabilities, Evidence, Checks)

### Why this phase third

This is the moment of magic — the registrar's raw voice recording transforms into a structured portfolio entry. It's the core differentiator and the hardest UX to get right (managing graph interrupts, polling, error recovery). Building it immediately after Capture means we can test the full capture-to-convert loop end-to-end. The Review tab is read-only here; editing comes next.

---

## Phase 4: Review & Edit

**Goal:** The user can edit every section of their generated entry — reflection text, PDP actions, capability mapping, title, tags, and notes.

### UX experience

The registrar opens their entry's Review tab and sees all six sections. They tap into a reflection subsection, edit the text inline, and see "Saving..." → "Saved." They change a PDP action's due date, mark a low-confidence capability as confirmed, add a private note in Evidence/Notes. AI suggestions appear collapsed; they can expand one, tap "Accept" to insert the text, or "Dismiss" to hide it.

The section navigation chips show status dots: green for complete sections, amber for sections needing attention (missing due date, empty reflection block).

### Backend work

| Task | Detail | Endpoint |
|------|--------|----------|
| **Artefact detail endpoint** | Return full artefact with all populated fields (reflection, capabilities, tags, artefactType, linked conversation, PDP actions) | `GET /artefacts/:id` |
| **Artefact update endpoint** | Partial update: title, reflection sections, capabilities, tags, artefactType, evidence fields. Validate that user owns the artefact. | `PATCH /artefacts/:id` |
| **Artefact schema additions** | Add fields: `evidenceNotes` (string), `supervisorSetting` (string), `privateNote` (string, never exported), `summary` (string), `learningPoints` (string[]) | Schema migration |
| **PDP action list** | List PDP actions for a specific artefact, with optional status filter | `GET /pdp-actions?artefactId=X&status=Y` |
| **PDP action update** | Update action title, timeframe, status, evidence note | `PATCH /pdp-actions/:id` |
| **PDP action create** | Manually add a new PDP action to an artefact | `POST /pdp-actions` |
| **PDP action delete** | Remove a PDP action | `DELETE /pdp-actions/:id` |
| **Artefact status transitions** | Add `NEEDS_REVIEW` and `READY_TO_EXPORT` to ArtefactStatus enum. Auto-compute on read: if reflection exists but capabilities incomplete → NEEDS_REVIEW. If all checks pass → READY_TO_EXPORT. | Enum update + computed status logic |
| **Conversation status update** | Mark conversation as CONVERTED after graph completes. Add `CONVERTED` to ConversationStatus enum. | `PATCH /conversations/:id/status` |

**Why this is the biggest backend phase:** Everything before this was read-only (list artefacts, list messages) or handled by the graph (which writes artefact data directly). Editing is the first time the frontend writes back to artefact and PDP documents. Every field needs validation, ownership checks, and clean error responses.

### Frontend work

| Task | Detail |
|------|--------|
| **Section chip navigation** | Horizontal scroll chips with status dots. Tap to scroll to section. Compute status: green (section has content + no warnings), amber (section has warnings), grey (empty). |
| **Overview section** | Editable summary text, learning points list (add/remove/edit), entry type display, date. Debounced autosave via `PATCH /artefacts/:id`. |
| **Reflection section** | Render `artefact.reflection[]` as subsections with titles. Inline text editing per subsection. AI suggestion panels (collapsed by default): "Suggested wording" with Accept / Dismiss. |
| **PDP Actions section** | List PDP action cards from `GET /pdp-actions?artefactId=X`. Each card: editable title, date picker for due date, status dropdown, evidence note field. "+ Add action" button → `POST /pdp-actions`. AI suggestion cards for unaccepted actions. |
| **Capabilities section** | Render `artefact.capabilities[]` as checkbox list with evidence quotes. Tick/untick saves via `PATCH /artefacts/:id`. "+ Add capability" opens a picker from the full GP capability list (from specialty config). |
| **Evidence/Notes section** | Three text fields: evidence notes, supervisor/setting, private note (with "not exported" label). Debounced autosave. |
| **Pre-export Checks section** | Computed client-side checklist. Rules: reflection has content (pass/fail), at least one capability mapped (pass/fail), all PDP actions have due dates (pass/warn), client-side identifier regex scan on reflection text (pass/warn). |
| **Sticky Export CTA** | "Export to PDF" button at bottom of Review tab. Disabled with helper text if checks have failures. (Actual export logic comes in Phase 5.) |
| **Autosave** | Debounce edits (1 second). Show "Saving..." → "Saved" in header. On error: "Couldn't save. Retrying..." with automatic retry. |

### Reusable components to build

- Inline editable text block
- Date picker
- Status dropdown
- AI suggestion panel (Accept / Dismiss)
- Capability picker (searchable list from specialty config)
- Checklist item (pass / warning / fail states)

### Why this phase fourth

The registrar now has a generated entry but can't fix anything the AI got wrong. That's unusable for a portfolio tool — supervisors will see this. Editing is the bridge between "AI generated something" and "I'm confident submitting this." This phase also introduces the biggest backend surface area (PATCH endpoints, PDP CRUD), so it's important to get it right before building export on top of it.

---

## Phase 5: Export

**Goal:** The user can export their entry as a PDF or copy it as formatted text for FourteenFish upload.

### UX experience

The registrar finishes reviewing their entry. All checks are green. They tap "Export to PDF." A bottom sheet shows export options (template, include/exclude toggles). They tap "Generate PDF." A progress bar runs for a few seconds. The PDF is ready — they can download it, share it via the system share sheet, or copy the sections as plain text. A confirmation message reminds them: "Upload this to FourteenFish to complete your portfolio entry."

If PDF generation fails, "Copy as text" is always available as a fallback.

### Backend work

| Task | Detail | Endpoint |
|------|--------|----------|
| **PDF generation service** | Server-side HTML-to-PDF. Takes an artefact ID + template choice + include/exclude options. Renders artefact data into an HTML template, converts to PDF. Returns the PDF file or a presigned download URL. Technology choice: Puppeteer (headless Chrome) or a lighter library like `pdf-lib` / `@react-pdf/renderer` running server-side. | `POST /artefacts/:id/export` |
| **PDF templates** | Three HTML templates: "FourteenFish-friendly" (default, structured headings matching FourteenFish upload), "Compact" (condensed), "Detailed" (includes capability rationale). | Template files |
| **Export history schema** | New collection `exports`: artefactId, userId, templateType, artefactVersion (snapshot), fileKey (S3), fileName, createdAt. | New schema + repository |
| **Export history endpoint** | List exports for an artefact | `GET /artefacts/:id/exports` |
| **Artefact status update on export** | After successful export, update artefact status to EXPORTED (map to existing SUBMITTED status or add EXPORTED). | Logic in export service |

**Design decision on PDF approach:** For MVP, Puppeteer is the most reliable for producing pixel-perfect PDFs from HTML templates. It adds a binary dependency (Chromium) but produces consistent results. If deployment constraints make Puppeteer impractical, fall back to `@react-pdf/renderer` on the server or generate PDFs client-side.

### Frontend work

| Task | Detail |
|------|--------|
| **Export options sheet** | Bottom sheet triggered by "Export to PDF" button. Template selector (default to last-used, stored in local storage). Toggles: include capabilities, include PDP actions, exclude evidence notes. "Generate PDF" CTA. |
| **Generation progress** | Progress bar with "Creating your PDF..." text and artefact version snapshot. |
| **Export success screen** | File name display. Three buttons: Download (triggers browser download or system save), Share (system share sheet), Copy text (copies formatted plain text to clipboard). Microcopy: "Upload this to FourteenFish to complete your portfolio entry." |
| **Export error state** | "Export failed. Your entry is safe." with "Try again" and "Copy as text" fallback. |
| **Copy as text (fallback)** | Frontend-only. Formats artefact sections as plain text with headings. Copies to clipboard. Available even when PDF generation is unavailable. This can ship before the backend PDF service is ready. |
| **Export history** | Within artefact overflow menu: "Export history" shows list of past exports with date, template, and "Re-download" option. |
| **Post-export banner** | If artefact is edited after export: "You've changed this entry since the last export." with "Export new version" CTA. |

### Reusable components to build

- File download trigger
- Share sheet integration
- Copy-to-clipboard button with confirmation toast

### Why this phase fifth

Export is the culmination of the entire workflow — it's what the registrar actually uploads to FourteenFish. Without it, the app is a fancy note-taking tool with no output. It comes after editing because the registrar needs to be confident in the content before exporting. The "Copy as text" fallback should be built first (it's frontend-only) so there's always a way to get data out, even before the PDF backend is ready.

---

## Phase 6: Track

**Goal:** The user can manage PDP actions across all entries, see what needs attention on the Home screen, and filter entries by lifecycle status.

### UX experience

The registrar opens the app and the Home screen tells them what to do: "2 entries need review," "1 PDP action overdue," "Capabilities covered: 9 of 13." They tap "PDP actions due soon" and land on the PDP tab filtered to due/overdue items. They mark an action as done. They go to Entries, filter by "Needs review," and open an entry to finish editing.

This is the "returning user" experience. Phases 1–5 serve the "first-time capture" flow. Phase 6 serves the registrar who comes back the next day, or the next week, to manage their portfolio.

### Backend work

| Task | Detail | Endpoint |
|------|--------|----------|
| **PDP actions — global list** | List all PDP actions for a user (across all artefacts). Filter by status, sort by timeframe. Include linked artefact title. | `GET /pdp-actions?userId=X&status=Y&sort=timeframe` (extend existing) |
| **Dashboard summary** | Aggregation endpoint returning: entries by status (count per status), PDP actions by status (count + overdue count), capability coverage (covered vs total from specialty config), weekly activity (entries created/exported in last 7 days). | `GET /dashboard/summary` |
| **Artefact status computation** | Ensure artefact status is correctly computed on every read. Logic: no reflection → DRAFT, has reflection but missing fields → NEEDS_REVIEW, all checks pass → READY_TO_EXPORT, has been exported → SUBMITTED. This may be a virtual field computed at query time or a denormalised field updated on writes. | Service logic |

### Frontend work

| Task | Detail |
|------|--------|
| **PDP tab — full implementation** | List all PDP actions from `GET /pdp-actions`. Filter pills: Due soon / Overdue / Done / All. Action cards with: title, linked artefact name (tappable), due date, status, "Mark done" button (with confirmation). Empty state. |
| **Home Module C — Actions due soon** | Top 3 PDP actions from `GET /pdp-actions?status=PENDING&sort=timeframe&limit=3`. "View all PDP actions" links to PDP tab. |
| **Home Module D — Progress snapshot** | Three stat cards from `GET /dashboard/summary`. Tap navigates to filtered views. |
| **Home Module B — status-aware CTAs** | Entry cards show status-appropriate CTA label: "Continue" (Draft), "Review" (Needs review), "Export" (Ready to export). |
| **Entries list — status filtering** | Wire status pills to filter `GET /artefacts?status=X`. All 5 statuses functional. |
| **Returning user header** | On Home, if user has entries: "Welcome back, Sam" with "Next best action: Review 2 entries before exporting." Computed client-side from dashboard summary data. |

### Reusable components to build

- PDP action card (full version with linked artefact)
- Stat card (number + label + tap target)
- Filter pills (generic, reusable for entries and PDP)

### Why this phase sixth

Tracking is a "returning user" feature. It's valuable, but a registrar can survive without it for the first few uses — they can manually open their entries and check PDP actions within each one. Phases 1–5 already deliver the complete capture-to-export loop. Phase 6 makes the app feel like a proper tool for ongoing portfolio management, not just a one-shot converter.

---

## Phase 7: Polish

**Goal:** Quality-of-life improvements that make the app more efficient for power users and more trustworthy for all users.

### UX experience

The registrar who has used the app 20+ times benefits from: faster safety checklists (collapsed to one confirmation), search across entries, version history for entries they've regenerated, and the ability to flag incorrect AI suggestions.

### Backend work

| Task | Detail | Endpoint |
|------|--------|----------|
| **Artefact versioning** | On each significant change (generation, regeneration, manual edit snapshot), create a version record: artefactId, versionNumber, source (generated/edited/regenerated), snapshot of artefact fields, createdAt. | New `artefact_versions` collection + `POST /artefacts/:id/versions` (auto-created on writes) |
| **Version list** | List versions for an artefact | `GET /artefacts/:id/versions` |
| **Version restore** | Create a new version by copying a previous version's data into the current artefact | `POST /artefacts/:id/versions/:versionId/restore` |
| **Flag/report endpoint** | Accept a report: targetType (message/artefact), targetId, reason (enum), details (optional text). Store for review. | `POST /reports` |
| **Full-text search** | MongoDB text index on artefact title, reflection text, tags. Return matching artefacts with relevance score. | `GET /artefacts?search=query` |

### Frontend work

| Task | Detail |
|------|--------|
| **Progressive safety checklist** | Track conversion count in local storage. After 5 conversions, collapse the 2-item checklist to a single confirmation with "Show full checklist" link. |
| **Search** | Search bar in Entries tab. On type, filter entries via `GET /artefacts?search=query` (or client-side filter for MVP). Debounced, 300ms. |
| **Version history** | In artefact overflow menu: "Version history." List of versions with source label and date. "Restore this version" button with confirmation: "This will create a new version with the restored content." |
| **Flag AI suggestion** | On every AI message in chat and every AI suggestion panel in Review: small flag icon. Tap opens bottom sheet: reason picker (Incorrect clinical content / Privacy concern / Unhelpful / Other) + optional details. Submits to `POST /reports`. Confirmation: "Thanks for the feedback." |
| **Regenerate per section** | In each reflection subsection overflow menu: "Regenerate this section." Warning: "This will replace the current text. Your previous version will be saved." Calls a targeted graph node (or a new endpoint). |
| **Entry archive/delete** | Swipe or long-press on entry list items. Archive moves to ARCHIVED status. Delete shows confirmation: "This will permanently delete this entry and its conversation." |

### Why this phase last

These are refinements, not core functionality. A registrar can use the app without search (they have <50 entries), without versioning (they can be careful about regeneration), and without progressive checklists (two taps isn't a crisis). Building these last means the core workflow is rock-solid before we add complexity. It also means we've gathered real usage data (from Phases 1–6) to validate which polish items actually matter.

---

## Summary: what gets built when

### Phase 1 — Foundation
- **Backend:** Verify existing auth
- **Frontend:** Auth screens, tab bar, screen shells, empty states, Profile tab
- **Components:** Bottom tab bar, headers, buttons, status pill, empty state

### Phase 2 — Capture
- **Backend:** Verify existing audio pipeline
- **Frontend:** Home Module A+B, Entry Detail with Capture tab, chat UI, composer, voice recorder, audio upload, message polling
- **Components:** Phase tabs, chat bubbles, composer, voice overlay, entry card, entry list item

### Phase 3 — Convert
- **Backend:** Verify existing portfolio graph
- **Frontend:** Convert banner, safety checklist sheet, entry type sheet, generation progress, Review tab (read-only), AI action pills
- **Components:** Bottom sheet, checkbox list, radio list, progress bar, section renderer

### Phase 4 — Review & Edit
- **Backend:** `GET /artefacts/:id`, `PATCH /artefacts/:id`, PDP CRUD (4 endpoints), artefact schema additions, status enum updates, conversation status update
- **Frontend:** All 6 artefact sections (editable), section chips with status dots, autosave, inline editing, AI suggestion panels, capability picker
- **Components:** Inline editor, date picker, dropdown, AI panel, capability picker, checklist item

### Phase 5 — Export
- **Backend:** PDF generation service, PDF templates (3), export history schema + endpoints, artefact status update on export
- **Frontend:** Export options sheet, generation progress, success screen (download/share/copy), error state with fallback, export history, post-export banner
- **Components:** File download, share integration, copy-to-clipboard

### Phase 6 — Track
- **Backend:** Global PDP list endpoint, dashboard summary aggregation, artefact status computation logic
- **Frontend:** PDP tab (full), Home Modules C+D, status-aware CTAs on Home, entries list status filtering, returning user header
- **Components:** PDP action card, stat card, filter pills

### Phase 7 — Polish
- **Backend:** Versioning schema + endpoints, report/flag endpoint, full-text search index
- **Frontend:** Progressive safety checklist, search, version history, flag AI, regenerate per section, archive/delete
- **Components:** Version list, report sheet, search bar

---

## Dependencies & risks per phase

| Phase | Key risk | Mitigation |
|-------|----------|------------|
| **1** | JWT token handling across app restart | Test token persistence and refresh early |
| **2** | Audio recording quality on mobile browsers | Test on real devices (iPhone Safari, Android Chrome) in Phase 2, not later |
| **3** | Portfolio graph takes too long (>15s) or fails intermittently | Build robust error recovery + "Save as draft" fallback. Optimise graph if latency is >20s. |
| **4** | PATCH endpoint complexity — partial updates to nested arrays (reflection[], capabilities[]) | Use targeted update operations (e.g., `$set` on specific array indices) rather than replacing the whole document |
| **5** | PDF rendering consistency across templates | Start with one template (FourteenFish-friendly), add others later. Test output with actual FourteenFish upload. |
| **6** | Dashboard aggregation performance as data grows | Use MongoDB aggregation pipelines with indexes. For MVP, these queries are simple counts — performance is not a concern until 1000+ entries per user. |
| **7** | Versioning storage cost | Store only diffs or snapshots of changed sections, not full artefact copies. For MVP with low volume, full snapshots are fine. |

---

## What is explicitly out of scope for all phases

- Push notifications / reminders
- Direct FourteenFish API integration
- Real-time collaboration / supervisor access
- WebSocket/SSE for live updates (polling is sufficient for MVP)
- Offline support / service worker
- Multi-specialty support (only GP for MVP)
- Onboarding walkthrough (consider post-MVP based on drop-off data)
- Advanced analytics / charts on Dashboard
- Attachment uploads to artefacts (photos, documents)
