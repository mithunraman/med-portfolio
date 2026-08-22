import { Types } from 'mongoose';

/**
 * Read a required ObjectId field off an outbox payload, throwing if it is absent.
 *
 * ## Why this exists
 *
 * Outbox payloads are stored as `Record<string, unknown>` and every handler casts
 * them with `as unknown as SomePayload` — a cast the compiler accepts and nothing
 * enforces. Feeding a missing field straight into `new Types.ObjectId(...)` does
 * **not** throw: the constructor treats `undefined` and `null` as "generate one",
 * so a malformed job silently acquires a random identity.
 *
 * ```
 * new Types.ObjectId(undefined) => 6a895d0e82cbdc58d2dcf3c7   // minted
 * new Types.ObjectId(null)      => 6a895d0e82cbdc58d2dcf3c8   // minted
 * new Types.ObjectId('')        => BSONError                  // throws
 * new Types.ObjectId('garbage') => BSONError                  // throws
 * ```
 *
 * Downstream that id matches nothing, the handler returns normally, and the
 * consumer marks the job **completed** — a structurally broken job laundered into
 * a success, bypassing the bounded-retry → dead-letter → Sentry path built for
 * exactly this. `ProcessingService.markFailed` already argues the same point one
 * layer down: do not swallow, throw so the outbox can see it.
 *
 * Only absence needs checking — `''` and malformed hex already throw on their own.
 *
 * ## What this does NOT fix
 *
 * Throwing buys **visibility, not availability**. A dead-lettered job still leaves
 * its message at `PENDING` (or its run non-terminal), so the conversation's
 * send/analyse guards stay blocked. Marking the entity terminally FAILED cannot be
 * done from here — that write is itself owner-scoped by the `userId` this guard
 * just found missing. That is separate work; see the note in the PR.
 *
 * The durable fix is at the producer: `CreateOutboxEntryData.payload` is
 * `Record<string, unknown>`, so an enqueue site that omits a field still compiles.
 * Typing `enqueue` over a discriminated union of payload types would catch it at
 * compile time and make this guard a backstop rather than the only defence.
 */
export function requiredObjectId(
  payload: Record<string, unknown>,
  field: string,
  jobType: string
): Types.ObjectId {
  const raw = payload[field];
  if (typeof raw !== 'string') {
    throw new Error(
      `${jobType}: payload.${field} is missing or not a string (got ${raw === null ? 'null' : typeof raw})`
    );
  }
  // A malformed hex string throws BSONError here, which is the behaviour we want.
  return new Types.ObjectId(raw);
}
