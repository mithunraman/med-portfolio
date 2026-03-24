import { z } from 'zod';
import { Specialty } from '../enums/specialty.enum';

export const TrainingStageSchema = z.object({
  code: z.string(),
  label: z.string(),
  description: z.string(),
});

export const SpecialtyOptionSchema = z.object({
  specialty: z.nativeEnum(Specialty),
  name: z.string(),
  trainingStages: z.array(TrainingStageSchema),
});

export type SpecialtyOptionDto = z.infer<typeof SpecialtyOptionSchema>;

export const SpecialtyListResponseSchema = z.object({
  specialties: z.array(SpecialtyOptionSchema),
});

export type SpecialtyListResponse = z.infer<typeof SpecialtyListResponseSchema>;
