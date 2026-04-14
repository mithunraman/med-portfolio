# Entity Deletion Feature — Implementation Plan

## Overall Objective

Enable users to permanently delete their data at the entity level:

1. **Delete a conversation** while the AI analysis is still in progress (`IN_CONVERSATION` status) — removes the conversation, its messages, the associated artefact, and any linked PDP goals.
2. **Delete an artefact** after it has been created (`IN_REVIEW`, `COMPLETED`, or `ARCHIVED` status) — cascades to the linked conversation, messages, and all associated PDP goals.
3. **Delete a PDP goal** independently — removes a single goal and its actions without touching the parent artefact or conversation.

All deletions are **permanent soft-deletes**: content is anonymized to `'[deleted]'`, status set to `DELETED (-999)`, and media is marked for deferred cleanup by the existing cron job. No undo or version snapshot. The pattern mirrors the existing `anonymizeByUser()` account-cleanup pipeline, but scoped to individual entities.

---

## Phase 1: Backend — Repository Layer

### Objective
Add entity-scoped anonymize methods to existing repositories. The current `anonymizeByUser()` methods operate on all data for a user. We need targeted methods that operate on a single artefact, conversation, or goal.

### Scope
- **Included:** New repository interface methods + Mongoose implementations for conversations, artefacts, PDP goals, media, outbox.
- **Excluded:** Analysis runs repo (already has `anonymizeByConversationIds`). No schema changes needed.

### Implementation Plan

**1. Conversations repository** — [conversations.repository.interface.ts](apps/api/src/conversations/conversations.repository.interface.ts) + [conversations.repository.ts](apps/api/src/conversations/conversations.repository.ts)

Add two methods to `IConversationsRepository`:

```typescript
// Anonymize a single conversation + all its messages
anonymizeConversation(
  conversationId: Types.ObjectId,
  session?: ClientSession
): Promise<Result<number, DBError>>;

// Find conversation IDs linked to an artefact (for cascade from artefact delete)
findConversationIdsByArtefact(
  artefactId: Types.ObjectId,
  session?: ClientSession
): Promise<Result<Types.ObjectId[], DBError>>;
```

Implementation follows `anonymizeByUser()` (line 330) but filters by `_id` / `conversation` field instead of `userId`:
- Conversation: `{ _id: conversationId }` → set title `'[deleted]'`, status `DELETED`
- Messages: `{ conversation: conversationId }` → set all content fields to `'[deleted]'`, status `DELETED`, `$unset` question/answer

**2. Artefacts repository** — [artefacts.repository.interface.ts](apps/api/src/artefacts/artefacts.repository.interface.ts) + [artefacts.repository.ts](apps/api/src/artefacts/artefacts.repository.ts)

Add one method to `IArtefactsRepository`:

```typescript
anonymizeArtefact(
  artefactId: Types.ObjectId,
  session?: ClientSession
): Promise<Result<void, DBError>>;
```

Implementation mirrors `anonymizeByUser()` (line 165) but targets `{ _id: artefactId }`:
- Set title `'[deleted]'`, reflection `[]`, capabilities `[]`, tags `{}`, status `DELETED`

**3. PDP Goals repository** — [pdp-goals.repository.interface.ts](apps/api/src/pdp-goals/pdp-goals.repository.interface.ts) + [pdp-goals.repository.ts](apps/api/src/pdp-goals/pdp-goals.repository.ts)

Add two methods to `IPdpGoalsRepository`:

```typescript
// Anonymize all goals for a given artefact
anonymizeByArtefactId(
  artefactId: Types.ObjectId,
  session?: ClientSession
): Promise<Result<number, DBError>>;

// Anonymize a single goal by xid + userId (ownership check built-in)
anonymizeGoal(
  xid: string,
  userId: Types.ObjectId,
  session?: ClientSession
): Promise<Result<boolean, DBError>>;
```

Implementation follows `anonymizeByUser()` (line 344): set goal `'[deleted]'`, completionReview `null`, status `DELETED`, and cascade to all embedded actions via `'actions.$[]'`.

**4. Media repository** — [media.repository.interface.ts](apps/api/src/media/media.repository.interface.ts) + [media.repository.ts](apps/api/src/media/media.repository.ts)

Add one method to `IMediaRepository`:

```typescript
// Mark media DELETED for all media linked to messages in a conversation.
// Requires a join: find message IDs for the conversation, then update media
// that references those messages.
markDeletedByConversationId(
  conversationId: Types.ObjectId,
  session?: ClientSession
): Promise<Result<number, DBError>>;
```

