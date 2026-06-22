import { MediaStatus, MediaType } from '@acme/shared';
import { BadRequestException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ok } from '../../common/utils/result.util';
import { StorageService } from '../../storage/storage.service';
import { MAX_UPLOAD_SIZE_BYTES, MediaService } from '../media.service';
import { IMediaRepository } from '../media.repository.interface';
import { Media } from '../schemas/media.schema';

const userObjectId = new Types.ObjectId();
const userIdStr = userObjectId.toString();

function createMockRepo(): jest.Mocked<IMediaRepository> {
  return {
    create: jest.fn().mockResolvedValue(ok(buildMedia())),
    findByXid: jest.fn().mockResolvedValue(ok(null)),
    updateStatus: jest.fn().mockResolvedValue(ok(null)),
    findByUser: jest.fn().mockResolvedValue(ok([])),
    markPendingDeleteByMessageIds: jest.fn().mockResolvedValue(ok(0)),
    markPendingDeleteByUser: jest.fn().mockResolvedValue(ok(0)),
    findPendingDeleteBatch: jest.fn().mockResolvedValue(ok([])),
    countDeadLettered: jest.fn().mockResolvedValue(ok(0)),
    markDeleted: jest.fn().mockResolvedValue(ok(0)),
    incrementDeleteAttempts: jest.fn().mockResolvedValue(ok(undefined)),
  };
}

function createMockStorage(): jest.Mocked<
  Pick<
    StorageService,
    | 'getMediaBucket'
    | 'generateMediaKey'
    | 'generatePresignedUploadUrl'
    | 'generatePresignedDownloadUrl'
    | 'headObject'
  >
> {
  return {
    getMediaBucket: jest.fn().mockReturnValue('test-bucket'),
    generateMediaKey: jest.fn().mockReturnValue('media/u/x.m4a'),
    generatePresignedUploadUrl: jest.fn().mockResolvedValue('https://signed.example/put'),
    generatePresignedDownloadUrl: jest.fn().mockResolvedValue('https://signed.example/get'),
    headObject: jest.fn(),
  } as never;
}

function buildMedia(overrides: Partial<Media> = {}): Media {
  return {
    _id: new Types.ObjectId(),
    xid: 'med_000001',
    userId: userObjectId,
    bucket: 'test-bucket',
    key: 'media/u/x.m4a',
    status: MediaStatus.PENDING,
    refCollection: null,
    refDocumentId: null,
    mediaType: MediaType.AUDIO,
    mimeType: 'audio/mp4',
    sizeBytes: null,
    durationMs: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as Media;
}

function createService(
  repo = createMockRepo(),
  storage = createMockStorage()
) {
  const service = new MediaService(repo, storage as unknown as StorageService);
  return { service, repo, storage };
}

describe('MediaService.initiateUpload', () => {
  beforeEach(() => jest.resetAllMocks());

  it('rejects sizeBytes above the cap with BadRequestException', async () => {
    const { service, repo, storage } = createService();

    await expect(
      service.initiateUpload(userIdStr, MediaType.AUDIO, 'audio/mp4', MAX_UPLOAD_SIZE_BYTES + 1)
    ).rejects.toThrow(BadRequestException);

    // Must short-circuit before persistence or signing
    expect(repo.create).not.toHaveBeenCalled();
    expect(storage.generatePresignedUploadUrl).not.toHaveBeenCalled();
  });

  it('accepts sizeBytes exactly at the cap', async () => {
    const { service, repo, storage } = createService();
    repo.create.mockResolvedValue(ok(buildMedia()));

    const result = await service.initiateUpload(
      userIdStr,
      MediaType.AUDIO,
      'audio/mp4',
      MAX_UPLOAD_SIZE_BYTES
    );

    expect(result.uploadUrl).toBe('https://signed.example/put');
    expect(repo.create).toHaveBeenCalledTimes(1);
    expect(storage.generatePresignedUploadUrl).toHaveBeenCalledTimes(1);
  });

  it('forwards sizeBytes to the repository on create', async () => {
    const { service, repo } = createService();

    await service.initiateUpload(userIdStr, MediaType.AUDIO, 'audio/mp4', 5_000_000);

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ sizeBytes: 5_000_000, mediaType: MediaType.AUDIO })
    );
  });

  it('forwards sizeBytes as contentLength when signing the upload URL', async () => {
    const { service, storage } = createService();

    await service.initiateUpload(userIdStr, MediaType.AUDIO, 'audio/mp4', 5_000_000);

    expect(storage.generatePresignedUploadUrl).toHaveBeenCalledWith(
      'test-bucket',
      'media/u/x.m4a',
      'audio/mp4',
      5_000_000,
      expect.any(Number)
    );
  });
});

