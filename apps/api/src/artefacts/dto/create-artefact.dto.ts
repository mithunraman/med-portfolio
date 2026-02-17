import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateArtefactDto {
  @IsString()
  @MinLength(10)
  @MaxLength(36)
  artefactId!: string;
}
