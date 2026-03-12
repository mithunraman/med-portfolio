# Portfolio Assistant — Roadmap

## What is this app?

**Portfolio Assistant** is a mobile app for UK GP registrars (ST1–ST3) to capture clinical learning experiences by voice after clinics, convert them via AI into structured portfolio entries, and export them as PDFs for FourteenFish submission.

**Core loop:** Voice capture → AI conversation → structured portfolio entry → review/edit → PDF export → track PDP actions

---

## Feature Status

Each feature lists backend and mobile frontend status separately, verified against the actual code.

---

### Phase 1 — Foundation (Auth + Navigation)

| Feature                                      | Backend                                      | Mobile                                                      |
| -------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------- |
| Register / Login / Guest auth                | ✅ `POST /auth/register`, `/login`, `/guest` | ✅ `intro`, `login`, `register`, `welcome` screens          |
| Get current user                             | ✅ `GET /auth/me`                            | ✅ `useAuth` hook reads user from store                     |
| Logout                                       | ✅ `POST /auth/logout` (JWT is client-side)  | ✅ Logout with confirmation alert in Profile tab            |
| JWT token management                         | —                                            | ✅ Token stored, attached to all requests, clears on logout |
| Bottom tab bar (Home, Entries, PDP, Profile) | —                                            | ✅ 4-tab layout with active state                           |
| Screen shells and empty states               | —                                            | ✅ All tabs render with `EmptyState` component              |
| Profile tab (name, email, dark mode, logout) | —                                            | ✅ Full profile screen with settings sections               |

---

### Phase 2 — Capture (Voice + Chat)

| Feature                         | Backend                                                         | Mobile                                                            |
| ------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------- |
| Create artefact + conversation  | ✅ `POST /artefacts`                                            | ✅ "Start now" on Home dispatches `createArtefact` thunk          |
| Recent entries carousel on Home | ✅ `GET /artefacts` (via dashboard)                             | ✅ `RecentEntriesModule` reads from `dashboardData.recentEntries` |
| Paginated entries list          | ✅ `GET /artefacts` with cursor + status filter                 | ✅ `EntriesScreen` fetches and renders flat list                  |
| Entry detail screen             | ✅ `GET /artefacts/:id`                                         | ✅ `[artefactId].tsx` fetches and renders artefact                |
| Chat UI — message list          | ✅ `GET /conversations/:id/messages`                            | ✅ `MessageList` + `MessageRow` + `BubbleShell` components        |
| Composer — text input + send    | ✅ `POST /conversations/:id/messages`                           | ✅ `ChatComposer.tsx` with text input and send                    |
| Voice recorder overlay          | —                                                               | ✅ `VoiceNoteRecorderBar.tsx` with waveform and timer             |
| Audio upload to S3              | ✅ `POST /media/initiate` (presigned URL)                       | ✅ `handleSendVoiceNote` uploads to S3 then sends `mediaId`       |
| Message transcription pipeline  | ✅ AssemblyAI → LLM cleaning → `COMPLETE` status                | ✅ Polls and updates message content on completion                |
| Unified message polling         | ✅ `GET /conversations/:id/messages` returns messages + context | ✅ `pollConversation` thunk, phase-aware intervals                |

---

### Phase 3 — Convert (AI Portfolio Generation)

