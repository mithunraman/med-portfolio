import { TransactionService } from '../transaction.service';

// ── Helpers ──

function makeSession(options: { commitError?: Error; hasTransientLabel?: boolean } = {}) {
  return {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn().mockImplementation(async () => {
      if (options.commitError) throw options.commitError;
    }),
    abortTransaction: jest.fn(),
    endSession: jest.fn(),
  };
}

function makeTransientError(message: string): Error {
  const error = new Error(message);
  (error as any).hasErrorLabel = (label: string) => label === 'TransientTransactionError';
  return error;
}

function makeNonTransientError(message: string): Error {
  return new Error(message);
}

function createService(sessionFactory: () => any) {
  const connection = {
    startSession: jest.fn().mockImplementation(async () => sessionFactory()),
  };
  return new TransactionService(connection as any);
}

// ── Tests ──

describe('TransactionService', () => {
  it('should commit successfully on first attempt', async () => {
    const session = makeSession();
    const service = createService(() => session);

    const result = await service.withTransaction(async () => 'ok', { context: 'test' });

    expect(result).toBe('ok');
    expect(session.startTransaction).toHaveBeenCalledTimes(1);
    expect(session.commitTransaction).toHaveBeenCalledTimes(1);
    expect(session.abortTransaction).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  it('should retry on TransientTransactionError and succeed', async () => {
    let attempt = 0;
    const sessions = [makeSession(), makeSession()];

    const service = createService(() => sessions[attempt++]);

    const fn = jest
      .fn()
      .mockRejectedValueOnce(makeTransientError('write conflict'))
      .mockResolvedValueOnce('recovered');

    const result = await service.withTransaction(fn, { context: 'retry-test' });

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
    // First session aborted, second committed
    expect(sessions[0].abortTransaction).toHaveBeenCalled();
    expect(sessions[0].endSession).toHaveBeenCalled();
    expect(sessions[1].commitTransaction).toHaveBeenCalled();
    expect(sessions[1].endSession).toHaveBeenCalled();
  });

  it('should throw immediately on non-transient error (no retry)', async () => {
    const session = makeSession();
    const service = createService(() => session);

    const fn = jest.fn().mockRejectedValue(makeNonTransientError('constraint violation'));

    await expect(service.withTransaction(fn, { context: 'non-transient' })).rejects.toThrow(
      'constraint violation'
    );

    expect(fn).toHaveBeenCalledTimes(1);
    expect(session.abortTransaction).toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
  });

  it('should throw after exhausting retries on persistent transient error', async () => {
    let attempt = 0;
    const sessions = [makeSession(), makeSession(), makeSession()];

    const service = createService(() => sessions[attempt++]);

    const transientError = makeTransientError('persistent conflict');
    const fn = jest.fn().mockRejectedValue(transientError);

    await expect(service.withTransaction(fn, { context: 'exhausted' })).rejects.toThrow(
      'persistent conflict'
    );

    // 1 initial + 2 retries = 3 attempts
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sessions[0].abortTransaction).toHaveBeenCalled();
    expect(sessions[1].abortTransaction).toHaveBeenCalled();
    expect(sessions[2].abortTransaction).toHaveBeenCalled();
  });

  it('should always end the session even when callback throws', async () => {
    const session = makeSession();
    const service = createService(() => session);

    await expect(
      service.withTransaction(async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    expect(session.endSession).toHaveBeenCalledTimes(1);
  });
});
