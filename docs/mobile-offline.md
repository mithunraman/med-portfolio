# Mobile Offline Support — Architecture Discussion

## Problem Statement

Users can start conversations with the AI but may often be offline. We need to support storing messages locally and sending them when the user comes back online.

### Example Flow
- User is offline
- User creates a conversation (conversation/artefact stored locally)
  - If online, conversation is created on server
  - If offline, conversation is created locally on client
- User sends message to conversation (message stored locally first)
  - If online, message is sent immediately
  - If offline, message is stored locally against the conversation (conversation may or may not be created on the server yet)

This mimics the **outbox pattern** — actions are written to a queue-like structure, and a background job executes them one by one.

---

## Architecture Overview

### Core Pattern: Transactional Outbox

The outbox pattern (from distributed systems / microservices):

1. **Write locally first** (the "outbox")
2. **Process the outbox** when connectivity is available
3. **Reconcile** local state with server state

This is the same pattern used by WhatsApp, Signal, Linear, and Notion.

### High-Level Diagram

```
┌──────────────────────────────────┐
│          Redux Store             │
│  (in-memory, source of truth     │
│   for rendering)                 │
└──────┬──────────────┬────────────┘
       │              │
   Online?         Offline?
       │              │
┌──────▼───────┐ ┌────▼───────────┐
│ API Server   │ │ SQLite         │
│ (fetch, send)│ │ (read cache +  │
│              │ │  write outbox) │
└──────┬───────┘ └────────────────┘
       │
  write-through
       │
┌──────▼───────┐
│ SQLite       │
│ (update      │
│  cache)      │
└──────────────┘
```

**Key insight:** SQLite is never the source of truth. Redux is what the UI reads from. SQLite is the persistence layer that survives app restarts and fills Redux when the server is unreachable.

---

## Layer 1: Local Database — expo-sqlite

### Why SQLite, not AsyncStorage?

| Concern | AsyncStorage | SQLite |
|---|---|---|
| Querying | Key-value only, no queries | Full SQL — query by conversation, status, date |
| Performance | JSON parse on every read | Native cursors, indexed lookups |
| Transactions | None | ACID transactions (critical for outbox) |
| Size | 6MB limit on Android | Practically unlimited |
| Concurrency | Not safe | WAL mode handles concurrent reads/writes |
| Industry standard | Prototyping only | WhatsApp, Signal, Telegram, Linear all use SQLite |

### Why expo-sqlite over op-sqlite?

Since we're already on Expo, `expo-sqlite` is the right choice:

| Concern | `expo-sqlite` | `op-sqlite` |
|---|---|---|
| Expo compatibility | First-party, guaranteed to work with EAS builds | Third-party, may break on Expo SDK upgrades |
| API | Synchronous JSI-based since SDK 50, nearly identical perf | Synchronous JSI-based |
| Maintenance | Maintained by Expo team | Single maintainer |
| OTA updates | Works with `expo-updates` out of the box | Needs native rebuild on changes |
| Migrations | Built-in `useSQLiteContext` + `useMigrations` hook | Manual |
| Raw performance | ~5-10% slower in synthetic benchmarks | Fastest available |

The 5-10% perf difference is irrelevant for an outbox with dozens of messages. The operational simplicity of staying in the Expo ecosystem is worth far more.

### Schema

```sql
-- Local conversations (mirrors server + offline-created ones)
CREATE TABLE conversations (
  id            TEXT PRIMARY KEY,        -- server ID or local UUID
  local_id      TEXT UNIQUE NOT NULL,    -- always a local UUID
  server_id     TEXT UNIQUE,             -- NULL until synced
  status        INTEGER NOT NULL,
  artefact_id   TEXT,
  title         TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  context_json  TEXT                     -- cached ConversationContext
);

-- Local messages
CREATE TABLE messages (
  id              TEXT PRIMARY KEY,      -- server ID or local UUID
  local_id        TEXT UNIQUE NOT NULL,
  server_id       TEXT UNIQUE,           -- NULL until synced
  conversation_id TEXT NOT NULL,         -- references conversations.local_id
  role            INTEGER NOT NULL,
  type            INTEGER NOT NULL,
  content         TEXT,
  media_id        TEXT,
  processing_status INTEGER NOT NULL DEFAULT 100,
  question_json   TEXT,
  created_at      TEXT NOT NULL,
  sync_status     TEXT NOT NULL DEFAULT 'pending'  -- 'pending' | 'synced' | 'failed'
);

-- The outbox: ordered queue of operations to execute
CREATE TABLE outbox (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  operation       TEXT NOT NULL,         -- 'create_artefact' | 'send_message' | 'send_audio_message' | 'start_analysis' | 'resume_analysis'
  payload_json    TEXT NOT NULL,         -- operation-specific data
  conversation_local_id TEXT NOT NULL,   -- which conversation this belongs to
  status          TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'in_flight' | 'failed' | 'completed'
  retry_count     INTEGER NOT NULL DEFAULT 0,
  max_retries     INTEGER NOT NULL DEFAULT 5,
  created_at      TEXT NOT NULL,
  last_attempt_at TEXT,
  error_message   TEXT
);

CREATE INDEX idx_outbox_status ON outbox(status, created_at);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
```

