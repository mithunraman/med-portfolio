import type { AcknowledgementResponse } from '@acme/shared';
import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { AcknowledgementsService } from './acknowledgements.service';
import { CreateAcknowledgementDto } from './dto';

@Controller('acknowledgements')
export class AcknowledgementsController {
  constructor(private readonly service: AcknowledgementsService) {}

  @Post()
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateAcknowledgementDto,
    @Req() req: Request
  ): Promise<AcknowledgementResponse> {
    // Correctness of `req.ip` depends on `TRUST_PROXY_HOPS` being set to match
    // the deployment's proxy topology (see main.ts). Mis-configured → this
    // captures the proxy's address rather than the client's.
    const ip = req.ip ?? null;
    const ua = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null;
    return this.service.create(user.userId, dto, ip, ua);
  }
}
