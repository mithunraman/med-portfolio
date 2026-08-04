import type { AcknowledgementResponse } from '@acme/shared';
import { Body, Controller, Post } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { AcknowledgementsService } from './acknowledgements.service';
import { CreateAcknowledgementDto } from './dto';

@Controller('acknowledgements')
export class AcknowledgementsController {
  constructor(private readonly service: AcknowledgementsService) {}

  @Post()
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateAcknowledgementDto
  ): Promise<AcknowledgementResponse> {
    return this.service.create(user.userId, dto);
  }
}
