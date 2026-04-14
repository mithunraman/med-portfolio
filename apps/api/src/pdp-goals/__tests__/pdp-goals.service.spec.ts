import { PdpGoalStatus } from '@acme/shared';
import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ok } from '../../common/utils/result.util';
import { PdpGoalsService } from '../pdp-goals.service';

const oid = () => new Types.ObjectId();
const userId = oid();
const userIdStr = userId.toString();

function makeGoalWithArtefact(overrides: Record<string, unknown> = {}) {
  return {
    xid: 'goal_abc',
    goal: 'Improve clinical skills',
    userId,
    artefactId: oid(),
    status: PdpGoalStatus.STARTED,
    reviewDate: null,
    completedAt: null,
    completionReview: null,
    actions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    artefactXid: 'art_abc',
    artefactTitle: 'Test Entry',
    ...overrides,
  };
}

const mockPdpGoalsRepo = {
  findOneWithArtefact: jest.fn(),
  anonymizeGoal: jest.fn(),
  findByUserIdWithArtefact: jest.fn(),
  countByUserId: jest.fn(),
  saveGoal: jest.fn(),
};

function createService(): PdpGoalsService {
  return new PdpGoalsService(mockPdpGoalsRepo as any);
}

describe('PdpGoalsService', () => {
  let service: PdpGoalsService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = createService();
  });

  describe('deleteGoal', () => {
    it('throws NotFoundException when goal does not exist', async () => {
      mockPdpGoalsRepo.findOneWithArtefact.mockResolvedValue(ok(null));

      await expect(service.deleteGoal(userIdStr, 'goal_abc')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when goal is already DELETED', async () => {
      mockPdpGoalsRepo.findOneWithArtefact.mockResolvedValue(
        ok(makeGoalWithArtefact({ status: PdpGoalStatus.DELETED })),
      );

      await expect(service.deleteGoal(userIdStr, 'goal_abc')).rejects.toThrow(NotFoundException);
    });

    it('anonymizes goal and returns success message', async () => {
      mockPdpGoalsRepo.findOneWithArtefact.mockResolvedValue(ok(makeGoalWithArtefact()));
      mockPdpGoalsRepo.anonymizeGoal.mockResolvedValue(ok(true));

      const result = await service.deleteGoal(userIdStr, 'goal_abc');

      expect(result).toEqual({ message: 'Goal deleted successfully' });
      expect(mockPdpGoalsRepo.anonymizeGoal).toHaveBeenCalledWith('goal_abc', userId);
    });

    it('works for COMPLETED goals', async () => {
      mockPdpGoalsRepo.findOneWithArtefact.mockResolvedValue(
        ok(makeGoalWithArtefact({ status: PdpGoalStatus.COMPLETED })),
      );
      mockPdpGoalsRepo.anonymizeGoal.mockResolvedValue(ok(true));

      const result = await service.deleteGoal(userIdStr, 'goal_abc');

      expect(result).toEqual({ message: 'Goal deleted successfully' });
    });

    it('works for ARCHIVED goals', async () => {
      mockPdpGoalsRepo.findOneWithArtefact.mockResolvedValue(
        ok(makeGoalWithArtefact({ status: PdpGoalStatus.ARCHIVED })),
      );
      mockPdpGoalsRepo.anonymizeGoal.mockResolvedValue(ok(true));

      const result = await service.deleteGoal(userIdStr, 'goal_abc');

      expect(result).toEqual({ message: 'Goal deleted successfully' });
    });
  });
});
