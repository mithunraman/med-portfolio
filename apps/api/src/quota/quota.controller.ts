import type { CreditInfoResponse } from '@acme/shared';
import { Controller, Get, Header } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { creditInfoItems } from './quota-info.config';

@Controller('quota')
export class QuotaController {
  @Public()
  @Get('info')
  @Header('Cache-Control', 'public, max-age=3600')
  getCreditInfo(): CreditInfoResponse {
    return creditInfoItems;
  }
}
