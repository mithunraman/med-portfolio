import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { InitController } from './init.controller';
import { InitService } from './init.service';

@Module({
  imports: [AuthModule, DashboardModule],
  controllers: [InitController],
  providers: [InitService],
})
export class InitModule {}
