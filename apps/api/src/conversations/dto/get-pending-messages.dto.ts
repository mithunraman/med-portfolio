import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class GetPendingMessagesDto {
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') return value.split(',').filter(Boolean);
    return [];
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @ArrayMaxSize(100)
  ids!: string[];
}
