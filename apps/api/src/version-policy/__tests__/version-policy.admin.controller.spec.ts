import { Platform } from '@acme/shared';
import { BadRequestException } from '@nestjs/common';
import { VersionPolicyAdminController } from '../version-policy.admin.controller';

function createMockService() {
  return {
    getAll: jest.fn().mockResolvedValue([]),
    upsert: jest.fn(),
  };
}

describe('VersionPolicyAdminController', () => {
  let service: ReturnType<typeof createMockService>;
  let controller: VersionPolicyAdminController;

  beforeEach(() => {
    service = createMockService();
    controller = new VersionPolicyAdminController(service as any);
  });

  describe('getAll', () => {
    it('forwards to service.getAll', async () => {
      const expected = [{ xid: 'pol_a' } as any];
      service.getAll.mockResolvedValue(expected);

      const result = await controller.getAll();

      expect(service.getAll).toHaveBeenCalledTimes(1);
      expect(result).toBe(expected);
    });
  });

  describe('upsert', () => {
    const validDto = {
      platform: Platform.IOS,
      minimumVersion: '2.0.0',
      recommendedVersion: '2.5.0',
      latestVersion: '3.0.0',
      storeUrl: 'https://apps.apple.com/app/example',
      message: 'Please update',
    };

    it('U-C-03: forwards DTO to service when params match', async () => {
      const expected = { xid: 'pol_x', ...validDto } as any;
      service.upsert.mockResolvedValue(expected);

      const result = await controller.upsert(Platform.IOS, validDto as any);

      expect(service.upsert).toHaveBeenCalledWith(validDto);
      expect(result).toBe(expected);
    });

    it('U-C-02: throws BadRequest when URL platform != body platform', async () => {
      await expect(
        controller.upsert(Platform.IOS, { ...validDto, platform: Platform.ANDROID } as any)
      ).rejects.toThrow(BadRequestException);

      expect(service.upsert).not.toHaveBeenCalled();
    });
  });
});
