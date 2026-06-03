import { Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { DevOnly } from '../common/decorators/dev-only.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AccountCleanupService } from './account-cleanup.service';

@Controller('dev/account-cleanup')
@DevOnly()
@Public()
export class AccountCleanupController {
  constructor(private readonly accountCleanupService: AccountCleanupService) {}

  /**
   * Execute account deletion immediately, skipping the 48h grace period the cron
   * normally waits for. Runs the same gated flow as the scheduled job: the user
   * must have requested deletion (POST /auth/me/request-deletion) and not already
   * be anonymized, otherwise the safety gate throws 403.
   */
  @Post(':userId')
  @HttpCode(HttpStatus.OK)
  async triggerDeletion(@Param('userId') userId: string): Promise<{ message: string }> {
    await this.accountCleanupService.triggerDeletion(userId);
    return { message: `Deletion executed for user ${userId}` };
  }
}
