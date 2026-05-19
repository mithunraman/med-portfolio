import { Module } from '@nestjs/common';
import { AcknowledgementsModule } from '../acknowledgements';
import { AuthModule } from '../auth/auth.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { NoticesModule } from '../notices';
import { QuotaModule } from '../quota';
import { VersionPolicyModule } from '../version-policy';
import { InitController } from './init.controller';
import { InitService } from './init.service';

@Module({
  imports: [
    AuthModule,
    DashboardModule,
    QuotaModule,
    VersionPolicyModule,
    NoticesModule,
    AcknowledgementsModule,
  ],
  controllers: [InitController],
  providers: [InitService],
})
export class InitModule {}
