import type { ClientSession } from 'mongoose';
import type { DBError, Result } from '../common/utils/result.util';

export const CHECKPOINT_REPOSITORY = Symbol('CHECKPOINT_REPOSITORY');

/** Documents removed by a purge, per collection. */
export interface PurgeCounts {
  checkpoints: number;
  writes: number;
}

/**
 * Deletion primitive for the LangGraph checkpointer's storage.
 *
 * ## Ownership — read before adding a caller
 *
 * `checkpoints` and `checkpoint_writes` are written by `MongoDBSaver` and carry
 * **no `userId`**. There is no owner predicate to push into the filter, so the
 * CLAUDE.md "ownership predicate at the persistence layer" rule cannot apply
 * here — the caller is solely responsible for establishing ownership.
 *
 * Every caller must therefore derive its thread ids from an ownership-scoped
 * query (e.g. the user's conversations → their analysis runs), never from
 * request input. A thread id reaching this method is treated as authorised.
 */
export interface ICheckpointRepository {
  /**
   * Hard-delete all checkpoint state for the given LangGraph threads.
   *
   * Idempotent: deleting an already-purged thread is a no-op returning zero
   * counts, which is what lets both the sweeper and the account-deletion
   * cascade retry freely.
   *
   * An empty list is a no-op — callers resolving thread ids from a cascade
   * routinely produce one.
   *
   * Pass `session` when purging inside a cascade's transaction: this is a hard
   * delete, so running it outside the transaction that tombstones the owning
   * runs means an abort leaves the graph state destroyed for an entry that
   * still exists. The sweeper has no transaction and passes nothing.
   */
  purgeThreads(
    threadIds: string[],
    session?: ClientSession
  ): Promise<Result<PurgeCounts, DBError>>;
}
