import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { NoticesModule } from '../notices';
import { QuotaModule } from '../quota';
import { VersionPolicyModule } from '../version-policy';
import { InitController } from './init.controller';
import { InitService } from './init.service';

@Module({
  imports: [AuthModule, DashboardModule, QuotaModule, VersionPolicyModule, NoticesModule],
  controllers: [InitController],
  providers: [InitService],
})
export class InitModule {}