Implementation: query messages by `{ conversation: conversationId }` to get message `_id` list, then `updateMany` on media where `refDocumentId: { $in: messageIds }` and `refCollection: 'messages'`, setting status to `MediaStatus.DELETED`. This avoids deleting S3 objects — the existing daily cron handles that.

**5. Outbox repository** — [outbox.repository.interface.ts](apps/api/src/outbox/outbox.repository.interface.ts) + [outbox.repository.ts](apps/api/src/outbox/outbox.repository.ts)

Add one method to `IOutboxRepository`:

```typescript
cancelByConversationId(
  conversationId: string,
  session?: ClientSession
): Promise<Result<number, DBError>>;
```

Implementation: mirrors `cancelByUser()` but filters only on `payload.conversationId === conversationId`. Sets status to `FAILED` with message `'Entity deleted'`.

### Deliverables
- 7 new interface methods across 5 repository interfaces
- 7 corresponding Mongoose implementations
- All methods accept optional `ClientSession` for transactional use
- All return `Result<T, DBError>` per project convention

### Best Industry Patterns
- **Repository pattern with Result type**: No throwing from the data layer. All error handling is explicit and pushed to the service layer. This is already the established pattern.
- **Soft delete / anonymization**: Data is never hard-deleted. Content is scrubbed, status is set to a terminal value, and the record remains for audit/integrity. Referential integrity is maintained.
- **Session propagation**: All methods accept `ClientSession` to participate in MongoDB transactions when called from services.

### Code Guidance
- Each new method should be 10–20 lines, modeled directly on the existing `anonymizeByUser()` in each repository. Avoid creating helpers or abstractions — these are one-to-one with the existing pattern.
- `markDeletedByConversationId` on media is the only method that requires a cross-collection lookup (messages → media). Use a two-step query rather than aggregation pipeline for clarity.

### Risks / Tradeoffs
- **`anonymizeByConversationIds` on analysis-runs does NOT accept a session.** Call it outside the transaction. This is acceptable: the account-cleanup service already does this, and analysis runs are idempotent to re-anonymize.
- **Media cross-collection lookup** adds a query step. The message count per conversation is bounded (typically <100), so `$in` on message IDs is fine.

---

## Phase 2: Backend — Service Layer

### Objective
Add orchestration logic for each delete operation. Services validate ownership, enforce status guards, wrap repository calls in transactions, and emit events.

### Scope
- **Included:** Three new service methods (`deleteConversation`, `deleteArtefact`, `deleteGoal`).
- **Excluded:** No changes to existing service methods.

### Implementation Plan

**1. `ConversationsService.deleteConversation(userId, conversationXid)`** — [conversations.service.ts](apps/api/src/conversations/conversations.service.ts)

New dependencies needed: inject `IArtefactsRepository`, `IPdpGoalsRepository`, `IAnalysisRunsRepository`, `IOutboxRepository` (some may already be injected — `IArtefactsRepository` and `IMediaRepository` are already present).

```
1. Find conversation by xid + userId → NotFoundException if missing
2. Find artefact by conversation.artefact → NotFoundException if missing
3. Guard: artefact.status must be ArtefactStatus.IN_CONVERSATION → BadRequestException otherwise
4. transactionService.withTransaction:
   a. outboxRepo.cancelByConversationId(conversation._id.toString(), session)
   b. mediaRepo.markDeletedByConversationId(conversation._id, session)
   c. conversationsRepo.anonymizeConversation(conversation._id, session)
   d. artefactsRepo.anonymizeArtefact(artefact._id, session)
   e. pdpGoalsRepo.anonymizeByArtefactId(artefact._id, session)
5. Outside transaction: analysisRunsRepo.anonymizeByConversationIds([conversation._id])
6. Return { message: 'Conversation deleted successfully' }
```

**2. `ArtefactsService.deleteArtefact(userId, artefactXid)`** — [artefacts.service.ts](apps/api/src/artefacts/artefacts.service.ts)

New dependencies needed: inject `IMediaRepository`, `IAnalysisRunsRepository`, `IOutboxRepository`.

