import { Module } from '@nestjs/common';
import { ArtefactsModule } from '../artefacts/artefacts.module';
import { PdpGoalsModule } from '../pdp-goals/pdp-goals.module';
import { ReviewPeriodsModule } from '../review-periods/review-periods.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [ArtefactsModule, PdpGoalsModule, ReviewPeriodsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
