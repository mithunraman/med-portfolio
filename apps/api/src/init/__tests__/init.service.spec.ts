import { UserRole } from '@acme/shared';
import { Test, TestingModule } from '@nestjs/testing';
import { AcknowledgementsRepository } from '../../acknowledgements/acknowledgements.repository';
import { NOTICE_REGISTRY } from '../../acknowledgements/registry';
import { ARTEFACTS_REPOSITORY } from '../../artefacts/artefacts.repository.interface';
import { AuthService } from '../../auth/auth.service';
import { ok, err } from '../../common/utils/result.util';
import { GUEST_ARTEFACT_LIMIT } from '../../config/quota.config';
import { DashboardService } from '../../dashboard/dashboard.service';
import { NoticesService } from '../../notices/notices.service';
import { QuotaService } from '../../quota/quota.service';
import { VersionPolicyService } from '../../version-policy/version-policy.service';
import { InitService } from '../init.service';

const USER_ID = '507f1f77bcf86cd799439011';
const USER = { id: USER_ID, email: 'e@e', name: 'E', role: 0, specialty: null } as never;

interface BuildOptions {
  countByUser?: jest.Mock;
}

async function build(
  acksImpl: () => Promise<unknown>,
  options: BuildOptions = {}
): Promise<InitService> {
  const countByUser = options.countByUser ?? jest.fn().mockResolvedValue(ok(0));
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      InitService,
      { provide: AuthService, useValue: { getCurrentUser: jest.fn().mockResolvedValue(USER) } },
      { provide: DashboardService, useValue: { getDashboard: jest.fn().mockResolvedValue(null) } },
      { provide: QuotaService, useValue: { getQuotaStatus: jest.fn().mockResolvedValue(null) } },
      { provide: VersionPolicyService, useValue: { evaluate: jest.fn().mockResolvedValue(null) } },
      { provide: NoticesService, useValue: { getNoticesForUser: jest.fn().mockResolvedValue([]) } },
      {
        provide: AcknowledgementsRepository,
        useValue: {
          findAcknowledgedVersions: jest.fn().mockImplementation(acksImpl),
        },
      },
      { provide: ARTEFACTS_REPOSITORY, useValue: { countByUser } },
    ],
  }).compile();
  return module.get(InitService);
}

describe('InitService.acknowledgement (orchestration)', () => {
  const activeVersion = NOTICE_REGISTRY.active.version;

  it('needs:true on first signup (empty versions)', async () => {
    const svc = await build(async () => ok([]));
    const res = await svc.getInit(USER_ID, 0);
    expect(res.acknowledgement).toEqual({
      needs: true,
      document: expect.objectContaining({ version: activeVersion }),
    });
  });

  it('needs:false when user has acked the active version', async () => {
    const svc = await build(async () => ok([activeVersion]));
    const res = await svc.getInit(USER_ID, 0);
    expect(res.acknowledgement).toEqual({ needs: false });
  });

  it('fails closed when repo returns err', async () => {
    const svc = await build(async () => err({ code: 'DB_ERROR', message: 'boom' }));
    const res = await svc.getInit(USER_ID, 0);
    expect(res.acknowledgement).toMatchObject({ needs: true });
  });

  it('fails closed when repo rejects', async () => {
    const svc = await build(async () => {
      throw new Error('connection lost');
    });
    const res = await svc.getInit(USER_ID, 0);
    expect(res.acknowledgement).toMatchObject({ needs: true });
  });

  it('fails closed when user has only unknown versions', async () => {
    const svc = await build(async () => ok(['v0.9-retired']));
    const res = await svc.getInit(USER_ID, 0);
    expect(res.acknowledgement).toMatchObject({
      needs: true,
      document: expect.objectContaining({ version: activeVersion }),
    });
  });

  it('treats user as up-to-date when active version is among acked, regardless of array order', async () => {
    const svc = await build(async () => ok(['v0.9-retired', activeVersion]));
    const res = await svc.getInit(USER_ID, 0);
    expect(res.acknowledgement).toEqual({ needs: false });
  });
});

describe('InitService.guestArtefactLimitReached', () => {
  const okAcks = async () => ok([]);

  it('returns true for guest at or above the artefact limit', async () => {
    const countByUser = jest.fn().mockResolvedValue(ok(GUEST_ARTEFACT_LIMIT));
    const svc = await build(okAcks, { countByUser });
    const res = await svc.getInit(USER_ID, UserRole.USER_GUEST);
    expect(res.guestArtefactLimitReached).toBe(true);
    expect(countByUser).toHaveBeenCalledTimes(1);
  });

  it('returns false for guest under the limit', async () => {
    const countByUser = jest.fn().mockResolvedValue(ok(GUEST_ARTEFACT_LIMIT - 1));
    const svc = await build(okAcks, { countByUser });
    const res = await svc.getInit(USER_ID, UserRole.USER_GUEST);
    expect(res.guestArtefactLimitReached).toBe(false);
  });

  it('returns false for non-guests without querying count', async () => {
    const countByUser = jest.fn();
    const svc = await build(okAcks, { countByUser });
    const res = await svc.getInit(USER_ID, UserRole.USER);
    expect(res.guestArtefactLimitReached).toBe(false);
    expect(countByUser).not.toHaveBeenCalled();
  });

  it('fails soft to false when count repository errors', async () => {
    const countByUser = jest
      .fn()
      .mockResolvedValue(err({ code: 'DB_ERROR', message: 'boom' }));
    const svc = await build(okAcks, { countByUser });
    const res = await svc.getInit(USER_ID, UserRole.USER_GUEST);
    expect(res.guestArtefactLimitReached).toBe(false);
  });
});
