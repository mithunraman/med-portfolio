import { z } from 'zod';
import { Specialty } from '../enums/specialty.enum';

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
