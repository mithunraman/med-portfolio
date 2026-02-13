import { IsOptional, IsInt, Min, Max, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class ListConversationsDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
