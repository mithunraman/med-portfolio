import { z } from 'zod';
import { ArtefactStatus } from '../enums/artefact-status.enum';
import { ConversationStatus } from '../enums/conversation-status.enum';
import { PdpGoalStatus } from '../enums/pdp-goal-status.enum';
import { Specialty } from '../enums/specialty.enum';

// PDP Goal Action schema (embedded action within a goal)
export const PdpGoalActionSchema = z.object({
  id: z.string(),
  action: z.string(),
  intendedEvidence: z.string(),
  status: z.nativeEnum(PdpGoalStatus),
  dueDate: z.string().datetime().nullable(),
  completionReview: z.string().nullable(),
});

export type PdpGoalAction = z.infer<typeof PdpGoalActionSchema>;

// PDP Goal schema
export const PdpGoalSchema = z.object({
  id: z.string(),
  goal: z.string(),
  status: z.nativeEnum(PdpGoalStatus),
  reviewDate: z.string().datetime().nullable(),
  completionReview: z.string().nullable(),
  actions: z.array(PdpGoalActionSchema),
});

export type PdpGoal = z.infer<typeof PdpGoalSchema>;

// Capability schema
export const CapabilitySchema = z.object({
  code: z.string(),
  name: z.string(),
  evidence: z.string(),
});

export type Capability = z.infer<typeof CapabilitySchema>;

// Reflection section schema
export const ReflectionSectionSchema = z.object({
  title: z.string(),
  text: z.string(),
});

export type ReflectionSection = z.infer<typeof ReflectionSectionSchema>;

// Active conversation (embedded in artefact response)
export const ActiveConversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.nativeEnum(ConversationStatus),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ActiveConversation = z.infer<typeof ActiveConversationSchema>;

// Artefact schema
export const ArtefactSchema = z.object({
  id: z.string(),
  artefactId: z.string(),
  specialty: z.nativeEnum(Specialty),
  status: z.nativeEnum(ArtefactStatus),
  artefactType: z.string().nullable(),
  artefactTypeLabel: z.string().nullable(),
  title: z.string().nullable(),
  reflection: z.array(ReflectionSectionSchema).nullable(),
  pdpGoals: z.array(PdpGoalSchema).nullable(),
  capabilities: z.array(CapabilitySchema).nullable(),
  tags: z.record(z.array(z.string())).nullable(),
  conversation: ActiveConversationSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Artefact = z.infer<typeof ArtefactSchema>;

// Request schemas
export const CreateArtefactRequestSchema = z.object({
  artefactId: z
    .string()
    .min(10, 'Artefact ID must be at least 10 characters')
    .max(36, 'Artefact ID must not exceed 36 characters'),
});

export type CreateArtefactRequest = z.infer<typeof CreateArtefactRequestSchema>;

export const UpdateArtefactStatusRequestSchema = z.object({
  status: z.nativeEnum(ArtefactStatus),
});

export type UpdateArtefactStatusRequest = z.infer<typeof UpdateArtefactStatusRequestSchema>;

// Response schemas
export const ArtefactListResponseSchema = z.object({
  artefacts: z.array(ArtefactSchema),
  nextCursor: z.string().nullable(),
  limit: z.number(),
});

export type ArtefactListResponse = z.infer<typeof ArtefactListResponseSchema>;
