import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { Public } from '../common/decorators/public.decorator';
import { MongoHealthIndicator } from './mongo-health.indicator';
import { StorageHealthIndicator } from './storage-health.indicator';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly mongoIndicator: MongoHealthIndicator,
    private readonly storageIndicator: StorageHealthIndicator,
  ) {}

  @Get()
  @Public()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.mongoIndicator.isHealthy('mongodb'),
      () => this.storageIndicator.isHealthy('storage'),
    ]);
  }
}
