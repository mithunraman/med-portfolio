import type { SpecialtyListResponse } from '@acme/shared';
import { Controller, Get, Header } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { getAllSpecialtyOptions } from './specialty.registry';

@Controller('specialties')
export class SpecialtiesController {
  @Public()
  @Get()
  @Header('Cache-Control', 'public, max-age=3600')
  getSpecialties(): SpecialtyListResponse {
    return { specialties: getAllSpecialtyOptions() };
  }
}
