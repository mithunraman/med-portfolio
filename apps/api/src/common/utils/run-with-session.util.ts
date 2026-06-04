import { ClientSession } from 'mongoose';

/**
 * Runs a set of DB operations with session-aware concurrency.
 *
 * Mongo forbids concurrent operations on a single ClientSession, so when a
 * `session` is present (i.e. inside a transaction) the tasks run sequentially;
 * without a session they run in parallel via `Promise.all`.
 *
 * Tasks MUST be thunks (`() => Promise<T>`), never already-created promises — a
 * promise begins executing the moment it is created, so passing live promises
 * would run them in parallel regardless of the session and defeat the purpose.
 *
 * Return types are preserved positionally, exactly like `Promise.all`:
 *   const [conv, goals] = await runWithSession(
 *     [() => repo.findConv(id, session), () => repo.findGoals(id, session)],
 *     session,
 *   );
 *
 * Error semantics differ by branch: the parallel branch is fail-fast but the
 * sibling tasks still run to completion; the sequential branch stops at the
 * first rejection and never starts the remaining tasks.
 */
// Overloads give clean positional tuple types (so `isErr(...)` narrowing works
// on each result). Arities 2 and 3 cover the current call sites; the final
// signature is a homogeneous fallback for longer/dynamic lists.
export function runWithSession<A, B>(
  tasks: readonly [() => Promise<A>, () => Promise<B>],
  session?: ClientSession
): Promise<[A, B]>;
export function runWithSession<A, B, C>(
  tasks: readonly [() => Promise<A>, () => Promise<B>, () => Promise<C>],
  session?: ClientSession
): Promise<[A, B, C]>;
export function runWithSession<T>(
  tasks: ReadonlyArray<() => Promise<T>>,
  session?: ClientSession
): Promise<T[]>;
export async function runWithSession(
  tasks: ReadonlyArray<() => Promise<unknown>>,
  session?: ClientSession
): Promise<unknown[]> {
  if (!session) {
    return Promise.all(tasks.map((task) => task()));
  }

  const results: unknown[] = [];
  for (const task of tasks) {
    // Sequential — the next task starts only after this one resolves.
    results.push(await task());
  }
  return results;
}
