import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { StorageModule } from '../storage';
import { HealthController } from './health.controller';
import { MongoHealthIndicator } from './mongo-health.indicator';
import { StorageHealthIndicator } from './storage-health.indicator';

@Module({
  imports: [TerminusModule, StorageModule],
  controllers: [HealthController],
  providers: [MongoHealthIndicator, StorageHealthIndicator],
})
export class HealthModule {}
