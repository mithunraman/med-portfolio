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

  // Must list every required id in NOTICE_V1_0 — the service rejects a partial
  // set, so adding a required ack to the notice breaks this fixture by design.
  const validDto = {
    noticeVersion: 'v1.0',
    acknowledgements: [
      { id: 'patient_anon_duty' as const, given: true },
      { id: 'health_data_consent' as const, given: true },
      { id: 'accept_privacy_terms' as const, given: true },
    ],
  };

  describe('AcknowledgementsService.create', () => {
    it('creates a new row on first call', async () => {
      const response = await service.create(userId, validDto);

      expect(response.noticeVersion).toBe('v1.0');
      expect(response.xid).toEqual(expect.any(String));
      expect(response.acknowledgements).toHaveLength(validDto.acknowledgements.length);

      const docs = await model.find({}).lean();
      expect(docs).toHaveLength(1);
      // The row carries no identifiers of its own — see the schema doc comment.
      // It outlives account deletion, so anything stored here outlives it too.
      expect(docs[0]).not.toHaveProperty('ip');
      expect(docs[0]).not.toHaveProperty('userAgent');
    });

    it('idempotent: duplicate POST returns the same row without inserting another', async () => {
      const first = await service.create(userId, validDto);
      const second = await service.create(userId, validDto);

      expect(second.xid).toBe(first.xid);
      const existing = await repository.findByUserAndVersion(userId, 'v1.0');
      expect(existing.ok).toBe(true);
      if (existing.ok) expect(existing.value).not.toBeNull();
      expect(await model.countDocuments({})).toBe(1);
    });

    it('rejects unknown noticeVersion', async () => {
      await expect(
        service.create(userId, { ...validDto, noticeVersion: 'v9.9' })
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when required ack id is missing', async () => {
      await expect(
        service.create(
          userId,
          {
            noticeVersion: 'v1.0',
            acknowledgements: [{ id: 'patient_anon_duty', given: true }],
          }
        )
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when required ack is given:false', async () => {
      // Every other required id is present and true, so `given: false` is the
      // ONLY violated precondition — otherwise a weakened guard (e.g. rejecting
      // only `undefined`) would still throw on a missing id and this would stay
      // green. Asserting the id in the message pins which check fired, so the
      // test also survives a reordering of `notices/v1.0.ts`.
      const call = service.create(userId, {
        noticeVersion: 'v1.0',
        acknowledgements: [
          { id: 'patient_anon_duty', given: true },
          { id: 'health_data_consent', given: false },
          { id: 'accept_privacy_terms', given: true },
        ],
      });

      await expect(call).rejects.toThrow(BadRequestException);
      await expect(call).rejects.toThrow(
        'Required acknowledgement missing or not given: health_data_consent'
      );
    });

    it('handles concurrent POSTs: one row, both succeed', async () => {
      const [a, b] = await Promise.all([
        service.create(userId, validDto),
        service.create(userId, validDto),
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
      });
      await repository.create({
        userId,
        noticeVersion: 'v1.1',
        acknowledgements: [],
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
      });
      expect(seed.ok).toBe(true);

      const result = await repository.findAcknowledgedVersions(userId);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toEqual([]);
    });
  });
});
