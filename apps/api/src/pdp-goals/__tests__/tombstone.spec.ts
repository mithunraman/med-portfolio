import { PdpGoalStatus } from '@acme/shared';
import { pdpGoalTombstoneUpdate } from '../pdp-goals.repository';

describe('pdpGoalTombstoneUpdate', () => {
  it('scrubs every sensitive field on a PdpGoal via $set', () => {
    const [{ $set }] = pdpGoalTombstoneUpdate();

    expect($set.goal).toBe('[deleted]');
    expect($set.completionReview).toBeNull();
    expect($set.status).toBe(PdpGoalStatus.DELETED);
  });

  it('scrubs every action subdoc, tolerating an absent `actions` field', () => {
    const [{ $set }] = pdpGoalTombstoneUpdate();

    expect($set.actions).toEqual({
      $map: {
        input: { $ifNull: ['$actions', []] },
        in: {
          $mergeObjects: [
            '$$this',
            {
              action: '[deleted]',
              intendedEvidence: '[deleted]',
              completionReview: null,
              status: PdpGoalStatus.DELETED,
            },
          ],
        },
      },
    });
  });

  it('is a pipeline, and never reintroduces the all-positional operator', () => {
    // `actions.$[].action` errors on a document where `actions` is absent, which
    // in an updateMany aborts the batch part-applied. See artefactTombstoneUpdate().
    const update = pdpGoalTombstoneUpdate();

    expect(Array.isArray(update)).toBe(true);
    const keys = update.flatMap((stage) => Object.keys(stage.$set));
    expect(keys.filter((k) => k.includes('$[]'))).toEqual([]);
  });
});