| Feature                                           | Backend                                                                    | Mobile                                                                            |
| ------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Start AI analysis                                 | ✅ `POST /conversations/:id/analysis { type: 'start' }`                    | ✅ `ActionBanner` (variant: `analyse`) + `handleStartAnalysis`                    |
| Resume analysis (answer question)                 | ✅ `POST /conversations/:id/analysis { type: 'resume', messageId, value }` | ✅ `handleResumeAnalysis` + `handleAnswerQuestion` wired to question cards        |
| Entry type selection (single select)              | ✅ Graph emits `single_select` question interrupt                          | ✅ `SingleSelectCard` renders options with confidence badges, confirms on tap     |
| Capability confirmation (multi select)            | ✅ Graph emits `multi_select` question interrupt                           | ✅ `MultiSelectCard` renders checkboxes with evidence snippets                    |
| Free-text follow-up                               | ✅ Graph emits `free_text` question interrupt                              | ✅ `FreeTextPrompts` shows prompts; user replies via composer + "Continue" banner |
| Generation progress (analysing state)             | ✅ Phase transitions to `analysing` during graph run                       | ✅ `ActionBanner` shows spinner while `phase === 'analysing'`                     |
| Analysis completion                               | ✅ Phase transitions to `completed`                                        | ✅ `CompletionCard` shown with "View Your Entry" navigation                       |
| Review tab — reflection (read-only)               | ✅ Artefact populated with `reflection[]`                                  | ✅ Collapsible reflection sections rendered in `[artefactId].tsx`                 |
| Review tab — capabilities (read-only)             | ✅ Artefact populated with `capabilities[]`                                | ✅ Capability list with tap-to-view evidence modal                                |
| Review tab — PDP goals (read-only)                | ✅ Artefact populated with `pdpGoals[]`                                    | ✅ PDP goal cards with actions and status pills                                   |
| Phase-aware composer (disable during analysis)    | —                                                                          | ✅ `canSendMessage` / `canSendAudio` derived from `context.actions`               |
| Smart polling frequency                           | —                                                                          | ✅ 2s during `analysing`, 10s during `awaiting_input`, off when `completed`       |
| Safety checklist (pre-conversion)                 | —                                                                          | ❌ Not implemented — analysis starts directly with no identifier check gate       |
| AI action pills (Summarise / Follow-up / Reflect) | ✅ Analysis endpoint supports targeted node actions                        | ❌ Not implemented in composer — only Analyse/Continue banners exist              |

---

### Phase 4 — Review & Edit

| Feature                                                       | Backend                                                    | Mobile                                                                    |
| ------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| Get full artefact detail                                      | ✅ `GET /artefacts/:id`                                    | ✅ `fetchArtefact` thunk called on screen mount                           |
| Update artefact status                                        | ✅ `PUT /artefacts/:id/status`                             | ✅ `updateArtefactStatus` thunk (used for Archive)                        |
| Finalise artefact (save PDP goal selections)                  | ✅ `POST /artefacts/:id/finalise`                          | ✅ `finaliseArtefact` thunk wired to "Mark as Final" button               |
| PDP Goal Selector (review date + action toggles)              | —                                                          | ✅ `PdpGoalSelector.tsx` — select goals, toggle actions, set review dates |
| Archive entry (with PDP goal handling)                        | ✅ `PUT /artefacts/:id/status` with `archivePdpGoals` flag | ✅ Archive alert with "Keep Goals" / "Archive All" options                |
| Partial edit artefact (title, reflection, capabilities, tags) | ❌ No `PATCH /artefacts/:id` endpoint                      | ❌ No inline editing — all sections are read-only                         |
| PDP action CRUD (add / edit / delete individual actions)      | ❌ No `/pdp-actions` CRUD endpoints                        | ❌ Not implemented                                                        |
| Pre-export checks computed checklist                          | —                                                          | ❌ Not implemented                                                        |
| Overview section (summary + learning points editable)         | ❌ No PATCH endpoint                                       | ❌ Not implemented                                                        |
| Evidence/Notes section (editable)                             | ❌ No PATCH endpoint                                       | ❌ Not implemented                                                        |

---

### Phase 5 — Export

| Feature                                                  | Backend                                     | Mobile             |
| -------------------------------------------------------- | ------------------------------------------- | ------------------ |
| PDF generation service                                   | ❌ No `POST /artefacts/:id/export` endpoint | —                  |
| PDF templates (FourteenFish-friendly, Compact, Detailed) | ❌ Not implemented                          | —                  |
| Export history schema + endpoint                         | ❌ Not implemented                          | —                  |
| Export options sheet (template picker, toggles)          | —                                           | ❌ Not implemented |
| PDF generation progress screen                           | —                                           | ❌ Not implemented |
| Download / Share via system share sheet                  | —                                           | ❌ Not implemented |
| Copy as text fallback                                    | —                                           | ❌ Not implemented |
| Post-export banner ("changed since last export")         | —                                           | ❌ Not implemented |

---

### Phase 6 — Track (Returning User)

