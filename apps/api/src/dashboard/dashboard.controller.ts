import type { DashboardResponse } from '@acme/shared';
import { Controller, Get } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  async getDashboard(@CurrentUser() user: CurrentUserPayload): Promise<DashboardResponse> {
    return this.dashboardService.getDashboard(user.userId);
  }
}
