import { IsString, MaxLength, MinLength } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @MinLength(10)
  @MaxLength(36)
  conversationId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  content!: string;
}