| Feature                                                            | Backend                                                                                                              | Mobile                                                                      |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Dashboard summary (recent entries, PDP goals due, stats)           | ✅ `GET /dashboard` — returns `recentEntries`, `pdpGoalsDue`, `stats` (entriesThisWeek, toReview, capabilitiesCount) | ✅ `fetchDashboard` thunk feeds Home modules B, C, D                        |
| Home Module C — PDP goals due soon                                 | ✅ Dashboard returns top 5 active goals sorted by next due date                                                      | ✅ `PdpDueSoonModule` renders goal cards with action count                  |
| Home Module D — Progress snapshot stats                            | ✅ Dashboard returns `entriesThisWeek`, `toReview`, `capabilitiesCount`                                              | ✅ `ProgressSnapshotModule` renders 3 stat cards                            |
| Home Module C — Artefacts needing attention (separate from recent) | ❌ Dashboard does not break out needs-review / ready-to-export counts                                                | ❌ Not shown separately on Home                                             |
| PDP tab — full list with filters                                   | ❌ No global PDP list endpoint                                                                                       | ❌ PDP tab is empty state shell only — no data                              |
| PDP tab — Mark done / update status per goal                       | ❌ No PATCH endpoint for goals                                                                                       | ❌ Not implemented                                                          |
| Entries list — status filter pills                                 | ✅ `GET /artefacts?status=X` supported                                                                               | ✅ Filter pills exist but filtering is client-side only (not passed to API) |
| Returning user header ("Welcome back, Next best action")           | —                                                                                                                    | ❌ Not implemented — always shows static "Home" heading                     |

---

### Phase 7 — Polish

| Feature                                                | Backend                                        | Mobile                                        |
| ------------------------------------------------------ | ---------------------------------------------- | --------------------------------------------- |
| Full-text search across entries                        | ❌ No search index or `?search=` param         | ❌ No search bar                              |
| Artefact versioning (snapshot on generate/edit/export) | ❌ No versioning schema or endpoints           | ❌ No version history UI                      |
| Restore previous version                               | ❌ Not implemented                             | ❌ Not implemented                            |
| Flag / report AI suggestion                            | ❌ No `POST /reports` endpoint                 | ❌ No flag button on messages or suggestions  |
| Regenerate per section                                 | ❌ No targeted regeneration endpoint           | ❌ No regenerate option on sections           |
| Progressive safety checklist (collapse after 5 uses)   | —                                              | ❌ Not implemented                            |
| Archive entry                                          | ✅ `PUT /artefacts/:id/status` with `ARCHIVED` | ✅ Already implemented on entry detail screen |
| Delete entry                                           | ❌ No `DELETE /artefacts/:id` endpoint         | ❌ Not implemented                            |

---

## Phase Summary

| Phase | Description                                        | Backend                                        | Mobile                                                  |
| ----- | -------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------- |
| 1     | Foundation — auth, navigation, shells              | ✅ Done                                        | ✅ Done                                                 |
| 2     | Capture — voice recording, chat, audio pipeline    | ✅ Done                                        | ✅ Done                                                 |
| 3     | Convert — AI generation, question UI, completion   | ✅ Done                                        | ✅ Done (minus safety checklist + AI action pills)      |
| AI UX | Phase-aware composer, inline questions, banners    | ✅ Done                                        | ✅ Done                                                 |
| 4     | Review & Edit — inline editing, autosave, PATCH    | 🔄 Partial (finalise + status done, no PATCH)  | 🔄 Partial (read-only view + finalise done, no editing) |
| 5     | Export — PDF generation, templates, download/share | ❌ Not started                                 | ❌ Not started                                          |
| 6     | Track — PDP tab, full dashboard, returning user    | 🔄 Partial (dashboard done, no PDP list/PATCH) | 🔄 Partial (Home modules wired, PDP tab is shell)       |
| 7     | Polish — search, versioning, flag AI, regenerate   | ❌ Not started (archive only)                  | 🔄 Partial (archive done, everything else not started)  |

---

## Explicitly Out of Scope (MVP)

- Push notifications / reminders
- Direct FourteenFish API integration
- Real-time collaboration / supervisor access
- WebSocket/SSE for live updates (polling is sufficient)
- Offline support
- Multi-specialty support (GP only for MVP)
- Onboarding walkthrough
- Advanced analytics / charts
- Attachment uploads (photos, documents)