```
1. Find artefact by xid + userId → NotFoundException if missing
2. Guard: artefact.status must NOT be IN_CONVERSATION → BadRequestException
   ("Use conversation delete while entry is in progress")
3. Guard: artefact.status must NOT be DELETED → NotFoundException (treat as already gone)
4. Find conversation IDs: conversationsRepo.findConversationIdsByArtefact(artefact._id)
5. transactionService.withTransaction:
   a. For each conversationId:
      - outboxRepo.cancelByConversationId(conversationId.toString(), session)
      - mediaRepo.markDeletedByConversationId(conversationId, session)
      - conversationsRepo.anonymizeConversation(conversationId, session)
   b. artefactsRepo.anonymizeArtefact(artefact._id, session)
   c. pdpGoalsRepo.anonymizeByArtefactId(artefact._id, session)
6. Outside transaction: analysisRunsRepo.anonymizeByConversationIds(conversationIds)
7. Emit ARTEFACT_STATE_CHANGED event (dashboard refresh)
8. Return { message: 'Entry deleted successfully' }
```

**3. `PdpGoalsService.deleteGoal(userId, goalXid)`** — [pdp-goals.service.ts](apps/api/src/pdp-goals/pdp-goals.service.ts)

```
1. Find goal by xid + userId via findOneWithArtefact → NotFoundException if missing
2. Guard: goal.status must NOT be DELETED → NotFoundException
3. pdpGoalsRepo.anonymizeGoal(goalXid, userId)  // no transaction needed — single updateOne
4. Return { message: 'Goal deleted successfully' }
```

### Deliverables
- 3 new service methods
- Proper ownership checks, status guards, and transactional wrapping
- Dashboard event emission on artefact delete

