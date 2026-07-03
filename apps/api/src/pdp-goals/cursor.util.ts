import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import type { PdpGoal } from './schemas/pdp-goal.schema';

export interface PdpGoalCursor {
  sortDate: Date;
  id: Types.ObjectId;
}

/**
 * Parse a cursor string "isoDate__objectId" into a typed cursor.
 */
export function parsePdpGoalCursor(raw: string): PdpGoalCursor {
  const sep = raw.indexOf('__');
  if (sep === -1) throw new BadRequestException('Invalid cursor format');

  const datePart = raw.substring(0, sep);
  const idPart = raw.substring(sep + 2);

  if (!datePart) throw new BadRequestException('Invalid cursor: missing date');
  if (!Types.ObjectId.isValid(idPart)) throw new BadRequestException('Invalid cursor');

  const sortDate = new Date(datePart);
  if (isNaN(sortDate.getTime())) throw new BadRequestException('Invalid cursor: malformed date');

  return {
    sortDate,
    id: new Types.ObjectId(idPart),
  };
}

/**
 * Build a cursor string from a goal document. Keyed on `sortDate`, which the
 * repository guarantees is always a Date (reviewDate ?? sentinel), so this never
 * throws — even for goals with no scheduled review.
 */
export function buildPdpGoalCursor(goal: PdpGoal): string {
  return `${goal.sortDate.toISOString()}__${goal._id.toString()}`;
}
