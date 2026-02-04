import { IsString, MinLength, MaxLength, IsOptional } from 'class-validator';

export class CreateItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  description?: string;
}
