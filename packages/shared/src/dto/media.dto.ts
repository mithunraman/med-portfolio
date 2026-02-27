import { z } from 'zod';
import { MediaType } from '../enums/media-type.enum';

const ALLOWED_AUDIO_MIME_TYPES = /^audio\/(webm|mp4|m4a|mpeg|wav)$/;

export const InitiateUploadRequestSchema = z.object({
  mediaType: z.nativeEnum(MediaType),
  mimeType: z.string().regex(ALLOWED_AUDIO_MIME_TYPES, {
    message: 'mimeType must be a valid audio type (webm, mp4, m4a, mpeg, wav)',
  }),
});

export type InitiateUploadRequest = z.infer<typeof InitiateUploadRequestSchema>;

export const InitiateUploadResultSchema = z.object({
  mediaId: z.string(),
  uploadUrl: z.string().url(),
  expiresIn: z.number(),
});

export type InitiateUploadResult = z.infer<typeof InitiateUploadResultSchema>;
