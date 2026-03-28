import { Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { DevOnly } from '../common/decorators/dev-only.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AccountCleanupService } from './account-cleanup.service';

@Controller('dev/account-cleanup')
@DevOnly()
@Public()
export class AccountCleanupController {
  constructor(private readonly cleanupService: AccountCleanupService) {}

  @Post(':userId')
  @HttpCode(HttpStatus.OK)
  async triggerAnonymization(@Param('userId') userId: string): Promise<{ message: string }> {
    await this.cleanupService.triggerAnonymization(userId);
    return { message: `Anonymization triggered for user ${userId}` };
  }
}
