# Interrupt Crash Recovery

## Problem

When the graph pauses at an interrupt node (e.g. `present_classification`), the side-effect message (ASSISTANT message with classification options) is written by `PortfolioGraphService.handleInterruptSideEffects()` **after** the checkpoint is saved but **before** the method returns.

If Node.js crashes between the checkpoint write and the message write, the graph state is safely persisted in MongoDB but the user never receives the ASSISTANT message. The graph is stuck: paused at an interrupt with nothing for the user to respond to.

### Timeline

```
1. Graph runs -> node calls interrupt()
2. LangGraph checkpoints state to MongoDB (safe)
3. interrupt() throws GraphInterrupt
4. catch block -> calls handleInterruptSideEffects()
5. NODE.JS CRASHES (before or during createMessage)
6. No ASSISTANT message in DB
```

### On restart

- Checkpoint exists with `next: ['present_classification']` and the full interrupt payload
- Nothing triggers `handleInterruptSideEffects()` again
- User sees no classification options; graph is stuck

## Proposed Solution: Lazy Recovery (Option 1)

Recover on read rather than on boot. When the client asks for graph state (which it must do before rendering the UI), ensure the interrupt side effect has been applied.

### Approach

Add an `ensureInterruptPresented()` method to `PortfolioGraphService`:

```ts
async ensureInterruptPresented(conversationId: string): Promise<InterruptNode | null> {
  const pausedNode = await this.getPausedNode(conversationId);
  if (pausedNode) {
    await this.handleInterruptSideEffects(conversationId);
  }
  return pausedNode;
}
```

### Idempotency

`handleInterruptSideEffects()` must become idempotent so it's safe to call multiple times. Two options:

**A. Existence check:** Before writing, query for an existing message with `metadata.type === 'classification_options'` that is newer than the last user content message. If found, skip.

**B. Idempotency key (preferred):** Include the checkpoint ID in the message metadata. Before writing, check if a message with that checkpoint ID exists. This is a simple, deterministic uniqueness check:

```ts
const checkpointId = snapshot.config?.configurable?.checkpoint_id;

const metadata = {
  type: 'classification_options',
  checkpointId, // unique per interrupt
  options,
  ...
};

// Before writing:
// Query: does a message with metadata.checkpointId === checkpointId exist?
// If yes, skip. If no, write.
```

This requires adding a metadata query capability to `IConversationsRepository` (e.g. `findMessageByMetadata()` or a filter option on `listMessages()`).

### Why not eager recovery (Option 2)?

Scanning the checkpoints collection on boot adds startup latency and complexity. The lazy approach covers all cases (crash, deploy, network blip) and triggers naturally when the client interacts.

## Files to Change

| File | Change |
|---|---|
| `portfolio-graph.service.ts` | Add `ensureInterruptPresented()`. Make `handleInterruptSideEffects()` idempotent via checkpoint ID check. |
| `conversations.repository.interface.ts` | Add metadata filter support (or a `findMessageByCheckpointId()` method). |
| `conversations.repository.ts` | Implement the metadata query. |
| `conversations.service.ts` | Call `ensureInterruptPresented()` instead of `getPausedNode()` in `handleResume()`, or expose it to a polling endpoint. |

## Priority

Low. The failure window is small (between checkpoint write and message write). The impact is a stuck conversation, not data loss — the checkpoint is safe and the graph can be recovered.
