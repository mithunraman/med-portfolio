import { PdpGoalStatus } from '@acme/shared';
import { pdpGoalTombstoneUpdate } from '../pdp-goals.repository';

describe('pdpGoalTombstoneUpdate', () => {
  it('scrubs every sensitive field on a PdpGoal via $set', () => {
    const update = pdpGoalTombstoneUpdate();

    // Top-level goal fields
    expect(update.$set.goal).toBe('[deleted]');
    expect(update.$set.completionReview).toBeNull();
    expect(update.$set.status).toBe(PdpGoalStatus.DELETED);

    // Action subdoc fields (positional-update operators) — now safely
    // inside $set by construction, not by caller discipline.
    expect(update.$set['actions.$[].action']).toBe('[deleted]');
    expect(update.$set['actions.$[].intendedEvidence']).toBe('[deleted]');
    expect(update.$set['actions.$[].completionReview']).toBeNull();
    expect(update.$set['actions.$[].status']).toBe(PdpGoalStatus.DELETED);
  });
});
