import type { InitResponse } from '@acme/shared';
import { Injectable, Logger } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { DashboardService } from '../dashboard/dashboard.service';

@Injectable()
export class InitService {
  private readonly logger = new Logger(InitService.name);

  constructor(
    private readonly authService: AuthService,
    private readonly dashboardService: DashboardService
  ) {}

  async getInit(userId: string): Promise<InitResponse> {
    const [userResult, dashboardResult] = await Promise.allSettled([
      this.authService.getCurrentUser(userId),
      this.dashboardService.getDashboard(userId),
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

    return {
      user: userResult.value,
      dashboard,
    };
  }
}