### Best Industry Patterns
- **Transaction boundary at service layer**: The service decides what constitutes an atomic unit of work. Repos are transaction-agnostic (they accept sessions but don't create them).
- **Guard clauses for status validation**: Fail fast with descriptive errors before starting expensive operations.
- **Best-effort cleanup outside transaction**: Analysis runs anonymization doesn't need to be atomic with the main delete — it's idempotent and re-runnable.

### Code Guidance
- Follow the existing service method structure: find entity → validate → transaction → emit event → return.
- `deleteConversation` needs new repo injections. Add them to the constructor — the module already provides most of these.
- Keep the return type as `{ message: string }` — no need for a shared DTO for this.

### Risks / Tradeoffs
- **ConversationsService gaining more repo dependencies** adds coupling. Acceptable because delete is inherently cross-entity. An alternative would be a dedicated `DeletionService`, but that's over-engineering for 3 methods.
- **Artefact delete with multiple conversations**: The `findConversationIdsByArtefact` query may return multiple conversations (e.g., if the artefact was duplicated). The loop handles this correctly.
- **Race condition**: If an analysis is running while the user deletes, the outbox cancel + analysis run anonymization handles it. The LangGraph runner will find a DELETED analysis run on next checkpoint and stop.

---

## Phase 3: Backend — Controller Layer

### Objective
Expose the three delete operations as REST endpoints.

### Scope
- **Included:** Three new `@Delete()` endpoints on existing controllers.
- **Excluded:** No new controllers or modules.

### Implementation Plan

**1. Conversations controller** — [conversations.controller.ts](apps/api/src/conversations/conversations.controller.ts)

```typescript
@Delete(':conversationId')
async deleteConversation(
  @CurrentUser() user: CurrentUserPayload,
  @Param('conversationId') conversationId: string,
): Promise<{ message: string }> {
  return this.conversationsService.deleteConversation(user.userId, conversationId);
}
```

Import `Delete` from `@nestjs/common`.

**2. Artefacts controller** — [artefacts.controller.ts](apps/api/src/artefacts/artefacts.controller.ts)

```typescript
@Delete(':id')
async deleteArtefact(
  @CurrentUser() user: CurrentUserPayload,
  @Param('id') id: string,
): Promise<{ message: string }> {
  return this.artefactsService.deleteArtefact(user.userId, id);
}
```

Import `Delete` from `@nestjs/common`.

**3. PDP Goals controller** — [pdp-goals.controller.ts](apps/api/src/pdp-goals/pdp-goals.controller.ts)

```typescript
@Delete(':xid')
async deleteGoal(
  @CurrentUser() user: CurrentUserPayload,
  @Param('xid') xid: string,
): Promise<{ message: string }> {
  return this.pdpGoalsService.deleteGoal(user.userId, xid);
}
```

Import `Delete` from `@nestjs/common`.

### Deliverables
- 3 new DELETE endpoints, all JWT-protected by global guard
- Consistent response shape: `{ message: string }`

### Best Industry Patterns
- **REST semantics**: DELETE method for destructive operations. Returns 200 with confirmation message (not 204) so the client has a response body to confirm success.
- **Thin controllers**: No business logic — just delegation to service.
- **Automatic auth**: Global `JwtAuthGuard` + `RolesGuard` protect all routes by default. No additional decorators needed.

### Code Guidance
- One-liner methods. No DTOs needed for DELETE (no request body).
- Add `Delete` to the existing `@nestjs/common` import — don't create a new import line.

### Risks / Tradeoffs
- None. Straightforward endpoint additions.

---

## Phase 4: API Client Package

### Objective
Add typed delete methods to the API client so the mobile app can call the new endpoints.

### Scope
- **Included:** 3 new methods across 3 client classes.
- **Excluded:** No new types in `packages/shared` — the `{ message: string }` response is simple enough to inline.

### Implementation Plan

**1. ArtefactsClient** — [artefacts.client.ts](packages/api-client/src/clients/artefacts.client.ts)

```typescript
async deleteArtefact(id: string): Promise<{ message: string }> {
  return this.client.delete<{ message: string }>(`/artefacts/${id}`);
}
```

**2. ConversationsClient** — [conversations.client.ts](packages/api-client/src/clients/conversations.client.ts)

```typescript
async deleteConversation(conversationId: string): Promise<{ message: string }> {
  return this.client.delete<{ message: string }>(`/conversations/${conversationId}`);
}
```

**3. PdpGoalsClient** — [pdp-goals.client.ts](packages/api-client/src/clients/pdp-goals.client.ts)

```typescript
async deleteGoal(goalId: string): Promise<{ message: string }> {
  return this.client.delete<{ message: string }>(`/pdp-goals/${goalId}`);
}
```

**4. Rebuild**: `cd packages/api-client && pnpm build` — required for mobile to pick up changes.

### Deliverables
- 3 new client methods
- Rebuilt `dist/` for mobile consumption

### Best Industry Patterns
- **Typed HTTP client**: Consistent with the existing adapter pattern. `BaseApiClient.delete<T>()` already exists.
- **No shared DTO for trivial types**: `{ message: string }` is not worth a shared type declaration. It adds indirection without value.

### Code Guidance
- One method per client, placed at the end of the class. Follow the naming convention of existing methods.

### Risks / Tradeoffs
- None.

---

## Phase 5: Mobile — Redux State Management

### Objective
Add Redux thunks and slice reducers to handle delete operations and clean up local state.

### Scope
- **Included:** New thunks for all 3 deletes, slice reducer cases, cross-slice cleanup.
- **Excluded:** UI components (Phase 6).

### Implementation Plan

**1. Artefacts thunks** — [thunks.ts](apps/mobile/src/store/slices/artefacts/thunks.ts)

```typescript
export const deleteArtefact = createAsyncThunk(
  'artefacts/deleteArtefact',
  async (params: { artefactId: string }, { rejectWithValue }) => {
    try {
      await api.artefacts.deleteArtefact(params.artefactId);
      return params.artefactId;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete entry';
      return rejectWithValue(message);
    }
  }
);
```

**2. Artefacts slice** — [slice.ts](apps/mobile/src/store/slices/artefacts/slice.ts)

Add cases for `deleteArtefact`:
- `pending`: set `updatingStatus: true`
- `fulfilled`: `artefactsAdapter.removeOne(state, action.payload)` — removes from normalized store
- `rejected`: set `updatingStatus: false`, set error

**3. Conversations thunks** — [thunks.ts](apps/mobile/src/store/slices/conversations/thunks.ts)

```typescript
export const deleteConversation = createAsyncThunk(
  'conversations/deleteConversation',
  async (params: { conversationId: string }, { rejectWithValue }) => {
    try {
      await api.conversations.deleteConversation(params.conversationId);
      return params.conversationId;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete conversation';
      return rejectWithValue(message);
    }
  }
);
```

**4. Conversations slice** — handle `deleteConversation.fulfilled`: remove from state if conversations are stored in a normalized adapter.

**5. Messages slice** — handle `deleteConversation.fulfilled` cross-slice: clear all messages for that conversation from the messages store.

**6. PDP Goals thunks** — [thunks.ts](apps/mobile/src/store/slices/pdpGoals/thunks.ts)

```typescript
export const deletePdpGoal = createAsyncThunk(
  'pdpGoals/deletePdpGoal',
  async (params: { goalId: string }, { rejectWithValue }) => {
    try {
      await api.pdpGoals.deleteGoal(params.goalId);
      return params.goalId;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete goal';
      return rejectWithValue(message);
    }
  }
);
```

**7. PDP Goals slice** — [slice.ts](apps/mobile/src/store/slices/pdpGoals/slice.ts)

Add cases for `deletePdpGoal`:
- `pending`: set `mutating: true`
- `fulfilled`: `pdpGoalsAdapter.removeOne(state, action.payload)`, decrement `total`
- `rejected`: set `mutating: false`, set error

**8. Cross-slice: artefact delete → mark PDP goals stale**

In the `pdpGoals` slice, add:
```typescript
.addCase(deleteArtefact.fulfilled, (state) => {
  state.stale = true; // PDP goals linked to the artefact were deleted server-side
})
```

Similarly, in the `artefacts` slice, add:
```typescript
.addCase(deleteConversation.fulfilled, (state) => {
  state.stale = true; // The artefact was deleted server-side as part of conversation delete
})
```

**9. Export**: Update index files to export new thunks.

### Deliverables
- 3 new async thunks
- Slice reducer cases for pending/fulfilled/rejected
- Cross-slice staleness markers for cascaded deletes
- Updated index exports

### Best Industry Patterns
- **Optimistic removal from normalized store**: On `fulfilled`, use `adapter.removeOne()` to immediately remove the entity. No need for a full refetch.
- **Cross-slice staleness**: Rather than trying to determine which specific PDP goals to remove from state (would require knowing the artefact→goal mapping on the client), mark the slice as stale. The next time the user navigates to the goals list, it refetches. Simple and correct.
- **Thunk returns the ID, not the response**: Since the server returns `{ message }` and we need the ID to remove from state, the thunk returns the ID it was called with.

### Code Guidance
- Follow the exact pattern of existing thunks (logger scope, try/catch, rejectWithValue).
- Keep cross-slice cases minimal — just set `stale: true`.

### Risks / Tradeoffs
- **No optimistic delete (pending → remove)**: We wait for the server to confirm before removing from state. This is safer than optimistic removal, which would require rollback on failure. The delete API call is fast enough that the delay is negligible.
- **Stale flag approach**: Means the goals list will flash a loading state on next visit after an artefact delete. This is acceptable and simpler than surgically removing goals from state.

---

## Phase 6: Mobile — UI Integration

### Objective
Add delete buttons, confirmation dialogs, and navigation handling to the relevant screens.

### Scope
- **Included:** Conversation screen (delete during `IN_CONVERSATION`), artefact detail screen (delete after creation), PDP goal detail screen.
- **Excluded:** Swipe-to-delete on list views (could be added later).

### Implementation Plan

**1. Conversation screen** — `app/(messages)/[conversationId].tsx`

- Add a trash icon button in the header (right side), visible only when artefact status is `IN_CONVERSATION`.
- On press: show `Alert.alert` with title "Delete Conversation", message "This will permanently delete this conversation and the associated entry. This cannot be undone.", buttons: [Cancel, { text: "Delete", style: "destructive" }].
- On confirm: `dispatch(deleteConversation({ conversationId }))`. On fulfilled, `router.replace('/(tabs)')` to navigate to the main tab.

**2. Artefact detail screen** — `app/(entry)/[artefactId].tsx`

- Add "Delete Entry" option to the existing action sheet (if one exists) or header menu. Use destructive style (red text).
- Show confirmation: "Delete Entry", "This will permanently delete this entry, its conversation, and all linked goals. This cannot be undone."
- On confirm: `dispatch(deleteArtefact({ artefactId }))`. On fulfilled, navigate back to entries list.

**3. PDP Goal detail screen** — `app/(pdp-goal)/[goalId].tsx`

- Add "Delete Goal" option to the action sheet or header menu. Use destructive style.
- Show confirmation: "Delete Goal", "This will permanently delete this goal and all its actions. This cannot be undone."
- On confirm: `dispatch(deletePdpGoal({ goalId }))`. On fulfilled, navigate back to goals list.

**4. Loading state during delete**

- While the thunk is pending, disable the delete button or show a brief loading indicator. Use the `updatingStatus` / `mutating` flags from the slice.
- Do NOT show a full-screen loader — keep it lightweight.

### Deliverables
- Delete triggers on 3 screens
- Native confirmation dialogs (Alert.alert)
- Navigation back to list on success
- Disabled state during pending delete

### Best Industry Patterns
- **Destructive action confirmation**: Always confirm before permanent deletion. Use platform-native dialogs (`Alert.alert`) for consistency with iOS/Android patterns.
- **Destructive button styling**: Red/destructive style in action sheets and alerts signals danger to the user.
- **Navigate away after delete**: The entity no longer exists — staying on the detail screen would show stale data or errors. Navigate to the parent list.

### Code Guidance
- Use `Alert.alert` (React Native built-in), not a custom modal. It's native, accessible, and consistent.
- Dispatch the thunk and handle navigation in the `.then()` / `.unwrap()` callback:
  ```typescript
  dispatch(deleteArtefact({ artefactId }))
    .unwrap()
    .then(() => router.replace('/(tabs)'))
    .catch(() => { /* error is in Redux state, optionally show toast */ });
  ```
- Keep UI additions minimal — a single icon or menu item per screen.

### Risks / Tradeoffs
- **No undo**: Once deleted, the user cannot recover the data. The confirmation dialog is the only safeguard. This is by design per requirements.
- **Navigation timing**: If the delete API is slow, the user sees a brief delay before navigation. The loading state on the button handles this.
- **Stale list on navigate back**: The artefact is removed from Redux via `removeOne`, so the list will reflect the deletion immediately without refetch. PDP goals use `stale: true` and will refetch on next mount.

---

## Phase 7: Backend — Unit Tests

### Objective
Verify ownership checks, status guards, cascade behavior, and error handling for all three delete operations.

### Scope
- **Included:** Unit tests for the 3 new service methods. Mock all repository dependencies.
- **Excluded:** Integration tests, controller tests (NestJS E2E testing is a separate concern).

### Implementation Plan

**Test cases for `ConversationsService.deleteConversation`:**
1. Happy path: conversation found, artefact is IN_CONVERSATION → all repos called in correct order within transaction
2. Conversation not found → NotFoundException
3. Artefact not in IN_CONVERSATION → BadRequestException
4. Wrong user (conversation belongs to another user) → NotFoundException (findByXid returns null)

**Test cases for `ArtefactsService.deleteArtefact`:**
1. Happy path: artefact found, status is COMPLETED → cascade to conversations, media, goals
2. Artefact not found → NotFoundException
3. Artefact is IN_CONVERSATION → BadRequestException
4. Artefact already DELETED → NotFoundException
5. Multiple conversations for artefact → all anonymized

**Test cases for `PdpGoalsService.deleteGoal`:**
1. Happy path: goal found → anonymized
2. Goal not found → NotFoundException
3. Goal already DELETED → NotFoundException

### Deliverables
- Test cases added to existing spec files (or new spec files if none exist)
- All tests use mocked repositories
- Jest unit config, 10s timeout

### Best Industry Patterns
- **Arrange-Act-Assert**: Each test follows a clear structure.
- **Mock at the boundary**: Mock repository interfaces, not Mongoose models. Tests verify service orchestration logic, not database queries.
- **Guard clause testing**: Every status guard and ownership check has a dedicated test case.

### Code Guidance
- Use the existing test setup patterns in the codebase. Check for existing `.spec.ts` files to follow the mock setup approach.
- Mock `TransactionService.withTransaction` to just call the callback with a mock session.

### Risks / Tradeoffs
- **No integration tests in this phase**: The repo methods are thin wrappers around Mongoose — they're covered by the existing account-cleanup integration tests pattern. Service-level unit tests provide the most value here.

---

## Implementation Order

| Step | Phase | Est. Scope | Dependencies |
|------|-------|-----------|-------------|
| 1 | Phase 1 — Repository methods | ~7 methods across 5 files | None |
| 2 | Phase 2 — Service methods | 3 methods across 3 files | Phase 1 |
| 3 | Phase 3 — Controller endpoints | 3 endpoints across 3 files | Phase 2 |
| 4 | Phase 4 — API client | 3 methods + rebuild | Phase 3 |
| 5 | Phase 5 — Mobile Redux | 3 thunks + slice cases | Phase 4 |
| 6 | Phase 6 — Mobile UI | 3 screens | Phase 5 |
| 7 | Phase 7 — Unit tests | ~12 test cases | Phase 2 |

Phase 7 (tests) can be done in parallel with Phases 4–6 since it only depends on the service layer.
