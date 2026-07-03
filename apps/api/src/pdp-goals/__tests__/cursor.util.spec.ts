import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { PDP_GOAL_SORT_SENTINEL } from '../pdp-goal.constants';
import { buildPdpGoalCursor, parsePdpGoalCursor } from '../cursor.util';
import type { PdpGoal } from '../schemas/pdp-goal.schema';

function makeGoal(overrides: Partial<PdpGoal> = {}): PdpGoal {
  return {
    _id: new Types.ObjectId(),
    sortDate: new Date('2026-06-15T00:00:00.000Z'),
    ...overrides,
  } as PdpGoal;
}

describe('cursor.util', () => {
  describe('buildPdpGoalCursor', () => {
    it('serializes "<sortDate iso>__<id>"', () => {
      const _id = new Types.ObjectId();
      const sortDate = new Date('2026-06-15T00:00:00.000Z');

      const cursor = buildPdpGoalCursor(makeGoal({ _id, sortDate }));

      expect(cursor).toBe(`${sortDate.toISOString()}__${_id.toString()}`);
    });

    it('does not throw for an unscheduled goal (sentinel sortDate)', () => {
      const goal = makeGoal({ sortDate: PDP_GOAL_SORT_SENTINEL });

      expect(() => buildPdpGoalCursor(goal)).not.toThrow();
      expect(buildPdpGoalCursor(goal)).toContain(PDP_GOAL_SORT_SENTINEL.toISOString());
    });

    it('round-trips through parsePdpGoalCursor', () => {
      const _id = new Types.ObjectId();
      const sortDate = PDP_GOAL_SORT_SENTINEL;

      const parsed = parsePdpGoalCursor(buildPdpGoalCursor(makeGoal({ _id, sortDate })));

      expect(parsed.sortDate.toISOString()).toBe(sortDate.toISOString());
      expect(parsed.id.toString()).toBe(_id.toString());
    });
  });

  describe('parsePdpGoalCursor', () => {
    it('rejects a cursor missing the separator', () => {
      expect(() => parsePdpGoalCursor('no-separator')).toThrow(BadRequestException);
    });

    it('rejects a malformed date', () => {
      const id = new Types.ObjectId().toString();
      expect(() => parsePdpGoalCursor(`not-a-date__${id}`)).toThrow(BadRequestException);
    });

    it('rejects an invalid object id', () => {
      expect(() => parsePdpGoalCursor('2026-06-15T00:00:00.000Z__not-an-id')).toThrow(
        BadRequestException,
      );
    });
  });
});
