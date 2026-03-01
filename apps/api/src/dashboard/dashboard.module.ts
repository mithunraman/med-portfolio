import { Module } from '@nestjs/common';
import { ArtefactsModule } from '../artefacts/artefacts.module';
import { PdpActionsModule } from '../pdp-actions/pdp-actions.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [ArtefactsModule, PdpActionsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
