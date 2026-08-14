import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection } from 'mongoose';
import { DBError, Result, err, ok } from '../common/utils/result.util';
import { CHECKPOINT_COLLECTION, CHECKPOINT_WRITES_COLLECTION } from './checkpoint.constants';
import { ICheckpointRepository, PurgeCounts } from './checkpoint.repository.interface';

/**
 * The only code in the app that names the checkpointer's collections.
 *
 * These are written by `MongoDBSaver` via the raw driver, not by Mongoose, so
 * there is no model to inject — the native collection handles come off the
 * Mongoose connection.
 */
@Injectable()
export class CheckpointRepository implements ICheckpointRepository {
  private readonly logger = new Logger(CheckpointRepository.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  async purgeThreads(
    threadIds: string[],
    session?: ClientSession
  ): Promise<Result<PurgeCounts, DBError>> {
    if (threadIds.length === 0) return ok({ checkpoints: 0, writes: 0 });

    const db = this.connection.db;
    if (!db) {
      return err({ code: 'DB_ERROR', message: 'MongoDB not connected - cannot purge checkpoints' });
    }

    const filter = { thread_id: { $in: threadIds } };
    // Forwarded to both deletes, not just one — a session that reached only the
    // writes delete would commit half a purge. Callers inside a cascade pass it
    // so an aborted transaction does not leave the checkpoints destroyed for an
    // entry that still exists; the sweeper passes nothing and runs unwrapped.
    const options = session ? { session } : {};

    try {
      // Writes first, then checkpoints. A crash between the two leaves a
      // checkpoint with no pending writes, which a resumed node recovers from by
      // re-interrupting. The reverse order leaves writes keyed to a checkpoint id
      // that no longer exists, and `getTuple` then returns nothing at all — the
      // graph would restart from scratch. Both indexes lead with `thread_id`, so
      // the `$in` uses the index prefix.
      const writes = await db
        .collection(CHECKPOINT_WRITES_COLLECTION)
        .deleteMany(filter, options);
      const checkpoints = await db.collection(CHECKPOINT_COLLECTION).deleteMany(filter, options);

      return ok({ checkpoints: checkpoints.deletedCount, writes: writes.deletedCount });
    } catch (error) {
      this.logger.error(`Failed to purge checkpoints for ${threadIds.length} thread(s)`, error);
      return err({ code: 'DB_ERROR', message: 'Failed to purge checkpoint data' });
    }
  }
}
