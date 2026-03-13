import { InternalServerErrorException } from '@nestjs/common';
import { Types } from 'mongoose';
import { err, ok } from '../../common/utils/result.util';
import { VersionHistoryService } from '../version-history.service';

// ── Helpers ──

const oid = () => new Types.ObjectId();
const entityType = 'artefact';
const entityId = oid();
const userId = oid();

function makeVersionDoc(version: number, snapshot: Record<string, unknown> = { title: 'Test' }) {
  return {
    _id: oid(),
    xid: `vh_${version}`,
    entityType,
    entityId,
    userId,
    version,
    timestamp: new Date(),
    snapshot,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ── Mocks ──

const mockRepo = {
  createVersion: jest.fn(),
  findByEntity: jest.fn(),
  findVersion: jest.fn(),
  countByEntity: jest.fn(),
};

function createService(): VersionHistoryService {
  return new VersionHistoryService(mockRepo as any);
}

// ── Tests ──

describe('VersionHistoryService', () => {
  let service: VersionHistoryService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = createService();
  });

  // ─── createVersion ───

  describe('createVersion', () => {
    it('creates first version with version = 1 when no prior versions exist', async () => {
      mockRepo.countByEntity.mockResolvedValue(ok(0));
      mockRepo.createVersion.mockResolvedValue(ok(makeVersionDoc(1)));

      await service.createVersion(entityType, entityId, userId, { title: 'Hello' });

      expect(mockRepo.countByEntity).toHaveBeenCalledWith(entityType, entityId, undefined);
      expect(mockRepo.createVersion).toHaveBeenCalledWith(
        expect.objectContaining({ entityType, entityId, userId, version: 1 }),
        undefined,
      );
    });

    it('increments version number based on existing count', async () => {
      mockRepo.countByEntity.mockResolvedValue(ok(3));
      mockRepo.createVersion.mockResolvedValue(ok(makeVersionDoc(4)));

      await service.createVersion(entityType, entityId, userId, { title: 'v4' });

      expect(mockRepo.createVersion).toHaveBeenCalledWith(
        expect.objectContaining({ version: 4 }),
        undefined,
      );
    });

    it('passes session through to repository calls', async () => {
      const session = {} as any;
      mockRepo.countByEntity.mockResolvedValue(ok(0));
      mockRepo.createVersion.mockResolvedValue(ok(makeVersionDoc(1)));

      await service.createVersion(entityType, entityId, userId, { title: 'Test' }, session);

      expect(mockRepo.countByEntity).toHaveBeenCalledWith(entityType, entityId, session);
      expect(mockRepo.createVersion).toHaveBeenCalledWith(expect.anything(), session);
    });

    it('stores snapshot data in the version', async () => {
      const snapshot = { title: 'My Title', reflection: [{ title: 'Section', text: 'Body' }] };
      mockRepo.countByEntity.mockResolvedValue(ok(0));
      mockRepo.createVersion.mockResolvedValue(ok(makeVersionDoc(1)));

      await service.createVersion(entityType, entityId, userId, snapshot);

      expect(mockRepo.createVersion).toHaveBeenCalledWith(
        expect.objectContaining({ snapshot }),
        undefined,
      );
    });

    it('throws InternalServerErrorException when countByEntity fails', async () => {
      mockRepo.countByEntity.mockResolvedValue(err({ code: 'DB_ERROR', message: 'count failed' }));

      await expect(
        service.createVersion(entityType, entityId, userId, { title: 'Test' }),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('throws InternalServerErrorException when createVersion fails', async () => {
      mockRepo.countByEntity.mockResolvedValue(ok(0));
      mockRepo.createVersion.mockResolvedValue(
        err({ code: 'DB_ERROR', message: 'create failed' }),
      );

      await expect(
        service.createVersion(entityType, entityId, userId, { title: 'Test' }),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ─── getVersions ───

  describe('getVersions', () => {
    it('returns versions from repository', async () => {
      const versions = [makeVersionDoc(3), makeVersionDoc(2), makeVersionDoc(1)];
      mockRepo.findByEntity.mockResolvedValue(ok(versions));

      const result = await service.getVersions(entityType, entityId);

      expect(result).toEqual(versions);
      expect(mockRepo.findByEntity).toHaveBeenCalledWith(entityType, entityId);
    });

    it('returns empty array when no versions exist', async () => {
      mockRepo.findByEntity.mockResolvedValue(ok([]));

      const result = await service.getVersions(entityType, entityId);

      expect(result).toEqual([]);
    });

    it('throws InternalServerErrorException on repository error', async () => {
      mockRepo.findByEntity.mockResolvedValue(
        err({ code: 'DB_ERROR', message: 'find failed' }),
      );

      await expect(service.getVersions(entityType, entityId)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ─── getVersion ───

  describe('getVersion', () => {
    it('returns a specific version', async () => {
      const version = makeVersionDoc(2);
      mockRepo.findVersion.mockResolvedValue(ok(version));

      const result = await service.getVersion(entityType, entityId, 2);

      expect(result).toEqual(version);
      expect(mockRepo.findVersion).toHaveBeenCalledWith(entityType, entityId, 2);
    });

    it('returns null when version does not exist', async () => {
      mockRepo.findVersion.mockResolvedValue(ok(null));

      const result = await service.getVersion(entityType, entityId, 999);

      expect(result).toBeNull();
    });

    it('throws InternalServerErrorException on repository error', async () => {
      mockRepo.findVersion.mockResolvedValue(
        err({ code: 'DB_ERROR', message: 'find failed' }),
      );

      await expect(service.getVersion(entityType, entityId, 1)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ─── countVersions ───

  describe('countVersions', () => {
    it('returns version count', async () => {
      mockRepo.countByEntity.mockResolvedValue(ok(5));

      const result = await service.countVersions(entityType, entityId);

      expect(result).toBe(5);
    });

    it('returns 0 when no versions exist', async () => {
      mockRepo.countByEntity.mockResolvedValue(ok(0));

      const result = await service.countVersions(entityType, entityId);

      expect(result).toBe(0);
    });

    it('passes session through', async () => {
      const session = {} as any;
      mockRepo.countByEntity.mockResolvedValue(ok(3));

      await service.countVersions(entityType, entityId, session);

      expect(mockRepo.countByEntity).toHaveBeenCalledWith(entityType, entityId, session);
    });

    it('throws InternalServerErrorException on repository error', async () => {
      mockRepo.countByEntity.mockResolvedValue(
        err({ code: 'DB_ERROR', message: 'count failed' }),
      );

      await expect(service.countVersions(entityType, entityId)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});
