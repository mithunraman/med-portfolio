import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { NoticesAdminController } from '../notices.admin.controller';
import { NoticesController } from '../notices.controller';

function createMockService() {
  return {
    dismiss: jest.fn().mockResolvedValue(undefined),
    adminList: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    adminCreate: jest.fn(),
    adminUpdate: jest.fn(),
    adminDelete: jest.fn(),
  };
}

describe('NoticesController', () => {
  it('U-C-01: dismiss passes CurrentUser.userId and id to service', async () => {
    const service = createMockService();
    const controller = new NoticesController(service as any);
    const user: CurrentUserPayload = { userId: 'user_123', email: 'a@b.c', role: 0 };

    await controller.dismiss(user, 'not_xid_001');

    expect(service.dismiss).toHaveBeenCalledTimes(1);
    expect(service.dismiss).toHaveBeenCalledWith('user_123', 'not_xid_001');
  });
});

describe('NoticesAdminController', () => {
  let service: ReturnType<typeof createMockService>;
  let controller: NoticesAdminController;

  beforeEach(() => {
    service = createMockService();
    controller = new NoticesAdminController(service as any);
  });

  describe('list', () => {
    it("U-C-04a: parses active='true' as true", async () => {
      await controller.list('1', '20', 'true');
      expect(service.adminList).toHaveBeenCalledWith({ active: true }, 1, 20);
    });

    it("U-C-04b: parses active='false' as false", async () => {
      await controller.list('1', '20', 'false');
      expect(service.adminList).toHaveBeenCalledWith({ active: false }, 1, 20);
    });

    it('U-C-04c: missing active query yields empty filter', async () => {
      await controller.list('1', '20');
      expect(service.adminList).toHaveBeenCalledWith({}, 1, 20);
    });

    it('U-C-05: clamps limit to 100', async () => {
      await controller.list('1', '500');
      expect(service.adminList).toHaveBeenCalledWith({}, 1, 100);
    });

    it('U-C-06: defaults page=1 limit=20 when query missing', async () => {
      await controller.list();
      expect(service.adminList).toHaveBeenCalledWith({}, 1, 20);
    });

    it("U-C-07: treats active='1' as neither true nor false", async () => {
      await controller.list('1', '20', '1');
      expect(service.adminList).toHaveBeenCalledWith({}, 1, 20);
    });

    it('coerces non-numeric page to default 1', async () => {
      await controller.list('abc', '20');
      expect(service.adminList).toHaveBeenCalledWith({}, 1, 20);
    });
  });

  describe('create / update / delete', () => {
    it('forwards create dto to service', async () => {
      const dto = { title: 'X' } as any;
      service.adminCreate.mockResolvedValue({ id: 'not_new' });

      const result = await controller.create(dto);

      expect(service.adminCreate).toHaveBeenCalledWith(dto);
      expect(result).toEqual({ id: 'not_new' });
    });

    it('forwards update id and dto to service', async () => {
      const dto = { title: 'Y' } as any;
      service.adminUpdate.mockResolvedValue({ id: 'not_x' });

      const result = await controller.update('not_x', dto);

      expect(service.adminUpdate).toHaveBeenCalledWith('not_x', dto);
      expect(result).toEqual({ id: 'not_x' });
    });

    it('forwards delete id to service', async () => {
      await controller.delete('not_x');
      expect(service.adminDelete).toHaveBeenCalledWith('not_x');
    });
  });
});
