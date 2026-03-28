import { Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { DevOnly } from '../common/decorators/dev-only.decorator';
import { Public } from '../common/decorators/public.decorator';

@Controller('dev/account-cleanup')
@DevOnly()
@Public()
export class AccountCleanupController {
  constructor() {}

  @Post(':userId')
  @HttpCode(HttpStatus.OK)
  async triggerAnonymization(@Param('userId') userId: string): Promise<{ message: string }> {
    return { message: `Anonymization triggered for user ${userId}` };
  }
}
