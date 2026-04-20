import type { InitResponse } from '@acme/shared';
import { Controller, Get, Headers } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { InitService } from './init.service';

@Controller('init')
export class InitController {
  constructor(private readonly initService: InitService) {}

  @Get()
  async getInit(
    @CurrentUser() user: CurrentUserPayload,
    @Headers('x-app-version') appVersion?: string,
    @Headers('x-platform') platform?: string
  ): Promise<InitResponse> {
    return this.initService.getInit(user.userId, user.role, platform, appVersion);
  }
}
