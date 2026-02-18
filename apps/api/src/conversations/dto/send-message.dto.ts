import { IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class SendMessageDto {
  @ValidateIf((o) => !o.mediaId)
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  content?: string;

  @ValidateIf((o) => !o.content)
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  mediaId?: string;
}
