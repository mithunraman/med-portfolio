import { z } from 'zod';
import { Platform } from '../enums/platform.enum';
import { UpdateStatus } from '../enums/update-status.enum';

const semverRegex = /^\d+\.\d+\.\d+$/;

export const UpdatePolicySchema = z.object({
  status: z.nativeEnum(UpdateStatus),
  storeUrl: z.string(),
  latestVersion: z.string(),
  message: z.string().optional(),
});

export type UpdatePolicy = z.infer<typeof UpdatePolicySchema>;

export const UpsertVersionPolicySchema = z.object({
  platform: z.nativeEnum(Platform),
  minimumVersion: z.string().regex(semverRegex, 'Must be valid semver (e.g. 1.0.0)'),
  recommendedVersion: z.string().regex(semverRegex, 'Must be valid semver (e.g. 1.0.0)'),
  latestVersion: z.string().regex(semverRegex, 'Must be valid semver (e.g. 1.0.0)'),
  storeUrl: z.string().url(),
  message: z.string().optional(),
});

export type UpsertVersionPolicyDto = z.infer<typeof UpsertVersionPolicySchema>;

export const VersionPolicyResponseSchema = UpsertVersionPolicySchema.extend({
  id: z.string(),
});

export type VersionPolicyResponse = z.infer<typeof VersionPolicyResponseSchema>;
