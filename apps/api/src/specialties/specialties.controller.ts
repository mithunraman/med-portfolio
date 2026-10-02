import type { SampleCaseResponse, Specialty, SpecialtyListResponse } from '@acme/shared';
import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseIntPipe,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { getAllSpecialtyOptions, getSampleCase } from './specialty.registry';

@Controller('specialties')
export class SpecialtiesController {
  @Public()
  @Get()
  @Header('Cache-Control', 'public, max-age=3600')
  getSpecialties(): SpecialtyListResponse {
    return { specialties: getAllSpecialtyOptions() };
  }

  // Public and cacheable: the sample is fictional config, identical for every caller.
  // The header is set only on success — `@Header` also applies to thrown errors, and a
  // cached 404 would hide a sample added later for up to an hour. Errors keep the
  // default `no-store` from `applySecurityHeaders()`.
  @Public()
  @Get(':specialty/sample-case')
  getSampleCase(
    @Param('specialty', ParseIntPipe) specialty: number,
    @Res({ passthrough: true }) res: Response
  ): SampleCaseResponse {
    const sample = getSampleCase(specialty as Specialty);
    if (!sample) {
      throw new NotFoundException('No sample case for this specialty');
    }
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return sample;
  }
}
