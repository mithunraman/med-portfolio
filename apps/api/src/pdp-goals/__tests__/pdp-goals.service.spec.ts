import { BadRequestException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { err, ok } from '../../common/utils/result.util';
import { PdpGoalsService } from '../pdp-goals.service';

const oid = () => new Types.ObjectId();
const userId = oid();
const userIdStr = userId.toString();

const mockPdpGoalsRepo = {
  findOneWithArtefacts: jest.fn(),
  anonymizeGoal: jest.fn(),
  findByUserIdWithArtefact: jest.fn(),
  countByUserId: jest.fn(),
  saveGoal: jest.fn(),
  findPaginated: jest.fn(),
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

  // The service no longer inspects status — anonymizeGoal's filter owns that, and
  // its boolean is the whole answer. WHICH statuses are deletable is covered at the
  // repository layer in pdp-goals.repository.integration.spec.ts.
  describe('deleteGoal', () => {
    it('throws NotFoundException when nothing matched', async () => {
      // Missing, already deleted, or owned by someone else — all one signal here.
      mockPdpGoalsRepo.anonymizeGoal.mockResolvedValue(ok(false));

      await expect(service.deleteGoal(userIdStr, 'goal_abc')).rejects.toThrow(NotFoundException);
    });

    it('anonymizes goal and returns success message', async () => {
      mockPdpGoalsRepo.anonymizeGoal.mockResolvedValue(ok(true));

      const result = await service.deleteGoal(userIdStr, 'goal_abc');

      expect(result).toEqual({ message: 'Goal deleted successfully' });
      expect(mockPdpGoalsRepo.anonymizeGoal).toHaveBeenCalledWith('goal_abc', userId);
    });

    it('does not pre-read the goal', async () => {
      mockPdpGoalsRepo.anonymizeGoal.mockResolvedValue(ok(true));

      await service.deleteGoal(userIdStr, 'goal_abc');

      // The write already answers "did it exist"; a lookup to re-derive it is waste.
      expect(mockPdpGoalsRepo.findOneWithArtefacts).not.toHaveBeenCalled();
    });
  });

  describe('listGoals', () => {
    it('maps an INVALID_CURSOR repo error to BadRequestException (400)', async () => {
      mockPdpGoalsRepo.findPaginated.mockResolvedValue(
        err({ code: 'INVALID_CURSOR', message: 'Invalid pagination cursor' }),
      );

      await expect(service.listGoals(userIdStr, { cursor: 'garbage' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('maps a DB_ERROR repo error to InternalServerErrorException (500)', async () => {
      mockPdpGoalsRepo.findPaginated.mockResolvedValue(
        err({ code: 'DB_ERROR', message: 'Failed to find PDP goals' }),
      );

      await expect(service.listGoals(userIdStr, {})).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});
