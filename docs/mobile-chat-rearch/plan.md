# Mobile App — AI Conversation Integration Plan

## Status: Phases 1-4 DONE, Phases 5-6 remaining

## Context

The backend exposes 3 endpoints for AI conversations, including a `ConversationContext` object that tells the client what actions are allowed, the current phase, and any active question. The mobile app currently ignores this context — the composer is always enabled, there's no analysis flow, and question messages render as plain text. This plan makes the mobile client fully driven by `ConversationContext`.

**Backend is frozen — no changes.**

## User Decisions

- **Free text UX**: Two-step — user sends message via composer, then taps "Continue Analysis"
- **Polling**: Unified via `GET /messages` (returns messages + context)
- **Question UI**: Inline in message bubble
- **`pollPendingMessages`**: Deprecated/removed — use `GET /messages` instead
- **API client**: Add `analysis()` method

---

## Phase 1: Foundation (State + API) ✅ DONE

Store `ConversationContext` in Redux, add `analysis()` to API client, remove dead polling, rewrite to unified poll.

### Changes made:
- `packages/api-client/src/clients/conversations.client.ts` — Added `analysis()` method
- `apps/mobile/src/store/slices/messages/thunks.ts` — Removed `pollMessages`, simplified `fetchMessages`, added `pollConversation`, `startAnalysis`, `resumeAnalysis`
- `apps/mobile/src/store/slices/messages/slice.ts` — Added `contextByConversation`, `analysisLoading`, `analysisError`, `clearAnalysisError`. Replaced cursor logic with full-replace. Added cases for all new thunks
- `apps/mobile/app/(messages)/[conversationId].tsx` — Reads `context` from Redux, rewrote polling to use `pollConversation`, removed `pendingMessageIds`/`pendingIdsRef`

---

## Phase 2: Phase-Aware Composer

Make `ChatComposer` respect `ConversationContext` — disable/enable based on actions, show "Analyse" and "Continue Analysis" buttons.

### 2.1 Extend ChatComposer props

**File:** `apps/mobile/src/components/ChatComposer.tsx`

Add props:
```
canSendMessage?: boolean
canSendAudio?: boolean
canStartAnalysis?: boolean
canResumeAnalysis?: boolean
phase?: ConversationPhase
onStartAnalysis?: () => void
onResumeAnalysis?: () => void
isAnalysisLoading?: boolean
```

Behavior changes:
- **Disable TextInput** when `canSendMessage` is false or phase is `analysing`/`completed`/`closed`
- **Change placeholder** per phase: "Analysis in progress..." / "Analysis complete" / "Conversation closed"
- **Hide mic button** when `canSendAudio` is false
- **Show "Analyse" button** (replaces send/mic area) when `canStartAnalysis && !hasText`
- **Show "Continue" button** when `canResumeAnalysis && !hasText` (for free_text two-step flow)
- Both buttons show `ActivityIndicator` when `isAnalysisLoading`

### 2.2 Wire context to ChatComposer

**File:** `apps/mobile/app/(messages)/[conversationId].tsx`

- Derive `canSendMessage`, `canSendAudio`, `canStartAnalysis`, `canResumeAnalysis` from `context.actions.*.allowed`
- Read `phase` from context
- Read `analysisLoading` from Redux
- Pass all as props to `ChatComposer`
- Add stub `handleStartAnalysis` / `handleResumeAnalysis` callbacks (wired in Phase 3)

### Verification

- `composing` phase: composer enabled, "Analyse" visible when `startAnalysis.allowed`
- `analysing` phase: composer disabled, placeholder says "Analysis in progress..."
- `awaiting_input` + `free_text`: composer enabled, "Continue" button visible
- `awaiting_input` + `single_select`: composer disabled (STRUCTURED_INPUT_REQUIRED)
- `completed`/`closed`: composer disabled

---

## Phase 3: Analysis Flow

Wire analysis thunks to UI and implement smart polling.

### 3.1 Wire handlers

**File:** `apps/mobile/app/(messages)/[conversationId].tsx`

