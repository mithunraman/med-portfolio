import type { InitResponse } from '@acme/shared';
import { Controller, Get } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { InitService } from './init.service';

@Controller('init')
export class InitController {
  constructor(private readonly initService: InitService) {}

  @Get()
  async getInit(@CurrentUser() user: CurrentUserPayload): Promise<InitResponse> {
    return this.initService.getInit(user.userId);
  }
}
