import { z } from 'zod';
import { Platform } from '../enums/platform.enum';
import { UpdateStatus } from '../enums/update-status.enum';

// Matches semver MAJOR.MINOR.PATCH with optional prerelease/build metadata (e.g. 1.0.0, 1.0.0-beta.1).
// Server uses the `semver` package for authoritative validation; this is a cheap sanity filter.
const semver = z
  .string()
  .regex(
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/,
    'Must be valid semver (e.g. 1.0.0)'
  );

export const UpdatePolicySchema = z.object({
  status: z.nativeEnum(UpdateStatus),
  storeUrl: z.string(),
  latestVersion: z.string(),
  message: z.string().optional(),
});

export type UpdatePolicy = z.infer<typeof UpdatePolicySchema>;

export const UpsertVersionPolicySchema = z.object({
  platform: z.nativeEnum(Platform),
  minimumVersion: semver,
  recommendedVersion: semver,
  latestVersion: semver,
  storeUrl: z.string().url(),
  message: z.string().optional(),
});

export type UpsertVersionPolicyDto = z.infer<typeof UpsertVersionPolicySchema>;

export const VersionPolicyResponseSchema = UpsertVersionPolicySchema.extend({
  xid: z.string(),
});

export type VersionPolicyResponse = z.infer<typeof VersionPolicyResponseSchema>;
