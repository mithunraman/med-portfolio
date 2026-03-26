import { Injectable, Logger } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class StorageHealthIndicator {
  private readonly logger = new Logger(StorageHealthIndicator.name);

  constructor(
    private readonly storageService: StorageService,
    private readonly indicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(key: string) {
    const indicator = this.indicatorService.check(key);

    try {
      // Use headObject on a non-existent key — a successful "not found" response
      // confirms credentials are valid and the bucket is reachable.
      await this.storageService.headObject(
        this.storageService.getMediaBucket(),
        '__health-check__'
      );
      return indicator.up();
    } catch (error) {
      this.logger.warn('Storage health check failed', error);
      const message = error instanceof Error ? error.message : 'Storage unreachable';
      return indicator.down({ message });
    }
  }
}
