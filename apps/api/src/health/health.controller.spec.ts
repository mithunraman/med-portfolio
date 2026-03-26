import { HealthCheckService } from '@nestjs/terminus';
import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { MongoHealthIndicator } from './mongo-health.indicator';
import { StorageHealthIndicator } from './storage-health.indicator';

describe('HealthController', () => {
  let controller: HealthController;
  let mongoIndicator: MongoHealthIndicator;
  let storageIndicator: StorageHealthIndicator;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthCheckService,
          useValue: {
            check: jest.fn((indicators: (() => Promise<any>)[]) =>
              Promise.all(indicators.map((fn) => fn())).then((results) => ({
                status: 'ok',
                info: Object.assign({}, ...results),
              }))
            ),
          },
        },
        {
          provide: MongoHealthIndicator,
          useValue: { isHealthy: jest.fn() },
        },
        {
          provide: StorageHealthIndicator,
          useValue: { isHealthy: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get(HealthController);
    mongoIndicator = module.get(MongoHealthIndicator);
    storageIndicator = module.get(StorageHealthIndicator);
  });

  it('should return healthy status when all dependencies are up', async () => {
    (mongoIndicator.isHealthy as jest.Mock).mockResolvedValue({
      mongodb: { status: 'up' },
    });
    (storageIndicator.isHealthy as jest.Mock).mockResolvedValue({
      storage: { status: 'up' },
    });

    const result = await controller.check();

    expect(result.status).toBe('ok');
    expect(result.info).toEqual(
      expect.objectContaining({
        mongodb: { status: 'up' },
        storage: { status: 'up' },
      })
    );
  });

  it('should call both health indicators', async () => {
    (mongoIndicator.isHealthy as jest.Mock).mockResolvedValue({
      mongodb: { status: 'up' },
    });
    (storageIndicator.isHealthy as jest.Mock).mockResolvedValue({
      storage: { status: 'up' },
    });

    await controller.check();

    expect(mongoIndicator.isHealthy).toHaveBeenCalledWith('mongodb');
    expect(storageIndicator.isHealthy).toHaveBeenCalledWith('storage');
  });
});
