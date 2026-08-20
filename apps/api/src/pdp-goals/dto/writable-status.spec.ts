import {
  PdpGoalStatus,
  UpdatePdpGoalActionRequestSchema,
  UpdatePdpGoalRequestSchema,
} from '@acme/shared';

/**
 * `status` on these two endpoints is trainee input, and two enum members are
 * system-owned. Rejecting them at the schema means the global ZodValidationPipe
 * answers 400 before the service ever sees the value.
 *
 * These are not style tests. Each rejected value maps to a concrete way a client
 * could destroy or orphan its own data, documented alongside the assertion.
 */
describe('trainee-writable PDP status', () => {
  describe.each([
    ['goal', UpdatePdpGoalRequestSchema],
    ['action', UpdatePdpGoalActionRequestSchema],
  ])('%s update schema', (_label, schema) => {
    it.each([
      [PdpGoalStatus.STARTED, 'STARTED'],
      [PdpGoalStatus.COMPLETED, 'COMPLETED'],
      [PdpGoalStatus.ARCHIVED, 'ARCHIVED'],
    ])('accepts %i (%s)', (status) => {
      expect(schema.safeParse({ status }).success).toBe(true);
    });

    // PROPOSED authorises a hard delete via proposalFilter: an adopted goal moved
    // back to it disappears from every list filter and is destroyed, without a
    // tombstone, on the next deletion of the entry that created it.
    it('rejects PROPOSED — it authorises hard deletion', () => {
      expect(schema.safeParse({ status: PdpGoalStatus.PROPOSED }).success).toBe(false);
    });

    // DELETED is the tombstone's own marker. Set without the anonymisation that
    // normally accompanies it, the row keeps its clinical content AND is skipped
    // by account deletion, which filters `status: { $ne: DELETED }`.
    it('rejects DELETED — it defeats erasure', () => {
      expect(schema.safeParse({ status: PdpGoalStatus.DELETED }).success).toBe(false);
    });

    it('rejects a value outside the enum entirely', () => {
      expect(schema.safeParse({ status: 999 }).success).toBe(false);
    });

    it('still allows omitting status', () => {
      expect(schema.safeParse({}).success).toBe(true);
    });
  });
});
