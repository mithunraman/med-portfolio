import { isMongoDuplicateKeyError, isTransientTransactionError } from './mongo-errors.util';

describe('isMongoDuplicateKeyError', () => {
  it('returns true for an E11000 error with no keyPattern filter', () => {
    expect(isMongoDuplicateKeyError({ code: 11000 })).toBe(true);
  });

  it('returns true when the keyPattern filter matches', () => {
    expect(
      isMongoDuplicateKeyError({ code: 11000, keyPattern: { conversationId: 1 } }, 'conversationId'),
    ).toBe(true);
  });

  it('returns false when the keyPattern filter does not match', () => {
    expect(
      isMongoDuplicateKeyError({ code: 11000, keyPattern: { conversationId: 1 } }, 'userId'),
    ).toBe(false);
  });

  it('returns false for non-duplicate codes and non-objects', () => {
    expect(isMongoDuplicateKeyError({ code: 121 })).toBe(false);
    expect(isMongoDuplicateKeyError(null)).toBe(false);
    expect(isMongoDuplicateKeyError(new Error('boom'))).toBe(false);
  });
});

describe('isTransientTransactionError', () => {
  /** Stand-in for a Mongo driver error, which exposes hasErrorLabel(label). */
  const mongoErrorWithLabels = (labels: string[]) =>
    Object.assign(new Error('write conflict'), {
      hasErrorLabel: (label: string) => labels.includes(label),
    });

  it('returns true when the TransientTransactionError label is present', () => {
    expect(isTransientTransactionError(mongoErrorWithLabels(['TransientTransactionError']))).toBe(
      true,
    );
  });

  it('returns false when other labels are present but not the transient one', () => {
    expect(
      isTransientTransactionError(mongoErrorWithLabels(['UnknownTransactionCommitResult'])),
    ).toBe(false);
  });

  it('returns false for a plain Error with no hasErrorLabel (label already stripped)', () => {
    // This is exactly the swallowed-Result case the guard guards against.
    expect(isTransientTransactionError(new Error('Failed to create analysis run'))).toBe(false);
  });

  it('returns false for null and non-object inputs', () => {
    expect(isTransientTransactionError(null)).toBe(false);
    expect(isTransientTransactionError('TransientTransactionError')).toBe(false);
  });
});
