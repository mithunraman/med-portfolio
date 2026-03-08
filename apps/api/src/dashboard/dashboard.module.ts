import { Module } from '@nestjs/common';
import { ArtefactsModule } from '../artefacts/artefacts.module';
import { PdpGoalsModule } from '../pdp-goals/pdp-goals.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [ArtefactsModule, PdpGoalsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