describe('MediaService.getPresignedUrl', () => {
  beforeEach(() => jest.resetAllMocks());

  it('signs a download URL for media owned by the caller', async () => {
    const { service, repo, storage } = createService();
    const media = buildMedia({ status: MediaStatus.ATTACHED });
    repo.findByXid.mockResolvedValue(ok(media));
    storage.generatePresignedDownloadUrl.mockResolvedValue('https://signed.example/get');

    const url = await service.getPresignedUrl(userIdStr, media.xid);

    expect(url).toBe('https://signed.example/get');
    // Ownership is enforced at the repo via (xid, userId).
    expect(repo.findByXid).toHaveBeenCalledWith(media.xid, userObjectId);
    expect(storage.generatePresignedDownloadUrl).toHaveBeenCalledWith(
      media.bucket,
      media.key,
      expect.any(Number)
    );
  });

  it('throws NotFoundException and never signs a URL when media is not owned by the caller (IDOR)', async () => {
    const { service, repo, storage } = createService();
    // Repo scopes by userId → another user's media resolves to null.
    repo.findByXid.mockResolvedValue(ok(null));

    await expect(service.getPresignedUrl(userIdStr, 'med_victim')).rejects.toThrow(
      NotFoundException
    );

    expect(repo.findByXid).toHaveBeenCalledWith('med_victim', userObjectId);
    expect(storage.generatePresignedDownloadUrl).not.toHaveBeenCalled();
  });
});

describe('MediaService.validateMediaUpload', () => {
  beforeEach(() => jest.resetAllMocks());

  it('rejects when the uploaded file exceeds the cap (defense-in-depth)', async () => {
    const repo = createMockRepo();
    const storage = createMockStorage();
    const media = buildMedia();
    repo.findByXid.mockResolvedValue(ok(media));
    storage.headObject.mockResolvedValue({
      ContentType: media.mimeType,
      ContentLength: MAX_UPLOAD_SIZE_BYTES + 1,
    } as never);

    const { service } = createService(repo, storage);

    await expect(service.validateMediaUpload(userIdStr, media.xid)).rejects.toThrow(
      BadRequestException
    );
  });

  it('throws InternalServerError when HEAD response is missing ContentLength', async () => {
    const repo = createMockRepo();
    const storage = createMockStorage();
    const media = buildMedia();
    repo.findByXid.mockResolvedValue(ok(media));
    storage.headObject.mockResolvedValue({
      ContentType: media.mimeType,
      ContentLength: undefined,
    } as never);

    const { service } = createService(repo, storage);

    await expect(service.validateMediaUpload(userIdStr, media.xid)).rejects.toThrow(
      InternalServerErrorException
    );
  });

  it('returns the actual size when within the cap', async () => {
    const repo = createMockRepo();
    const storage = createMockStorage();
    const media = buildMedia();
    repo.findByXid.mockResolvedValue(ok(media));
    storage.headObject.mockResolvedValue({
      ContentType: media.mimeType,
      ContentLength: 1_234_567,
    } as never);

    const { service } = createService(repo, storage);

    const result = await service.validateMediaUpload(userIdStr, media.xid);

    expect(result.sizeBytes).toBe(1_234_567);
  });
});
