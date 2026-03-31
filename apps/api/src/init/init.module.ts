import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { QuotaModule } from '../quota';
import { InitController } from './init.controller';
import { InitService } from './init.service';

@Module({
  imports: [AuthModule, DashboardModule, QuotaModule],
  controllers: [InitController],
  providers: [InitService],
})
export class InitModule {}
