import { ArtefactStatus, PdpGoalStatus, Specialty } from '@acme/shared';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ok } from '../../common/utils/result.util';
import { ArtefactsService } from '../artefacts.service';

// ── Helpers ──

const oid = () => new Types.ObjectId();
const userId = oid();
const userIdStr = userId.toString();
const artefactOid = oid();

function makeArtefactDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: artefactOid,
    xid: 'art_abc123',
    artefactId: `${userIdStr}_client1`,
    userId,
    status: ArtefactStatus.REVIEW,
    specialty: Specialty.GP,
    title: 'Test Artefact',
    artefactType: null,
    reflection: null,
    capabilities: null,
    tags: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeConversationDoc() {
  return {
    _id: oid(),
    xid: 'conv_abc123',
    title: 'Test Conversation',
    status: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makePdpGoalDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: oid(),
    xid: 'goal_1',
    goal: 'Improve clinical skills',
    userId,
    artefactId: artefactOid,
    status: PdpGoalStatus.PENDING,
    reviewDate: null,
    actions: [
      { xid: 'act_1', action: 'Action 1', status: PdpGoalStatus.PENDING },
      { xid: 'act_2', action: 'Action 2', status: PdpGoalStatus.PENDING },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ── Mocks ──

const mockArtefactsRepo = {
  findByXid: jest.fn(),
  updateArtefactById: jest.fn(),
  upsertArtefact: jest.fn(),
  listArtefacts: jest.fn(),
  countByUser: jest.fn(),
};

const mockConversationsRepo = {
  findActiveConversationByArtefact: jest.fn(),
  findActiveConversationsByArtefacts: jest.fn(),
  createConversation: jest.fn(),
};

const mockPdpGoalsRepo = {
  findByArtefactId: jest.fn(),
  findByArtefactIds: jest.fn(),
  create: jest.fn(),
  updateGoal: jest.fn(),
  updateManyByArtefactId: jest.fn(),
  findByUserId: jest.fn(),
  countByUserId: jest.fn(),
};

const mockTransactionService = {
  withTransaction: jest.fn((fn: (session: any) => Promise<any>) => fn({})),
};

function createService(): ArtefactsService {
  return new ArtefactsService(
    mockArtefactsRepo as any,
    mockConversationsRepo as any,
    mockPdpGoalsRepo as any,
    mockTransactionService as any,
  );
}

// ── Shared setup for buildArtefactDto ──

function setupBuildArtefactDtoMocks(pdpGoals = [makePdpGoalDoc()]) {
  mockConversationsRepo.findActiveConversationByArtefact.mockResolvedValue(
    ok(makeConversationDoc()),
  );
  mockPdpGoalsRepo.findByArtefactId.mockResolvedValue(ok(pdpGoals));
}

// ── Tests ──

describe('ArtefactsService', () => {
  let service: ArtefactsService;

  beforeEach(() => {
    jest.resetAllMocks();
    mockTransactionService.withTransaction.mockImplementation(
      (fn: (session: any) => Promise<any>) => fn({}),
    );
    service = createService();
  });

  // ─── finaliseArtefact ───

  describe('finaliseArtefact', () => {
    it('throws NotFoundException when artefact does not exist', async () => {
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(null));

      await expect(
        service.finaliseArtefact(userIdStr, 'art_abc123', { pdpGoalSelections: [] }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when artefact is not in REVIEW status', async () => {
      mockArtefactsRepo.findByXid.mockResolvedValue(
        ok(makeArtefactDoc({ status: ArtefactStatus.FINAL })),
      );

      await expect(
        service.finaliseArtefact(userIdStr, 'art_abc123', { pdpGoalSelections: [] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('sets artefact status to FINAL', async () => {
      const artefact = makeArtefactDoc();
      const updatedArtefact = makeArtefactDoc({ status: ArtefactStatus.FINAL });
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));
      mockArtefactsRepo.updateArtefactById.mockResolvedValue(ok(updatedArtefact));
      setupBuildArtefactDtoMocks();

      await service.finaliseArtefact(userIdStr, 'art_abc123', { pdpGoalSelections: [] });

      expect(mockArtefactsRepo.updateArtefactById).toHaveBeenCalledWith(
        artefact._id,
        { status: ArtefactStatus.FINAL },
        expect.anything(), // session
      );
    });

    it('activates selected goals with review date and per-action statuses', async () => {
      const artefact = makeArtefactDoc();
      const updatedArtefact = makeArtefactDoc({ status: ArtefactStatus.FINAL });
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));
      mockArtefactsRepo.updateArtefactById.mockResolvedValue(ok(updatedArtefact));
      mockPdpGoalsRepo.updateGoal.mockResolvedValue(ok(undefined));
      setupBuildArtefactDtoMocks();

      const reviewDate = '2026-06-01T00:00:00.000Z';

      await service.finaliseArtefact(userIdStr, 'art_abc123', {
        pdpGoalSelections: [
          {
            goalId: 'goal_1',
            selected: true,
            reviewDate,
            actions: [
              { actionId: 'act_1', selected: true },
              { actionId: 'act_2', selected: false },
            ],
          },
        ],
      });

      expect(mockPdpGoalsRepo.updateGoal).toHaveBeenCalledWith(
        'goal_1',
        { status: PdpGoalStatus.ACTIVE, reviewDate: new Date(reviewDate) },
        [
          { actionXid: 'act_1', status: PdpGoalStatus.ACTIVE },
          { actionXid: 'act_2', status: PdpGoalStatus.ARCHIVED },
        ],
        expect.anything(), // session
      );
    });

    it('archives unselected goals (cascades to all actions)', async () => {
      const artefact = makeArtefactDoc();
      const updatedArtefact = makeArtefactDoc({ status: ArtefactStatus.FINAL });
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));
      mockArtefactsRepo.updateArtefactById.mockResolvedValue(ok(updatedArtefact));
      mockPdpGoalsRepo.updateGoal.mockResolvedValue(ok(undefined));
      setupBuildArtefactDtoMocks();

      await service.finaliseArtefact(userIdStr, 'art_abc123', {
        pdpGoalSelections: [
          { goalId: 'goal_1', selected: false },
        ],
      });

      expect(mockPdpGoalsRepo.updateGoal).toHaveBeenCalledWith(
        'goal_1',
        { status: PdpGoalStatus.ARCHIVED },
        undefined, // no action updates → cascade
        expect.anything(), // session
      );
    });

    it('handles mixed selected and unselected goals', async () => {
      const artefact = makeArtefactDoc();
      const updatedArtefact = makeArtefactDoc({ status: ArtefactStatus.FINAL });
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));
      mockArtefactsRepo.updateArtefactById.mockResolvedValue(ok(updatedArtefact));
      mockPdpGoalsRepo.updateGoal.mockResolvedValue(ok(undefined));
      setupBuildArtefactDtoMocks();

      await service.finaliseArtefact(userIdStr, 'art_abc123', {
        pdpGoalSelections: [
          {
            goalId: 'goal_1',
            selected: true,
            reviewDate: '2026-06-01T00:00:00.000Z',
            actions: [{ actionId: 'act_1', selected: true }],
          },
          { goalId: 'goal_2', selected: false },
        ],
      });

      expect(mockPdpGoalsRepo.updateGoal).toHaveBeenCalledTimes(2);

      // First call: activate goal_1
      expect(mockPdpGoalsRepo.updateGoal).toHaveBeenCalledWith(
        'goal_1',
        expect.objectContaining({ status: PdpGoalStatus.ACTIVE }),
        expect.any(Array),
        expect.anything(),
      );

      // Second call: archive goal_2
      expect(mockPdpGoalsRepo.updateGoal).toHaveBeenCalledWith(
        'goal_2',
        { status: PdpGoalStatus.ARCHIVED },
        undefined,
        expect.anything(),
      );
    });
  });

  // ─── updateArtefactStatus (archive path) ───

  describe('updateArtefactStatus – archive', () => {
    it('archives PENDING PDP goals when archiving an artefact', async () => {
      const artefact = makeArtefactDoc({ status: ArtefactStatus.REVIEW });
      const archivedArtefact = makeArtefactDoc({ status: ArtefactStatus.ARCHIVED });
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));
      mockArtefactsRepo.updateArtefactById.mockResolvedValue(ok(archivedArtefact));
      mockPdpGoalsRepo.updateManyByArtefactId.mockResolvedValue(ok(undefined));
      setupBuildArtefactDtoMocks();

      await service.updateArtefactStatus(userIdStr, 'art_abc123', {
        status: ArtefactStatus.ARCHIVED,
      });

      // Should always archive PENDING goals
      expect(mockPdpGoalsRepo.updateManyByArtefactId).toHaveBeenCalledWith(
        artefact._id,
        { statuses: [PdpGoalStatus.PENDING] },
        { status: PdpGoalStatus.ARCHIVED },
        expect.anything(),
      );
    });

    it('does NOT archive ACTIVE/COMPLETED goals when archivePdpGoals is false', async () => {
      const artefact = makeArtefactDoc({ status: ArtefactStatus.REVIEW });
      const archivedArtefact = makeArtefactDoc({ status: ArtefactStatus.ARCHIVED });
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));
      mockArtefactsRepo.updateArtefactById.mockResolvedValue(ok(archivedArtefact));
      mockPdpGoalsRepo.updateManyByArtefactId.mockResolvedValue(ok(undefined));
      setupBuildArtefactDtoMocks();

      await service.updateArtefactStatus(userIdStr, 'art_abc123', {
        status: ArtefactStatus.ARCHIVED,
        archivePdpGoals: false,
      });

      // Only one call: PENDING goals
      expect(mockPdpGoalsRepo.updateManyByArtefactId).toHaveBeenCalledTimes(1);
      expect(mockPdpGoalsRepo.updateManyByArtefactId).toHaveBeenCalledWith(
        artefact._id,
        { statuses: [PdpGoalStatus.PENDING] },
        { status: PdpGoalStatus.ARCHIVED },
        expect.anything(),
      );
    });

    it('archives ACTIVE and COMPLETED goals when archivePdpGoals is true', async () => {
      const artefact = makeArtefactDoc({ status: ArtefactStatus.REVIEW });
      const archivedArtefact = makeArtefactDoc({ status: ArtefactStatus.ARCHIVED });
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));
      mockArtefactsRepo.updateArtefactById.mockResolvedValue(ok(archivedArtefact));
      mockPdpGoalsRepo.updateManyByArtefactId.mockResolvedValue(ok(undefined));
      setupBuildArtefactDtoMocks();

      await service.updateArtefactStatus(userIdStr, 'art_abc123', {
        status: ArtefactStatus.ARCHIVED,
        archivePdpGoals: true,
      });

      // Two calls: PENDING + ACTIVE/COMPLETED
      expect(mockPdpGoalsRepo.updateManyByArtefactId).toHaveBeenCalledTimes(2);

      expect(mockPdpGoalsRepo.updateManyByArtefactId).toHaveBeenCalledWith(
        artefact._id,
        { statuses: [PdpGoalStatus.PENDING] },
        { status: PdpGoalStatus.ARCHIVED },
        expect.anything(),
      );

      expect(mockPdpGoalsRepo.updateManyByArtefactId).toHaveBeenCalledWith(
        artefact._id,
        { statuses: [PdpGoalStatus.ACTIVE, PdpGoalStatus.COMPLETED] },
        { status: PdpGoalStatus.ARCHIVED },
        expect.anything(),
      );
    });

    it('performs simple status update for non-archive transitions', async () => {
      const artefact = makeArtefactDoc({ status: ArtefactStatus.DRAFT });
      const updatedArtefact = makeArtefactDoc({ status: ArtefactStatus.PROCESSING });
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));
      mockArtefactsRepo.updateArtefactById.mockResolvedValue(ok(updatedArtefact));
      setupBuildArtefactDtoMocks();

      await service.updateArtefactStatus(userIdStr, 'art_abc123', {
        status: ArtefactStatus.PROCESSING,
      });

      // Direct update, no transaction, no PDP goal changes
      expect(mockArtefactsRepo.updateArtefactById).toHaveBeenCalledWith(
        artefact._id,
        { status: ArtefactStatus.PROCESSING },
      );
      expect(mockPdpGoalsRepo.updateManyByArtefactId).not.toHaveBeenCalled();
    });
  });
});
