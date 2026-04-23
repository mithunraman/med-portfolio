import type { InitResponse } from '@acme/shared';
import { UserRole } from '@acme/shared';
import { Injectable, Logger } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { NoticesService } from '../notices/notices.service';
import { QuotaService } from '../quota/quota.service';
import { VersionPolicyService } from '../version-policy/version-policy.service';

@Injectable()
export class InitService {
  private readonly logger = new Logger(InitService.name);

  constructor(
    private readonly authService: AuthService,
    private readonly dashboardService: DashboardService,
    private readonly quotaService: QuotaService,
    private readonly versionPolicyService: VersionPolicyService,
    private readonly noticesService: NoticesService
  ) {}

  async getInit(
    userId: string,
    role: UserRole,
    platform?: string,
    appVersion?: string
  ): Promise<InitResponse> {
    const [userResult, dashboardResult, quotaResult, updatePolicyResult, noticesResult] =
      await Promise.allSettled([
        this.authService.getCurrentUser(userId),
        this.dashboardService.getDashboard(userId),
        this.quotaService.getQuotaStatus(userId, role),
        this.versionPolicyService.evaluate(platform, appVersion),
        this.noticesService.getNoticesForUser(userId, role),
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

    let updatePolicy: InitResponse['updatePolicy'] = null;
    if (updatePolicyResult.status === 'fulfilled') {
      updatePolicy = updatePolicyResult.value;
    } else {
      this.logger.warn(`Version policy eval failed for user ${userId}: ${updatePolicyResult.reason}`);
    }

    let notices: InitResponse['notices'] = [];
    if (noticesResult.status === 'fulfilled') {
      notices = noticesResult.value;
    } else {
      this.logger.warn(`Notices fetch failed for user ${userId}: ${noticesResult.reason}`);
    }

    return {
      user: userResult.value,
      dashboard,
      quota,
      updatePolicy,
      notices,
    };
  }
}