---

## Layer 2: Outbox Processor (The Core Engine)

A singleton service that runs as long as the app is in the foreground.

### Design Principles

1. **FIFO per conversation** — messages within a conversation must be sent in order
2. **Parallel across conversations** — different conversations can sync concurrently
3. **Idempotent operations** — every operation must be safe to retry
4. **Exponential backoff** — failed operations retry with increasing delay
5. **Dependency-aware** — a `send_message` waits until `create_artefact` for its conversation succeeds (because it needs the server conversation ID)

### Processor Logic

```typescript
class OutboxProcessor {
  private isProcessing = false;
  private netInfo: NetInfoState;

  // Called when: app comes online, new item enqueued, app foregrounded
  async process() {
    if (this.isProcessing || !this.netInfo.isConnected) return;
    this.isProcessing = true;

    try {
      // Get oldest pending item per conversation (FIFO per conversation)
      const items = db.exec(`
        SELECT * FROM outbox
        WHERE status IN ('pending', 'failed')
          AND retry_count < max_retries
        GROUP BY conversation_local_id
        HAVING id = MIN(id)
        ORDER BY created_at ASC
      `);

      await Promise.allSettled(
        items.map(item => this.processItem(item))
      );
    } finally {
      this.isProcessing = false;
      if (this.hasPendingItems()) this.scheduleNextRun();
    }
  }

  private async processItem(item: OutboxItem) {
    db.exec(`UPDATE outbox SET status = 'in_flight', last_attempt_at = ? WHERE id = ?`,
      [new Date().toISOString(), item.id]);

    try {
      switch (item.operation) {
        case 'create_artefact':
          await this.handleCreateArtefact(item);
          break;
        case 'send_message':
          const serverId = this.resolveServerConversationId(item.conversation_local_id);
          if (!serverId) {
            db.exec(`UPDATE outbox SET status = 'pending' WHERE id = ?`, [item.id]);
            return;
          }
          await this.handleSendMessage(item, serverId);
          break;
        case 'send_audio_message':
          await this.handleSendAudioMessage(item);
          break;
      }

      db.exec(`UPDATE outbox SET status = 'completed' WHERE id = ?`, [item.id]);
    } catch (err) {
      db.exec(`
        UPDATE outbox SET
          status = 'failed',
          retry_count = retry_count + 1,
          error_message = ?
        WHERE id = ?
      `, [err.message, item.id]);
    }
  }
}
```

### Retry Strategy

```
Attempt 1: immediate
Attempt 2: 1s delay
Attempt 3: 4s delay
Attempt 4: 16s delay
Attempt 5: 64s delay (give up after this)
```

Formula: `delay = Math.min(BASE^attempt, MAX_DELAY)` — standard exponential backoff.

For **non-retryable errors** (400, 401, 403, 422), mark as `failed` immediately with no retry.

---

## Layer 3: Redux Integration

### Modified Thunks (Offline-Aware)

Thunks write locally first, then enqueue to outbox, instead of calling the API directly.

```typescript
// BEFORE (current)
export const sendMessage = createAsyncThunk(
  'messages/send',
  async ({ conversationId, content }, { getState }) => {
    const response = await api.conversations.sendMessage(conversationId, { content });
    return response;
  }
);

// AFTER (offline-first)
export const sendMessage = createAsyncThunk(
  'messages/send',
  async ({ conversationId, content }, { dispatch }) => {
    const localId = randomUUID();
    const now = new Date().toISOString();

    const localMessage: Message = {
      id: localId,
      conversationId,
      role: MessageRole.USER,
      type: MessageType.TEXT,
      content,
      processingStatus: MessageProcessingStatus.PENDING,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    };

    // Single transaction: write message + outbox entry
    db.transaction(() => {
      db.exec(`INSERT INTO messages (...) VALUES (...)`, [/* localMessage fields */]);
      db.exec(`INSERT INTO outbox (...) VALUES (...)`, [{
        operation: 'send_message',
        payload: { localMessageId: localId, content },
        conversationLocalId: conversationId,
      }]);
    });

    // Update Redux (instant UI feedback)
    dispatch(messagesSlice.actions.upsertMessage(localMessage));

    // Kick the outbox processor
    OutboxProcessor.instance.process();

    return localMessage;
  }
);
```

---

## Layer 4: Connectivity Management

Uses `@react-native-community/netinfo`:

