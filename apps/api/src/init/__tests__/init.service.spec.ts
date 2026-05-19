import { Test, TestingModule } from '@nestjs/testing';
import { AcknowledgementsRepository } from '../../acknowledgements/acknowledgements.repository';
import { NOTICE_REGISTRY } from '../../acknowledgements/registry';
import { AuthService } from '../../auth/auth.service';
import { ok, err } from '../../common/utils/result.util';
import { DashboardService } from '../../dashboard/dashboard.service';
import { NoticesService } from '../../notices/notices.service';
import { QuotaService } from '../../quota/quota.service';
import { VersionPolicyService } from '../../version-policy/version-policy.service';
import { InitService } from '../init.service';

const USER_ID = '507f1f77bcf86cd799439011';
const USER = { id: USER_ID, email: 'e@e', name: 'E', role: 0, specialty: null } as never;

async function build(acksImpl: () => Promise<unknown>): Promise<InitService> {
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
