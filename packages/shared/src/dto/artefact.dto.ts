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
  completedAt: z.string().datetime().nullable(),
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
  trainingStage: z.string(),
  status: z.nativeEnum(ArtefactStatus),
  artefactType: z.string().nullable(),
  artefactTypeLabel: z.string().nullable(),
  title: z.string().nullable(),
  reflection: z.array(ReflectionSectionSchema).nullable(),
  pdpGoals: z.array(PdpGoalSchema).nullable(),
  capabilities: z.array(CapabilitySchema).nullable(),
  tags: z.record(z.array(z.string())).nullable(),
  conversation: ActiveConversationSchema,
  versionCount: z.number().default(0),
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
  archivePdpGoals: z.boolean().optional(),
});

export type UpdateArtefactStatusRequest = z.infer<typeof UpdateArtefactStatusRequestSchema>;

// Finalise request schemas
export const PdpGoalActionSelectionSchema = z.object({
  actionId: z.string(),
  selected: z.boolean(),
});

export type PdpGoalActionSelection = z.infer<typeof PdpGoalActionSelectionSchema>;

export const PdpGoalSelectionSchema = z.object({
  goalId: z.string(),
  selected: z.boolean(),
  reviewDate: z.string().datetime().nullable().optional(),
  actions: z.array(PdpGoalActionSelectionSchema).optional(),
});

export type PdpGoalSelection = z.infer<typeof PdpGoalSelectionSchema>;

export const FinaliseArtefactRequestSchema = z.object({
  pdpGoalSelections: z.array(PdpGoalSelectionSchema),
});

export type FinaliseArtefactRequest = z.infer<typeof FinaliseArtefactRequestSchema>;

// Edit request schemas
export const EditArtefactRequestSchema = z.object({
  title: z.string().max(200).optional(),
  reflection: z.array(ReflectionSectionSchema).optional(),
});

export type EditArtefactRequest = z.infer<typeof EditArtefactRequestSchema>;

// Version schemas
export const ArtefactVersionSchema = z.object({
  version: z.number(),
  timestamp: z.string().datetime(),
  title: z.string().nullable(),
  reflection: z.array(ReflectionSectionSchema).nullable(),
});

export type ArtefactVersion = z.infer<typeof ArtefactVersionSchema>;

export const ArtefactVersionHistoryResponseSchema = z.object({
  versions: z.array(ArtefactVersionSchema),
});

export type ArtefactVersionHistoryResponse = z.infer<typeof ArtefactVersionHistoryResponseSchema>;

export const RestoreArtefactVersionRequestSchema = z.object({
  version: z.number(),
});

export type RestoreArtefactVersionRequest = z.infer<typeof RestoreArtefactVersionRequestSchema>;

// Response schemas
export const ArtefactListResponseSchema = z.object({
  artefacts: z.array(ArtefactSchema),
  nextCursor: z.string().nullable(),
  limit: z.number(),
});

export type ArtefactListResponse = z.infer<typeof ArtefactListResponseSchema>;
