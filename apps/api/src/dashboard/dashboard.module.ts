import { Module } from '@nestjs/common';
import { ArtefactsModule } from '../artefacts/artefacts.module';
import { PdpGoalsModule } from '../pdp-goals/pdp-goals.module';
import { ReviewPeriodsModule } from '../review-periods/review-periods.module';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [ArtefactsModule, PdpGoalsModule, ReviewPeriodsModule],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
