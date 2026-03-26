import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Injectable()
export class MongoHealthIndicator {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly indicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(key: string) {
    const indicator = this.indicatorService.check(key);

    // readyState: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
    if (this.connection.readyState === 1) {
      return indicator.up();
    }

    return indicator.down({ message: 'MongoDB connection is not ready' });
  }
}
