import { z } from 'zod';
import { nullableMultilineText, singleLineText } from '../utils';
import { LinkedArtefactRefSchema, PdpGoalSchema } from './artefact.dto';
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
  linkedArtefacts: z.array(LinkedArtefactRefSchema),
});

export type PdpGoalResponse = z.infer<typeof PdpGoalResponseSchema>;

export const ListPdpGoalsResponseSchema = z.object({
  goals: z.array(PdpGoalListItemSchema),
  nextCursor: z.string().nullable(),
});

export type ListPdpGoalsResponse = z.infer<typeof ListPdpGoalsResponseSchema>;

/**
 * The statuses a trainee may set directly, on a goal or on one of its actions.
 *
 * Deliberately narrower than `PdpGoalStatus`, because two of its members are
 * system-owned and accepting them here would let a client corrupt state it cannot
 * then repair:
 *
 * - **PROPOSED** is written only by analysis at goal creation, and is the
 *   discriminator `PdpGoalsRepository.proposalFilter` uses to authorise a hard
 *   delete. Moving an adopted goal back to it hides the goal from every list
 *   filter and has it destroyed — no tombstone, unrecoverable — on the next
 *   deletion of the entry that created it.
 * - **DELETED** is written only by the tombstone pipeline, which anonymises
 *   content in the same operation; see the enum for why setting it directly
 *   defeats account deletion.
 *
 * Widening this set means re-checking both of those paths first.
 */
export const TraineeSettablePdpGoalStatusSchema = z.union([
  z.literal(PdpGoalStatus.STARTED),
  z.literal(PdpGoalStatus.COMPLETED),
  z.literal(PdpGoalStatus.ARCHIVED),
]);

export type TraineeSettablePdpGoalStatus = z.infer<typeof TraineeSettablePdpGoalStatusSchema>;

export const UpdatePdpGoalRequestSchema = z.object({
  reviewDate: z.string().datetime().nullable().optional(),
  status: TraineeSettablePdpGoalStatusSchema.optional(),
  completionReview: nullableMultilineText({ max: PDP_COMPLETION_REVIEW_MAX_LENGTH }).optional(),
});

export type UpdatePdpGoalRequest = z.infer<typeof UpdatePdpGoalRequestSchema>;

export const AddPdpGoalActionRequestSchema = z.object({
  action: singleLineText({ min: 1, max: PDP_ACTION_MAX_LENGTH }),
});

export type AddPdpGoalActionRequest = z.infer<typeof AddPdpGoalActionRequestSchema>;

export const UpdatePdpGoalActionRequestSchema = z.object({
  status: TraineeSettablePdpGoalStatusSchema.optional(),
  completionReview: nullableMultilineText({ max: PDP_COMPLETION_REVIEW_MAX_LENGTH }).optional(),
});

export type UpdatePdpGoalActionRequest = z.infer<typeof UpdatePdpGoalActionRequestSchema>;
