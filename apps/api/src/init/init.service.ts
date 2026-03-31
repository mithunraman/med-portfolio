import type { InitResponse } from '@acme/shared';
import { UserRole } from '@acme/shared';
import { Injectable, Logger } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { QuotaService } from '../quota/quota.service';

@Injectable()
export class InitService {
  private readonly logger = new Logger(InitService.name);

  constructor(
    private readonly authService: AuthService,
    private readonly dashboardService: DashboardService,
    private readonly quotaService: QuotaService
  ) {}

  async getInit(userId: string, role: UserRole): Promise<InitResponse> {
    const [userResult, dashboardResult, quotaResult] = await Promise.allSettled([
      this.authService.getCurrentUser(userId),
      this.dashboardService.getDashboard(userId),
      this.quotaService.getQuotaStatus(userId, role),
    ]);

    if (userResult.status === 'rejected') {
      throw userResult.reason;
    }

    let dashboard: InitResponse['dashboard'] = null;
    if (dashboardResult.status === 'fulfilled') {
      dashboard = dashboardResult.value;
    } else {
      this.logger.warn(`Dashboard fetch failed for user ${userId}: ${dashboardResult.reason}`);
    }

    let quota: InitResponse['quota'] = null;
    if (quotaResult.status === 'fulfilled') {
      quota = quotaResult.value;
    } else {
      this.logger.warn(`Quota fetch failed for user ${userId}: ${quotaResult.reason}`);
    }

    return {
      user: userResult.value,
      dashboard,
      quota,
    };
  }
}
