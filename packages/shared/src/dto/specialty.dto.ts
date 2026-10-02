import { z } from 'zod';
import { MessageRole } from '../enums/message-role.enum';
import { Specialty } from '../enums/specialty.enum';
import { CapabilitySchema, ComposedDocumentFieldSchema, PdpGoalSchema } from './artefact.dto';

export const TrainingStageSchema = z.object({
  code: z.string(),
  label: z.string(),
  description: z.string(),
});

/**
 * An entry type offered to the client. Deliberately a subset of the server's
 * EntryTypeDefinition — `templateId` is a config internal and this response is
 * public and cached.
 */
export const EntryTypeOptionSchema = z.object({
  code: z.string(),
  label: z.string(),
  description: z.string(),
});

export const SpecialtyOptionSchema = z.object({
  specialty: z.nativeEnum(Specialty),
  name: z.string(),
  trainingStages: z.array(TrainingStageSchema),
  entryTypes: z.array(EntryTypeOptionSchema),
});

export type SpecialtyOptionDto = z.infer<typeof SpecialtyOptionSchema>;

export const SpecialtyListResponseSchema = z.object({
  specialties: z.array(SpecialtyOptionSchema),
});

export type SpecialtyListResponse = z.infer<typeof SpecialtyListResponseSchema>;

/**
 * One turn of the sample conversation. Display-only: no ids, status or question
 * structure, because the sample is read-only. On an assistant turn `text` is the
 * lead-in line and `question` the follow-up it asked.
 */
export const SampleTurnSchema = z.object({
  role: z.nativeEnum(MessageRole),
  text: z.string(),
  question: z.string().optional(),
});

export type SampleTurn = z.infer<typeof SampleTurnSchema>;

/**
 * A worked example entry with labels resolved from specialty config. Sections and
 * capabilities reuse the artefact shapes so the client renders them with the same
 * components as a real entry. Public and cached — contains no user data.
 */
export const SampleCaseResponseSchema = z.object({
  specialty: z.nativeEnum(Specialty),
  entryType: z.string(),
  entryTypeLabel: z.string(),
  title: z.string(),
  sections: z.array(ComposedDocumentFieldSchema),
  capabilities: z.array(CapabilitySchema),
  pdpGoals: z.array(PdpGoalSchema),
  conversation: z.array(SampleTurnSchema),
});

export type SampleCaseResponse = z.infer<typeof SampleCaseResponseSchema>;
