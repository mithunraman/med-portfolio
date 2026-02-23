import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

/**
 * DTO for the unified analysis endpoint.
 *
 * Discriminated on `type`:
 *  - "start": Doctor taps the AI button for the first time (no other fields needed)
 *  - "resume": Doctor responds to an AI prompt (node + optional value)
 *
 * The `value` shape is validated per-node in the service layer since
 * class-validator doesn't support discriminated unions natively.
 */
export class AnalysisActionDto {
  @IsString()
  @IsIn(['start', 'resume'])
  type!: 'start' | 'resume';

  @IsOptional()
  @IsString()
  @IsIn(['present_classification', 'present_capabilities', 'present_draft', 'ask_followup'])
  node?: 'present_classification' | 'present_capabilities' | 'present_draft' | 'ask_followup';

  @IsOptional()
  @IsObject()
  value?: Record<string, unknown>;
}
