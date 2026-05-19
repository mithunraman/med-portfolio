import { BadRequestException } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import { AcknowledgementsRepository } from '../acknowledgements.repository';
import { AcknowledgementsService } from '../acknowledgements.service';
import {
  Acknowledgement,
  AcknowledgementDocument,
  AcknowledgementSchema,
} from '../schemas/acknowledgement.schema';

describe('Acknowledgements (integration)', () => {
  let mongod: MongoMemoryReplSet;
  let module: TestingModule;
  let service: AcknowledgementsService;
  let repository: AcknowledgementsRepository;
  let model: Model<AcknowledgementDocument>;

  const userId = '507f1f77bcf86cd799439011';
  const otherUserId = '507f1f77bcf86cd799439022';

  beforeAll(async () => {
    mongod = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });

    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: Acknowledgement.name, schema: AcknowledgementSchema },
        ]),
      ],
      providers: [AcknowledgementsRepository, AcknowledgementsService],
    }).compile();

    await module.init();

    service = module.get(AcknowledgementsService);
    repository = module.get(AcknowledgementsRepository);
    model = module.get<Model<AcknowledgementDocument>>(getModelToken(Acknowledgement.name));
  }, 60_000);

  afterAll(async () => {
    await module.close();
    await mongod.stop();
  });

  beforeEach(async () => {
    await model.deleteMany({});
  });

  const validDto = {
    noticeVersion: 'v1.0',
    acknowledgements: [
      { id: 'role_uk_trainee' as const, given: true },
      { id: 'patient_anon_duty' as const, given: true },
    ],
  };

  describe('AcknowledgementsService.create', () => {
    it('creates a new row on first call', async () => {
      const response = await service.create(userId, validDto, '127.0.0.1', 'jest-ua');

      expect(response.noticeVersion).toBe('v1.0');
      expect(response.xid).toEqual(expect.any(String));
      expect(response.acknowledgements).toHaveLength(2);

      const docs = await model.find({}).lean();
      expect(docs).toHaveLength(1);
      expect(docs[0].ip).toBe('127.0.0.1');
      expect(docs[0].userAgent).toBe('jest-ua');
    });

    it('idempotent: duplicate POST returns the same row without inserting another', async () => {
      const first = await service.create(userId, validDto, '127.0.0.1', 'jest-ua');
      const second = await service.create(userId, validDto, '127.0.0.1', 'jest-ua');

      expect(second.xid).toBe(first.xid);
      const existing = await repository.findByUserAndVersion(userId, 'v1.0');
      expect(existing.ok).toBe(true);
      if (existing.ok) expect(existing.value).not.toBeNull();
      expect(await model.countDocuments({})).toBe(1);
    });

    it('rejects unknown noticeVersion', async () => {
      await expect(
        service.create(userId, { ...validDto, noticeVersion: 'v9.9' }, null, null)
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when required ack id is missing', async () => {
      await expect(
        service.create(
          userId,
          {
            noticeVersion: 'v1.0',
            acknowledgements: [{ id: 'role_uk_trainee', given: true }],
          },
          null,
          null
        )
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when required ack is given:false', async () => {
      await expect(
        service.create(
          userId,
          {
            noticeVersion: 'v1.0',
            acknowledgements: [
              { id: 'role_uk_trainee', given: true },
              { id: 'patient_anon_duty', given: false },
            ],
          },
          null,
          null
        )
      ).rejects.toThrow(BadRequestException);
    });

    it('handles concurrent POSTs: one row, both succeed', async () => {
      const [a, b] = await Promise.all([
        service.create(userId, validDto, null, null),
        service.create(userId, validDto, null, null),
      ]);

      expect(a.xid).toBe(b.xid);
      const existing = await repository.findByUserAndVersion(userId, 'v1.0');
      expect(existing.ok).toBe(true);
      if (existing.ok) expect(existing.value).not.toBeNull();
      expect(await model.countDocuments({})).toBe(1);
    });
  });

  describe('AcknowledgementsRepository.findAcknowledgedVersions', () => {
    it('returns an empty array for users with no rows', async () => {
      const result = await repository.findAcknowledgedVersions(userId);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toEqual([]);
    });

    it('returns every distinct noticeVersion the user has acked', async () => {
      await repository.create({
        userId,
        noticeVersion: 'v1.0',
        acknowledgements: [],
        ip: null,
        userAgent: null,
      });
      await repository.create({
        userId,
        noticeVersion: 'v1.1',
        acknowledgements: [],
        ip: null,
        userAgent: null,
      });

      const result = await repository.findAcknowledgedVersions(userId);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.sort()).toEqual(['v1.0', 'v1.1']);
    });

    it('scopes by userId', async () => {
      const seed = await repository.create({
        userId: otherUserId,
        noticeVersion: 'v1.0',
        acknowledgements: [],
        ip: null,
        userAgent: null,
      });
      expect(seed.ok).toBe(true);

      const result = await repository.findAcknowledgedVersions(userId);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toEqual([]);
    });
  });
});
