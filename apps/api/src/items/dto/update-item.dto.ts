import { IsString, MaxLength, IsOptional, IsEnum } from 'class-validator';
import { ItemStatus } from '@acme/shared';

export class UpdateItemDto {
  @IsString()
  @MaxLength(100)
  @IsOptional()
  name?: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  description?: string;

  @IsEnum(ItemStatus)
  @IsOptional()
  status?: ItemStatus;
}

export class UpdateItemStatusDto {
  @IsEnum(ItemStatus)
  status!: ItemStatus;
}
