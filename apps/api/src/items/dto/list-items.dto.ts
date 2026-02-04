import { IsOptional, IsInt, Min, Max, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';
import { ItemStatus } from '@acme/shared';

export class ListItemsDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsEnum(ItemStatus)
  status?: ItemStatus;
}
