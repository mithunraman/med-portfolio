import { MediaType } from '@acme/shared';
import { IsEnum, IsString, Matches } from 'class-validator';

const ALLOWED_MIME_TYPES = /^audio\/(webm|mp4|m4a|mpeg|wav)$/;

export class InitiateUploadDto {
  @IsEnum(MediaType)
  mediaType!: MediaType;

  @IsString()
  @Matches(ALLOWED_MIME_TYPES, {
    message: 'mimeType must be a valid audio type (webm, mp4, m4a, mpeg, wav)',
  })
  mimeType!: string;
}