```typescript
class ConnectivityManager {
  private unsubscribe: () => void;

  start() {
    this.unsubscribe = NetInfo.addEventListener(state => {
      store.dispatch(setConnectivity(state.isConnected));

      if (state.isConnected) {
        OutboxProcessor.instance.process();
      }
    });
  }
}
```

### Two-tier connectivity check

`NetInfo.isConnected` can be `true` even when the API is unreachable (captive portal, server down, DNS issues).

- **NetInfo** for fast offline detection (no network at all)
- **API ping with timeout** (e.g., `GET /health`, 5s timeout) for "connected but API unreachable" detection
- Treat both as offline for UX purposes

---

## Layer 5: Data Lifecycle — Hybrid Cache Strategy

### Approach: Keep cache, delete only outbox

```
outbox table       → DELETE after successful sync (operations, not data)
messages table     → OVERWRITE with server response on every successful fetch
conversations table → OVERWRITE with server response on every successful fetch
```

- **Outbox stays lean** — only pending operations, cleared on success
- **Cache stays warm** — always has latest server snapshot for offline fallback
- **No stale data when online** — server fetch overwrites the cache every time
- **Retention policy** — keep only recent data, prune on app launch

```sql
-- Prune old cached data on app boot
DELETE FROM messages
WHERE conversation_id IN (
  SELECT local_id FROM conversations
  WHERE updated_at < datetime('now', '-30 days')
);
DELETE FROM conversations WHERE updated_at < datetime('now', '-30 days');
```

### Online vs Offline rendering rule

```
Online  → fetch from server, render server data (current behavior, unchanged)
          also write response to SQLite (cache for later offline use)
Offline → read from SQLite cache, render cached data
          user actions write to outbox
```

No reconciliation logic needed. Server is always source of truth when reachable.

---

## Layer 6: Offline UI — Light Mode

When offline, the app renders a simplified purpose-built experience instead of a degraded full app.

### Screen Design

```
┌─────────────────────────────────┐
│  ⚠ You're offline               │
│  [Retry Connection]             │
├─────────────────────────────────┤
│                                 │
│  Unsent Conversations (2)       │
│                                 │
│  ┌─────────────────────────┐    │
│  │  Mar 12, 3:42 PM        │    │
│  │ "Discussed Q3 sprint…"  │    │
│  │ 3 messages pending      │    │
│  └─────────────────────────┘    │
│  ┌─────────────────────────┐    │
│  │  Mar 12, 3:15 PM        │    │
│  │ "Had a 1:1 with…"      │    │
│  │ 1 message pending       │    │
│  └─────────────────────────┘    │
│                                 │
│  [+ Start New Conversation]     │
│                                 │
└─────────────────────────────────┘
```

### Implementation

Conditionally render based on connectivity in the existing screen:

```typescript
// (messages)/index.tsx
const isConnected = useAppSelector(s => s.network.isConnected);

if (isConnected) {
  return <OnlineConversationList />;   // existing behavior
} else {
  return <OfflineConversationList />;  // new lightweight view
}
```

### Offline chat screen differences

- **No polling** (skip the useEffect that starts polling)
- **No analysis actions** (hide ActionBanner entirely — analysis requires server-side LangGraph)
- **No question answering** (questions come from server-side analysis)
- **Voice notes allowed** (audio stored locally, uploaded on sync)
- **Offline badge** on screen header
- **Sync status indicators** on message bubbles

### Retry button behavior

1. Force `NetInfo.refresh()` (re-checks actual connectivity)
2. If connected, ping API health endpoint (WiFi connected ≠ API reachable)
3. If API reachable, flip to online mode, flush outbox, re-fetch from server

### Offline capability table

| Action | Offline? | Notes |
|---|---|---|
| Start new conversation | Yes | Local UUID + outbox entry |
| Send text message | Yes | Written to outbox |
| Send voice note | Yes | Audio stored in `documentDirectory`, uploaded on sync |
| Start/resume analysis | No | Server-side LangGraph |
| Answer questions | No | Questions come from analysis |
| View past synced conversations | Yes | Cached in SQLite |
| View completed artefacts | Yes | If cached |

---

## Voice Notes — Offline Support

### Current flow (online)

```
Record audio → temp file on device → get presigned URL → upload to S3 → get mediaId → send message with mediaId
```

### Offline flow

```
Record audio → temp file on device → copy to persistent local dir → write outbox entry → done
```

### Critical: Persist audio files durably

Expo's audio recorder writes to `FileSystem.cacheDirectory`. The OS can purge cache files at any time. After recording, move to permanent storage:

```typescript
const permanentDir = `${FileSystem.documentDirectory}offline-audio/`;
await FileSystem.makeDirectoryAsync(permanentDir, { intermediates: true });

const permanentPath = `${permanentDir}${localMessageId}.m4a`;
await FileSystem.moveAsync({ from: tempUri, to: permanentPath });

db.exec(`INSERT INTO outbox ...`, [{
  operation: 'send_audio_message',
  payload: { localMessageId, audioPath: permanentPath, conversationLocalId },
}]);
```

