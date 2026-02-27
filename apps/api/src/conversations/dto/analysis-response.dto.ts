import type { AnalysisActionRequest } from '@acme/shared';
import { AnalysisActionRequestSchema } from '@acme/shared';
import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class AnalysisActionPipe implements PipeTransform<unknown, AnalysisActionRequest> {
  transform(value: unknown): AnalysisActionRequest {
    const result = AnalysisActionRequestSchema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException(result.error.errors);
    }
    return result.data;
  }
}
