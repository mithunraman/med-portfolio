import { z } from 'zod';
import { nullableMultilineText, singleLineText } from '../utils';
import { PdpGoalSchema } from './artefact.dto';
import { PdpGoalStatus } from '../enums/pdp-goal-status.enum';

// Upper bound for the long-form completion reflection (goal + action). Matches the
// note/justification ceiling (5000) — generous for prose, but bounded so a single
// field can't grow without limit.
export const PDP_COMPLETION_REVIEW_MAX_LENGTH = 5000;

// An action is a short single-line to-do item (like a title/name), not prose —
// hence singleLineText + a compact bound.
export const PDP_ACTION_MAX_LENGTH = 500;

export const PdpGoalListItemSchema = PdpGoalSchema;
export type PdpGoalListItem = z.infer<typeof PdpGoalListItemSchema>;

export const PdpGoalResponseSchema = PdpGoalSchema.extend({
  artefactId: z.string(),
  artefactTitle: z.string().nullable(),
});

export type PdpGoalResponse = z.infer<typeof PdpGoalResponseSchema>;

export const ListPdpGoalsResponseSchema = z.object({
  goals: z.array(PdpGoalListItemSchema),
  nextCursor: z.string().nullable(),
});

export type ListPdpGoalsResponse = z.infer<typeof ListPdpGoalsResponseSchema>;

export const UpdatePdpGoalRequestSchema = z.object({
  reviewDate: z.string().datetime().nullable().optional(),
  status: z.nativeEnum(PdpGoalStatus).optional(),
  completionReview: nullableMultilineText({ max: PDP_COMPLETION_REVIEW_MAX_LENGTH }).optional(),
});

export type UpdatePdpGoalRequest = z.infer<typeof UpdatePdpGoalRequestSchema>;

export const AddPdpGoalActionRequestSchema = z.object({
  action: singleLineText({ min: 1, max: PDP_ACTION_MAX_LENGTH }),
});

export type AddPdpGoalActionRequest = z.infer<typeof AddPdpGoalActionRequestSchema>;

export const UpdatePdpGoalActionRequestSchema = z.object({
  status: z.nativeEnum(PdpGoalStatus).optional(),
  completionReview: nullableMultilineText({ max: PDP_COMPLETION_REVIEW_MAX_LENGTH }).optional(),
});

export type UpdatePdpGoalActionRequest = z.infer<typeof UpdatePdpGoalActionRequestSchema>;
