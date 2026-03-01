import { z } from 'zod';
import { ArtefactStatus } from '../enums/artefact-status.enum';
import { ConversationStatus } from '../enums/conversation-status.enum';
import { PdpActionStatus } from '../enums/pdp-action-status.enum';
import { Specialty } from '../enums/specialty.enum';

// PDP Action schema
export const PdpActionSchema = z.object({
  id: z.string(),
  action: z.string(),
  timeframe: z.string(),
  status: z.nativeEnum(PdpActionStatus),
});

export type PdpAction = z.infer<typeof PdpActionSchema>;

// Capability schema
export const CapabilitySchema = z.object({
  code: z.string(),
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
  title: z.string().nullable(),
  reflection: z.array(ReflectionSectionSchema).nullable(),
  pdpActions: z.array(PdpActionSchema).nullable(),
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

// Response schemas
export const ArtefactListResponseSchema = z.object({
  artefacts: z.array(ArtefactSchema),
  nextCursor: z.string().nullable(),
  limit: z.number(),
});

export type ArtefactListResponse = z.infer<typeof ArtefactListResponseSchema>;