- **`handleStartAnalysis`**: dispatch `startAnalysis(conversationId)`, then immediately `pollConversation` to pick up phase change
- **`handleResumeAnalysis`**: dispatch `resumeAnalysis({ conversationId, messageId: context.activeQuestion.messageId })`, then poll. For free_text, no `value` needed (user's message IS the response)

### 3.2 Smart polling frequency

**File:** `apps/mobile/app/(messages)/[conversationId].tsx`

- `analysing` phase: poll every 2-3s (fast — waiting for AI response)
- Other active phases: poll every 5-10s (idle)
- `completed`/`closed`: stop polling
- On app foreground: immediate poll + resume interval

### Verification

- Tap "Analyse" → `POST /analysis { type: 'start' }` fires, phase transitions to `analysing`, composer disables
- During `analysing`, new assistant messages appear as polling picks them up
- Phase transitions to `awaiting_input` — question message appears, composer state updates
- For `free_text`: type response → send → tap "Continue" → resumes analysis
- App background/foreground during analysis → catches up correctly

---

## Phase 4: Question UI (Inline Bubbles)

Render interactive question cards inside message bubbles.

### 4.1 QuestionContent router

**New file:** `apps/mobile/src/components/chat/bubble/QuestionContent.tsx`

- Takes `message`, `question`, `isActive` (can interact?), `onResume` callback
- Dispatches to `SingleSelectCard`, `MultiSelectCard`, or `FreeTextPrompts` based on `question.questionType`

### 4.2 SingleSelectCard

**New file:** `apps/mobile/src/components/chat/bubble/questions/SingleSelectCard.tsx`

- Radio-style option list: `label`, optional `confidence` badge, optional `reasoning` (expandable)
- `suggestedKey` option gets a highlight/badge
- "Confirm" button → calls `onResume(messageId, { selectedKey })`
- When `!isActive`: shows selected option with checkmark, non-interactive

### 4.3 MultiSelectCard

**New file:** `apps/mobile/src/components/chat/bubble/questions/MultiSelectCard.tsx`

- Checkbox-style options: `label`, optional `confidence`, optional `evidence` bullets
- "Confirm (N)" button → calls `onResume(messageId, { selectedKeys })`
- When `!isActive`: shows selected options with checkmarks, non-interactive

### 4.4 FreeTextPrompts

**New file:** `apps/mobile/src/components/chat/bubble/questions/FreeTextPrompts.tsx`

- Display-only numbered prompt list from `question.prompts`
- Optional `missingSections` / `followUpRound` labels
- User responds via normal composer (two-step flow)

### 4.5 Integrate into message rendering

**File:** `apps/mobile/src/components/chat/MessageRow.tsx`

- Add `isActiveQuestion?: boolean` and `onResumeAnalysis?` props
- When `message.question` exists: render `TextContent` + `QuestionContent` inside bubble

**File:** `apps/mobile/src/components/chat/MessageList.tsx`

- Add `activeQuestionMessageId?: string` and `onResumeAnalysis?` props
- Pass through to `MessageRow` — set `isActiveQuestion={item.data.id === activeQuestionMessageId}`

**File:** `apps/mobile/app/(messages)/[conversationId].tsx`

- Derive `activeQuestionMessageId` from `context.activeQuestion?.messageId`
- Create `handleQuestionResume(messageId, value)` → dispatches `resumeAnalysis` with value
- Pass both to `MessageList`

### Verification

- `single_select` question: shows radio options with confidence, user selects + confirms → resumes
- `multi_select` question: shows checkbox options, user selects multiple + confirms → resumes
- `free_text` question: shows prompts, user types in composer + sends + taps "Continue"
- After answering, question becomes read-only with selected answer shown

---

## Phase 5: Completion + Polish

### 5.1 Analysis status banner

**New file:** `apps/mobile/src/components/chat/items/AnalysisStatusBanner.tsx`

- During `analysing`: animated "Analysing..." indicator
- During `completed`: success state with "View Entry" link
- During `failed` (`analysisRun.status === FAILED`): error with "Retry" button

**File:** `apps/mobile/src/components/chat/types.ts` — add `'analysisStatus'` to `FlatListItem` union

**File:** `apps/mobile/src/components/chat/hooks/useMessageGroups.ts` — inject `analysisStatus` item at position 0 when `analysing`/`completed`/`failed`

**File:** `apps/mobile/src/components/chat/MessageList.tsx` — handle `analysisStatus` in `renderItem` + `keyExtractor`

### 5.2 Error handling

**File:** `apps/mobile/app/(messages)/[conversationId].tsx`

- Show error toast when `analysisError` is set, then clear
- Failed run retry: "Retry" in banner dispatches `startAnalysis` again

### Verification

- Animated banner during analysis
- Completion banner with navigation to entry
- Failed run shows error + retry
- Network errors during polling don't crash

---

## Phase 6: Entry Detail + Post-Analysis Flow

After analysis completes, the user needs to view, review, and act on the generated artefact. Currently there is no detail screen — tapping an entry from the list navigates back to the chat. This phase adds the entry detail screen, backend endpoints for single-artefact fetch and status updates, and wires navigation from both the chat completion state and the entries list.

### 6.1 Backend — Single artefact + status endpoints

**File:** `apps/api/src/artefacts/artefacts.controller.ts`

Add endpoints:
- `GET /artefacts/:id` — Fetch single artefact by xid (includes reflection, capabilities, PDP actions)
- `PATCH /artefacts/:id/status` — Update artefact status (e.g. REVIEW → FINAL)

**File:** `apps/api/src/artefacts/artefacts.service.ts`

- `findByXid(userId, xid)` — fetch single artefact, attach PDP actions
- `updateStatus(userId, xid, newStatus)` — validate transition (REVIEW → FINAL only), update

**File:** `apps/api/src/artefacts/artefacts.repository.interface.ts`

- Add `findByXid(userId, xid)` to interface + implementation

### 6.2 Backend — PDP action completion

**File:** `apps/api/src/pdp-actions/pdp-actions.controller.ts` (new or extend existing)

- `PATCH /pdp-actions/:id` — Mark PDP action as complete/incomplete (toggle `completedAt`)

**File:** `apps/api/src/pdp-actions/schemas/pdp-action.schema.ts`

- Ensure `completedAt: Date | null` field exists

### 6.3 API client — New methods

**File:** `packages/api-client/src/clients/artefacts.client.ts`

Add methods:
- `getArtefact(id: string): Promise<Artefact>` — `GET /artefacts/:id`
- `updateStatus(id: string, status: ArtefactStatus): Promise<Artefact>` — `PATCH /artefacts/:id/status`

**File:** `packages/api-client/src/clients/pdp-actions.client.ts` (new)

- `toggleComplete(id: string): Promise<PdpAction>` — `PATCH /pdp-actions/:id`

### 6.4 Redux — Artefact detail state

**File:** `apps/mobile/src/store/slices/artefacts/thunks.ts`

Add thunks:
- `fetchArtefact({ artefactId })` — single artefact fetch
- `updateArtefactStatus({ artefactId, status })` — status transition
- `togglePdpAction({ actionId })` — mark PDP action complete/incomplete

**File:** `apps/mobile/src/store/slices/artefacts/slice.ts`

- Handle new thunks in extra reducers
- Update entity in store on status change

### 6.5 Entry Detail Screen

**New file:** `apps/mobile/app/(entry)/[artefactId].tsx`

Sections (scrollable):
- **Header** — Title, entry type badge, status pill, date
- **Reflection** — Expandable/collapsible sections (Presentation, Analysis, Learning Points, etc.)
- **Capabilities** — List of tagged capabilities with code, name, and reasoning
- **PDP Actions** — Action items with timeframes, checkboxes to mark complete
- **Footer actions** — "Mark as Final" button (when status is REVIEW), "Open Chat" link

Props derived from Redux `selectArtefactById`.

### 6.6 Navigation wiring

**File:** `apps/mobile/app/(messages)/[conversationId].tsx`

- When `phase === 'completed'`: show ActionBanner with `variant="viewEntry"` that navigates to `(entry)/[artefactId]`
- Derive `artefactId` from the conversation (available in the artefact entity linked to this conversation)

**File:** `apps/mobile/app/(tabs)/entries/index.tsx`

- Change tap handler: navigate to `(entry)/[artefactId]` instead of `(messages)/[conversationId]`
- Add secondary action (long-press or icon) to open chat

**File:** `apps/mobile/app/(tabs)/index.tsx` (Home)

- Update `RecentEntryCard` tap to navigate to entry detail

### 6.7 PDP Actions tab

**File:** `apps/mobile/app/(tabs)/pdp.tsx`

- Fetch PDP actions (grouped by artefact/entry)
- Render action list with checkboxes and timeframes
- Tap checkbox toggles completion via `togglePdpAction` thunk

### Verification

- Analysis completes → "View Entry" banner appears in chat → tap → entry detail screen
- Entry detail shows reflection sections, capabilities with reasoning, PDP actions
- Tap capability → shows code + name + reasoning
- Tap PDP checkbox → marks action complete, persists to backend
- "Mark as Final" → status changes to FINAL, pill updates
- Entries list → tap entry → opens detail screen (not chat)
- Home → tap recent entry → opens detail screen
- PDP tab → shows all PDP actions across entries

---

## File Manifest

### Modify

| File | Phases |
|------|--------|
| `packages/api-client/src/clients/conversations.client.ts` | 1 ✅ |
| `packages/api-client/src/clients/artefacts.client.ts` | 6 |
| `apps/api/src/artefacts/artefacts.controller.ts` | 6 |
| `apps/api/src/artefacts/artefacts.service.ts` | 6 |
| `apps/api/src/artefacts/artefacts.repository.interface.ts` | 6 |
| `apps/mobile/src/store/slices/messages/thunks.ts` | 1 ✅ |
| `apps/mobile/src/store/slices/messages/slice.ts` | 1 ✅, 3, 5 |
| `apps/mobile/src/store/slices/artefacts/thunks.ts` | 6 |
| `apps/mobile/src/store/slices/artefacts/slice.ts` | 6 |
| `apps/mobile/app/(messages)/[conversationId].tsx` | 1 ✅, 2, 3, 4, 5, 6 |
| `apps/mobile/app/(tabs)/entries/index.tsx` | 6 |
| `apps/mobile/app/(tabs)/index.tsx` | 6 |
| `apps/mobile/app/(tabs)/pdp.tsx` | 6 |
| `apps/mobile/src/components/ChatComposer.tsx` | 2, 3 |
| `apps/mobile/src/components/chat/MessageRow.tsx` | 4 |
| `apps/mobile/src/components/chat/MessageList.tsx` | 4, 5 |
| `apps/mobile/src/components/chat/hooks/useMessageGroups.ts` | 5 |
| `apps/mobile/src/components/chat/types.ts` | 5 |

### Create

| File | Phase |
|------|-------|
| `apps/mobile/src/components/chat/bubble/QuestionContent.tsx` | 4 |
| `apps/mobile/src/components/chat/bubble/questions/SingleSelectCard.tsx` | 4 |
| `apps/mobile/src/components/chat/bubble/questions/MultiSelectCard.tsx` | 4 |
| `apps/mobile/src/components/chat/bubble/questions/FreeTextPrompts.tsx` | 4 |
| `apps/mobile/src/components/chat/items/AnalysisStatusBanner.tsx` | 5 |
| `apps/mobile/app/(entry)/[artefactId].tsx` | 6 |
| `packages/api-client/src/clients/pdp-actions.client.ts` | 6 |

## Redux State Shape (Final)

```typescript
messages: {
  entities: Record<string, Message>
  ids: string[]
  idsByConversation: Record<string, string[]>
  contextByConversation: Record<string, ConversationContext>  // Phase 1
  loading: boolean
  sending: boolean
  analysisLoading: boolean   // Phase 1
  analysisError: string | null  // Phase 1
  error: string | null
}
```
