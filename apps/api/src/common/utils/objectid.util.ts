import { Types } from 'mongoose';

export function objectIdsEqual(
  a: Types.ObjectId | string,
  b: Types.ObjectId | string,
): boolean {
  return a.toString() === b.toString();
}

/**
 * Convert an untrusted value to an ObjectId, throwing rather than fabricating one.
 *
 * `new Types.ObjectId(...)` treats `undefined` and `null` as "generate a fresh
 * id", so an absent field silently becomes a valid-looking identity that matches
 * nothing:
 *
 * ```
 * new Types.ObjectId(undefined) => 6a895d0e82cbdc58d2dcf3c7   // minted
 * new Types.ObjectId(null)      => 6a895d0e82cbdc58d2dcf3c8   // minted
 * new Types.ObjectId('')        => BSONError                  // throws
 * new Types.ObjectId('garbage') => BSONError                  // throws
 * ```
 *
 * Use this wherever an id crosses an untyped boundary — an outbox payload
 * (`Record<string, unknown>`) or an EventEmitter2 event (`emit(name,
 * ...values: any[])`), neither of which type-checks its shape at the emit or
 * enqueue site. `ctx` is prefixed to the error so the throw names its source.
 *
 * Only absence needs checking; malformed hex already throws on its own.
 */
export function toObjectId(value: unknown, ctx: string): Types.ObjectId {
  if (typeof value !== 'string') {
    throw new Error(
      `${ctx} is missing or not a string (got ${value === null ? 'null' : typeof value})`,
    );
  }
  return new Types.ObjectId(value);
}