### Outbox processing for audio (when back online)

Two-step operation:

```
1. Get presigned URL     →  POST /media/upload-url
2. Upload file to S3     →  PUT to presigned URL
3. Send message          →  POST /conversations/{id}/messages { mediaId }
4. Delete local file     →  FileSystem.deleteAsync(audioPath)
```

All four steps are one atomic outbox operation. If step 2 fails, retry the whole sequence (presigned URLs expire, so you need a fresh one on retry).

### Storage cap

Audio files are large (~100KB-1MB per message). Cap at ~50MB of offline audio. If exceeded, tell the user "Offline storage full, connect to sync pending voice notes."

---

## Edge Cases & Ambiguous Scenarios

### A. Mid-message connectivity drop

User is online, sends a message, HTTP request is in-flight, network drops. Did the server receive it?

**Solution:** Idempotency keys. Every message gets a `localId` (UUID) sent as `X-Idempotency-Key`. Server deduplicates. Retries are always safe.

### B. Conversation created offline → user force-kills app → reopens online

Outbox has a `create_artefact` entry that never executed. On boot, show the user their pending offline conversations and let them **confirm or discard**. Don't auto-flush silently.

### C. Multiple messages queued offline → first message fails on sync

User sends 5 messages offline. Message 1 fails (400). Messages 2-5 are blocked (FIFO).

**Solution:** Block the queue and surface to user — show "Message failed to send" with **Retry** or **Delete** options. Only proceed after user decides. This is what iMessage and WhatsApp do.

### D. Artefact creation fails but messages exist

`create_artefact` returns 422. Orphaned messages with no server-side conversation.

**Solution:** Surface to user: "This conversation couldn't be synced. [Retry] [Delete]". Messages aren't lost (in SQLite), but user decides what to do.

### E. Offline → online transition while user is mid-typing

**Solution:** Don't interrupt. Show a subtle "Back online" toast. Let them finish and send. Flush earlier outbox items in the background. Don't navigate away.

### F. App stays offline for days

Cache grows stale. Not a problem — online = always fetch from server. Stale cache is only shown while offline.

---

## Boot Sequence

```
App Launch
  │
  ├─ 1. Open SQLite database
  ├─ 2. Run migrations if needed
  ├─ 3. Start ConnectivityManager
  ├─ 4. Check connectivity
  │     ├─ Online → fetch from server → render (existing behavior)
  │     │           └─ write-through to SQLite cache
  │     └─ Offline → hydrate Redux from SQLite → render cached data
  ├─ 5. If online, flush outbox
  └─ 6. Start polling (only when online)
```

---

## Backend Changes Required

| Change | Why |
|---|---|
| `X-Idempotency-Key` on `POST /messages` | Prevents duplicates from retried sends |
| `X-Idempotency-Key` on `POST /artefacts` | Prevents duplicate conversation creation |
| `GET /health` lightweight endpoint | Reliable online detection |

---

## Industry Standards & Best Practices

### 1. Local-First Software (Martin Kleppmann)
The local copy is the primary copy, server is a replica. App works fully offline and syncs when possible.

### 2. CRDT vs Last-Write-Wins
For chat messages (append-only, immutable), we don't need CRDTs. Simple last-write-wins with server authority is sufficient.

### 3. Outbox Pattern (Chris Richardson)
Atomically write business data and outbox entry in a single transaction. SQLite transactions give us this guarantee.

### 4. Optimistic UI
Show the result immediately, reconcile later. Sync indicator is the only hint it hasn't reached the server yet.

### 5. Exponential Backoff with Jitter (AWS Best Practice)
Prevents thundering herd. `delay = min(BASE^attempt, MAX) * (0.5 + random(0.5))`.

### 6. Idempotency Keys
Every outbox operation carries an idempotency key (the local UUID). Server deduplicates within a 24-hour window.

### 7. Queue Ordering Guarantees
FIFO per conversation, parallel across conversations. Same guarantee as Kafka per-partition.

---

## Suggested Implementation Phases

**Phase 1 — Foundation:** expo-sqlite + schema + connectivity tracking. App loads from cache when offline, still sends online-only.

**Phase 2 — Outbox for messages:** Offline message queueing for text. Conversations must still be created online.

**Phase 3 — Voice notes offline:** Durable audio file storage + audio outbox operations.

**Phase 4 — Outbox for conversation creation:** Full offline conversation creation + message chaining.

**Phase 5 — Backend idempotency:** `X-Idempotency-Key` support on POST endpoints + `GET /health`.

**Phase 6 — Polish:** Sync indicators, retry UI, failed message handling, offline banner, storage caps.
