import { ClientSession } from 'mongoose';
import { runWithSession } from './run-with-session.util';

// A fake session — the util only checks for presence/absence, never calls it.
const fakeSession = {} as ClientSession;

describe('runWithSession', () => {
  it('returns results positionally, preserving heterogeneous types', async () => {
    const [a, b] = await runWithSession([
      () => Promise.resolve('str'),
      () => Promise.resolve(42),
    ]);

    expect(a).toBe('str');
    expect(b).toBe(42);
  });

  it('runs tasks in parallel when no session is provided', async () => {
    const events: string[] = [];

    const makeTask = (label: string, delayMs: number) => async () => {
      events.push(`start:${label}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      events.push(`end:${label}`);
      return label;
    };

    // Without a session, both start before either finishes.
    await runWithSession([makeTask('a', 30), makeTask('b', 0)]);

    expect(events.slice(0, 2)).toEqual(['start:a', 'start:b']);
    // 'b' (0ms) finishes before 'a' (30ms) → interleaved, proving concurrency.
    expect(events).toEqual(['start:a', 'start:b', 'end:b', 'end:a']);
  });

  it('runs tasks sequentially when a session is provided', async () => {
    const events: string[] = [];

    const makeTask = (label: string, delayMs: number) => async () => {
      events.push(`start:${label}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      events.push(`end:${label}`);
      return label;
    };

    // With a session, 'a' must fully complete before 'b' starts — even though
    // 'a' is slower. No interleaving.
    await runWithSession([makeTask('a', 30), makeTask('b', 0)], fakeSession);

    expect(events).toEqual(['start:a', 'end:a', 'start:b', 'end:b']);
  });

  it('does not invoke a thunk until its turn in the sequential branch', async () => {
    const calls: number[] = [];
    const tasks = [
      () => {
        calls.push(0);
        return Promise.resolve(0);
      },
      () => {
        calls.push(1);
        return Promise.resolve(1);
      },
    ];

    await runWithSession(tasks, fakeSession);

    expect(calls).toEqual([0, 1]);
  });

  it('short-circuits remaining tasks on rejection in the sequential branch', async () => {
    const second = jest.fn(() => Promise.resolve('second'));

    await expect(
      runWithSession(
        [() => Promise.reject(new Error('boom')), second],
        fakeSession
      )
    ).rejects.toThrow('boom');

    expect(second).not.toHaveBeenCalled();
  });

  it('handles an empty task list', async () => {
    await expect(runWithSession([])).resolves.toEqual([]);
    await expect(runWithSession([], fakeSession)).resolves.toEqual([]);
  });
});
