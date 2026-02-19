import { z } from 'zod';
import { MediaType } from '../enums/media-type.enum';

export const InitiateUploadRequestSchema = z.object({
  mediaType: z.nativeEnum(MediaType),
  mimeType: z.string().min(1),
});

export type InitiateUploadRequest = z.infer<typeof InitiateUploadRequestSchema>;

export const InitiateUploadResultSchema = z.object({
  mediaId: z.string(),
  uploadUrl: z.string().url(),
  expiresIn: z.number(),
});

export type InitiateUploadResult = z.infer<typeof InitiateUploadResultSchema>;
