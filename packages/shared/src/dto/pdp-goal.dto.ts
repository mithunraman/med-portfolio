import { z } from 'zod';
import { PdpGoalSchema } from './artefact.dto';
import { PdpGoalStatus } from '../enums/pdp-goal-status.enum';

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
  completionReview: z.string().nullable().optional(),
});

export type UpdatePdpGoalRequest = z.infer<typeof UpdatePdpGoalRequestSchema>;

export const AddPdpGoalActionRequestSchema = z.object({
  action: z.string().min(1),
});

export type AddPdpGoalActionRequest = z.infer<typeof AddPdpGoalActionRequestSchema>;

export const UpdatePdpGoalActionRequestSchema = z.object({
  status: z.nativeEnum(PdpGoalStatus).optional(),
  completionReview: z.string().nullable().optional(),
});

export type UpdatePdpGoalActionRequest = z.infer<typeof UpdatePdpGoalActionRequestSchema>;
