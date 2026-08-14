/**
 * Collection names for the LangGraph checkpointer's own storage.
 *
 * `MongoDBSaver` defaults to exactly these two names, but the defaults are
 * internal to that package. Both the saver construction and the purge
 * repository read them from here so a saver upgrade that renames a collection
 * cannot leave the reaper deleting from a collection nothing writes to.
 */
export const CHECKPOINT_COLLECTION = 'checkpoints';
export const CHECKPOINT_WRITES_COLLECTION = 'checkpoint_writes';
