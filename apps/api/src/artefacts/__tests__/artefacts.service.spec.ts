import { ArtefactStatus, PdpGoalStatus, QuotaErrorCode, Specialty, UserRole } from '@acme/shared';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { err, ok } from '../../common/utils/result.util';
import { GUEST_ARTEFACT_LIMIT } from '../../config/quota.config';
import { getSpecialtyConfig } from '../../specialties/specialty.registry';
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
    status: ArtefactStatus.IN_REVIEW,
    specialty: Specialty.GP,
    title: 'Test Artefact',
    artefactType: null,
    composedDocument: null,
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
    status: PdpGoalStatus.NOT_STARTED,
    reviewDate: null,
    actions: [
      { xid: 'act_1', action: 'Action 1', status: PdpGoalStatus.NOT_STARTED },
      { xid: 'act_2', action: 'Action 2', status: PdpGoalStatus.NOT_STARTED },
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
  upsertReview: jest.fn(),
  replaceNotes: jest.fn(),
  listArtefacts: jest.fn(),
  countByUser: jest.fn(),
  markDeleted: jest.fn().mockResolvedValue(ok(1)),
};

const mockConversationsRepo = {
  findActiveConversationByArtefact: jest.fn(),
  findActiveConversationsByArtefacts: jest.fn(),
  createConversation: jest.fn(),
  findIdsByArtefactIds: jest.fn().mockResolvedValue(ok([])),
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

const mockVersionHistoryService = {
  createVersion: jest.fn(),
  getVersions: jest.fn(),
  getVersion: jest.fn(),
  countVersions: jest.fn().mockResolvedValue(0),
  anonymizeByEntity: jest.fn().mockResolvedValue(undefined),
};

const mockEventEmitter = {
  emit: jest.fn(),
};

const mockUserModel = {
  findById: jest.fn(),
};

function setUserMock(user: Record<string, unknown> | null) {
  const leanResolved = jest.fn().mockResolvedValue(user);
  mockUserModel.findById.mockReturnValue({
    lean: leanResolved,
    select: jest.fn().mockReturnValue({ lean: leanResolved }),
  });
}

const mockConversationsService = {
  deleteByArtefactIds: jest.fn().mockResolvedValue(undefined),
};

const mockPdpGoalsService = {
  deleteByArtefactIds: jest.fn().mockResolvedValue(undefined),
};

const mockAnalysisRunsService = {
  deleteByArtefactIds: jest.fn().mockResolvedValue(undefined),
  findExecutingRun: jest.fn().mockResolvedValue(null),
};

function createService(): ArtefactsService {
  return new ArtefactsService(
    mockArtefactsRepo as any,
    mockConversationsRepo as any,
    mockPdpGoalsRepo as any,
    mockUserModel as any,
    mockTransactionService as any,
    mockVersionHistoryService as any,
    mockConversationsService as any,
    mockPdpGoalsService as any,
    mockAnalysisRunsService as any,
    mockEventEmitter as any,
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
    mockArtefactsRepo.markDeleted.mockResolvedValue(ok(1));
    mockConversationsRepo.findIdsByArtefactIds.mockResolvedValue(ok([]));
    mockConversationsService.deleteByArtefactIds.mockResolvedValue(undefined);
    mockPdpGoalsService.deleteByArtefactIds.mockResolvedValue(undefined);
    mockAnalysisRunsService.deleteByArtefactIds.mockResolvedValue(undefined);
    mockAnalysisRunsService.findExecutingRun.mockResolvedValue(null);
    mockVersionHistoryService.anonymizeByEntity.mockResolvedValue(undefined);
    mockVersionHistoryService.countVersions.mockResolvedValue(0);
    setUserMock({ role: UserRole.USER, specialty: 100, trainingStage: 'ST1' });
    service = createService();
  });

  // ─── deleteArtefact ───

  describe('deleteArtefact', () => {
    it('throws NotFoundException when artefact does not exist', async () => {
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(null));

      await expect(service.deleteArtefact(userIdStr, 'art_abc123')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ConflictException when IN_CONVERSATION artefact has an executing analysis run', async () => {
      const artefact = makeArtefactDoc({ status: ArtefactStatus.IN_CONVERSATION });
      const convId = oid();
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));
      mockConversationsRepo.findIdsByArtefactIds.mockResolvedValue(ok([convId]));
      mockAnalysisRunsService.findExecutingRun.mockResolvedValue({ _id: oid() });

      await expect(service.deleteArtefact(userIdStr, 'art_abc123')).rejects.toThrow(
        ConflictException,
      );
    });

    it('allows delete for IN_CONVERSATION artefact parked at an interrupt (no executing run)', async () => {
      // AWAITING_INPUT runs surface as null from findExecutingRun — deletable.
      const artefact = makeArtefactDoc({ status: ArtefactStatus.IN_CONVERSATION });
      const convId = oid();
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));
      mockConversationsRepo.findIdsByArtefactIds.mockResolvedValue(ok([convId]));
      mockAnalysisRunsService.findExecutingRun.mockResolvedValue(null);

      const result = await service.deleteArtefact(userIdStr, 'art_abc123');

      expect(result).toEqual({ message: 'Entry deleted successfully' });
      expect(mockAnalysisRunsService.findExecutingRun).toHaveBeenCalledWith(
        convId,
        expect.anything(),
      );
      expect(mockArtefactsRepo.markDeleted).toHaveBeenCalledWith(
        [artefact._id],
        expect.anything(),
      );
    });

    it('throws NotFoundException when artefact is already DELETED (filtered by repo)', async () => {
      // Repo filters DELETED rows by default; findByXid returns null.
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(null));

      await expect(service.deleteArtefact(userIdStr, 'art_abc123')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('cascades through all child services in a transaction', async () => {
      const artefact = makeArtefactDoc({ status: ArtefactStatus.COMPLETED });
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));

      const result = await service.deleteArtefact(userIdStr, 'art_abc123');

      expect(result).toEqual({ message: 'Entry deleted successfully' });
      expect(mockArtefactsRepo.markDeleted).toHaveBeenCalledWith(
        [artefact._id],
        expect.anything(),
      );
      expect(mockConversationsService.deleteByArtefactIds).toHaveBeenCalledWith(
        [artefact._id],
        expect.anything(),
      );
      expect(mockPdpGoalsService.deleteByArtefactIds).toHaveBeenCalledWith(
        [artefact._id],
        expect.anything(),
      );
      expect(mockAnalysisRunsService.deleteByArtefactIds).toHaveBeenCalledWith(
        [artefact._id],
        expect.anything(),
      );
      expect(mockVersionHistoryService.anonymizeByEntity).toHaveBeenCalledWith(
        'artefact',
        [artefact._id],
        expect.anything(),
      );
      expect(mockEventEmitter.emit).toHaveBeenCalled();
    });

    it('succeeds for ARCHIVED artefacts', async () => {
      const artefact = makeArtefactDoc({ status: ArtefactStatus.ARCHIVED });
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));

      const result = await service.deleteArtefact(userIdStr, 'art_abc123');

      expect(result).toEqual({ message: 'Entry deleted successfully' });
    });
  });

  // ─── getArtefact ───

  describe('getArtefact', () => {
    it('throws NotFoundException when artefact does not exist', async () => {
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(null));

      await expect(service.getArtefact(userIdStr, 'art_abc123')).rejects.toThrow(NotFoundException);
    });

    it('returns artefact with versionCount from version history service', async () => {
      const artefact = makeArtefactDoc();
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));
      setupBuildArtefactDtoMocks();
      mockVersionHistoryService.countVersions.mockResolvedValue(3);

      const result = await service.getArtefact(userIdStr, 'art_abc123');

      expect(mockVersionHistoryService.countVersions).toHaveBeenCalledWith(
        'artefact',
        artefact._id,
        userId,
      );
      expect(result.versionCount).toBe(3);
    });

    it('returns versionCount 0 when no versions exist', async () => {
      const artefact = makeArtefactDoc();
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));
      setupBuildArtefactDtoMocks();
      mockVersionHistoryService.countVersions.mockResolvedValue(0);

      const result = await service.getArtefact(userIdStr, 'art_abc123');

      expect(result.versionCount).toBe(0);
    });
  });

  // ─── finaliseArtefact ───

  describe('finaliseArtefact', () => {
    it('throws NotFoundException when artefact does not exist', async () => {
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(null));

      await expect(
        service.finaliseArtefact(userIdStr, 'art_abc123', { pdpGoalSelections: [] }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when artefact is not in IN_REVIEW status', async () => {
      mockArtefactsRepo.findByXid.mockResolvedValue(
        ok(makeArtefactDoc({ status: ArtefactStatus.COMPLETED })),
      );

      await expect(
        service.finaliseArtefact(userIdStr, 'art_abc123', { pdpGoalSelections: [] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('sets artefact status to COMPLETED', async () => {
      const artefact = makeArtefactDoc();
      const updatedArtefact = makeArtefactDoc({ status: ArtefactStatus.COMPLETED });
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));
      mockArtefactsRepo.updateArtefactById.mockResolvedValue(ok(updatedArtefact));
      setupBuildArtefactDtoMocks();

      await service.finaliseArtefact(userIdStr, 'art_abc123', { pdpGoalSelections: [] });

      expect(mockArtefactsRepo.updateArtefactById).toHaveBeenCalledWith(
        artefact._id,
        userId,
        { status: ArtefactStatus.COMPLETED, completedAt: expect.any(Date) },
        expect.anything(), // session
      );
    });

    it('activates selected goals with review date and per-action statuses', async () => {
      const artefact = makeArtefactDoc();
      const updatedArtefact = makeArtefactDoc({ status: ArtefactStatus.COMPLETED });
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
        userId, // ownership predicate threaded through to the repository
        { status: PdpGoalStatus.STARTED, reviewDate: new Date(reviewDate) },
        [
          { actionXid: 'act_1', status: PdpGoalStatus.STARTED },
          { actionXid: 'act_2', status: PdpGoalStatus.ARCHIVED },
        ],
        expect.anything(), // session
      );
    });

    it('archives unselected goals (cascades to all actions)', async () => {
      const artefact = makeArtefactDoc();
      const updatedArtefact = makeArtefactDoc({ status: ArtefactStatus.COMPLETED });
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
        userId, // ownership predicate threaded through to the repository
        { status: PdpGoalStatus.ARCHIVED },
        undefined, // no action updates → cascade
        expect.anything(), // session
      );
    });

    it('handles mixed selected and unselected goals', async () => {
      const artefact = makeArtefactDoc();
      const updatedArtefact = makeArtefactDoc({ status: ArtefactStatus.COMPLETED });
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
        userId,
        expect.objectContaining({ status: PdpGoalStatus.STARTED }),
        expect.any(Array),
        expect.anything(),
      );

      // Second call: archive goal_2
      expect(mockPdpGoalsRepo.updateGoal).toHaveBeenCalledWith(
        'goal_2',
        userId,
        { status: PdpGoalStatus.ARCHIVED },
        undefined,
        expect.anything(),
      );
    });

    it('rejects with NotFoundException when a selected goal is not owned by the caller (IDOR)', async () => {
      const artefact = makeArtefactDoc();
      const updatedArtefact = makeArtefactDoc({ status: ArtefactStatus.COMPLETED });
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));
      mockArtefactsRepo.updateArtefactById.mockResolvedValue(ok(updatedArtefact));
      // Repo scopes by userId → a goal belonging to another user yields NOT_FOUND.
      mockPdpGoalsRepo.updateGoal.mockResolvedValue(
        err({ code: 'NOT_FOUND', message: 'PDP goal not found' }),
      );
      setupBuildArtefactDtoMocks();

      await expect(
        service.finaliseArtefact(userIdStr, 'art_abc123', {
          pdpGoalSelections: [
            { goalId: 'victim_goal', selected: true, reviewDate: '2026-06-01T00:00:00.000Z' },
          ],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects with NotFoundException when an unselected goal is not owned by the caller (IDOR)', async () => {
      const artefact = makeArtefactDoc();
      const updatedArtefact = makeArtefactDoc({ status: ArtefactStatus.COMPLETED });
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));
      mockArtefactsRepo.updateArtefactById.mockResolvedValue(ok(updatedArtefact));
      mockPdpGoalsRepo.updateGoal.mockResolvedValue(
        err({ code: 'NOT_FOUND', message: 'PDP goal not found' }),
      );
      setupBuildArtefactDtoMocks();

      await expect(
        service.finaliseArtefact(userIdStr, 'art_abc123', {
          pdpGoalSelections: [{ goalId: 'victim_goal', selected: false }],
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateArtefactStatus (archive path) ───

  describe('updateArtefactStatus – archive', () => {
    it('archives PENDING PDP goals when archiving an artefact', async () => {
      const artefact = makeArtefactDoc({ status: ArtefactStatus.IN_REVIEW });
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
        { statuses: [PdpGoalStatus.NOT_STARTED] },
        { status: PdpGoalStatus.ARCHIVED },
        expect.anything(),
      );
    });

    it('does NOT archive ACTIVE/COMPLETED goals when archivePdpGoals is false', async () => {
      const artefact = makeArtefactDoc({ status: ArtefactStatus.IN_REVIEW });
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
        { statuses: [PdpGoalStatus.NOT_STARTED] },
        { status: PdpGoalStatus.ARCHIVED },
        expect.anything(),
      );
    });

    it('archives ACTIVE and COMPLETED goals when archivePdpGoals is true', async () => {
      const artefact = makeArtefactDoc({ status: ArtefactStatus.IN_REVIEW });
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
        { statuses: [PdpGoalStatus.NOT_STARTED] },
        { status: PdpGoalStatus.ARCHIVED },
        expect.anything(),
      );

      expect(mockPdpGoalsRepo.updateManyByArtefactId).toHaveBeenCalledWith(
        artefact._id,
        { statuses: [PdpGoalStatus.STARTED, PdpGoalStatus.COMPLETED] },
        { status: PdpGoalStatus.ARCHIVED },
        expect.anything(),
      );
    });

    it('performs simple status update for non-archive transitions', async () => {
      const artefact = makeArtefactDoc({ status: ArtefactStatus.IN_CONVERSATION });
      const updatedArtefact = makeArtefactDoc({ status: ArtefactStatus.IN_REVIEW });
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));
      mockArtefactsRepo.updateArtefactById.mockResolvedValue(ok(updatedArtefact));
      setupBuildArtefactDtoMocks();

      await service.updateArtefactStatus(userIdStr, 'art_abc123', {
        status: ArtefactStatus.IN_REVIEW,
      });

      // Status update inside transaction, no PDP goal changes
      expect(mockArtefactsRepo.updateArtefactById).toHaveBeenCalledWith(
        artefact._id,
        userId,
        { status: ArtefactStatus.IN_REVIEW },
        expect.anything(),
      );
      expect(mockPdpGoalsRepo.updateManyByArtefactId).not.toHaveBeenCalled();
    });

    it('returns the accurate versionCount even though a status change creates no version', async () => {
      const artefact = makeArtefactDoc({ status: ArtefactStatus.IN_CONVERSATION });
      const updatedArtefact = makeArtefactDoc({ status: ArtefactStatus.IN_REVIEW });
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));
      mockArtefactsRepo.updateArtefactById.mockResolvedValue(ok(updatedArtefact));
      setupBuildArtefactDtoMocks();
      // Artefact already has 2 versions from prior edits — buildArtefactDto must
      // surface that, not the old default of 0.
      mockVersionHistoryService.countVersions.mockResolvedValue(2);

      const result = await service.updateArtefactStatus(userIdStr, 'art_abc123', {
        status: ArtefactStatus.IN_REVIEW,
      });

      expect(result.versionCount).toBe(2);
    });
  });

  // ─── editArtefact ───

  describe('editArtefact', () => {
    it('throws NotFoundException when artefact does not exist', async () => {
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(null));

      await expect(
        service.editArtefact(userIdStr, 'art_abc123', { title: 'New Title' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when artefact is ARCHIVED', async () => {
      mockArtefactsRepo.findByXid.mockResolvedValue(
        ok(makeArtefactDoc({ status: ArtefactStatus.ARCHIVED })),
      );

      await expect(
        service.editArtefact(userIdStr, 'art_abc123', { title: 'New Title' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when artefact is IN_CONVERSATION', async () => {
      mockArtefactsRepo.findByXid.mockResolvedValue(
        ok(makeArtefactDoc({ status: ArtefactStatus.IN_CONVERSATION })),
      );

      await expect(
        service.editArtefact(userIdStr, 'art_abc123', { title: 'New Title' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows editing when artefact is IN_REVIEW', async () => {
      const artefact = makeArtefactDoc({ status: ArtefactStatus.IN_REVIEW });
      const updatedArtefact = makeArtefactDoc({ title: 'New Title' });
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));
      mockArtefactsRepo.updateArtefactById.mockResolvedValue(ok(updatedArtefact));
      mockVersionHistoryService.createVersion.mockResolvedValue(undefined);
      mockVersionHistoryService.countVersions.mockResolvedValue(1);
      setupBuildArtefactDtoMocks();

      await service.editArtefact(userIdStr, 'art_abc123', { title: 'New Title' });

      expect(mockArtefactsRepo.updateArtefactById).toHaveBeenCalledWith(
        artefact._id,
        userId,
        { title: 'New Title' },
        expect.anything(), // session
      );
    });

    it('throws BadRequestException when artefact is COMPLETED', async () => {
      mockArtefactsRepo.findByXid.mockResolvedValue(
        ok(makeArtefactDoc({ status: ArtefactStatus.COMPLETED })),
      );

      await expect(
        service.editArtefact(userIdStr, 'art_abc123', { title: 'Edited' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when no editable fields provided', async () => {
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(makeArtefactDoc()));

      await expect(
        service.editArtefact(userIdStr, 'art_abc123', {} as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a version snapshot before applying edits', async () => {
      const artefact = makeArtefactDoc({
        title: 'Old Title',
        composedDocument: [{ sectionId: 's1', label: 'S1', text: 'T1' }],
      });
      const updatedArtefact = makeArtefactDoc({ title: 'New Title' });
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));
      mockArtefactsRepo.updateArtefactById.mockResolvedValue(ok(updatedArtefact));
      mockVersionHistoryService.createVersion.mockResolvedValue(undefined);
      mockVersionHistoryService.countVersions.mockResolvedValue(1);
      setupBuildArtefactDtoMocks();

      await service.editArtefact(userIdStr, 'art_abc123', { title: 'New Title' });

      // Verify createVersion was called with current state BEFORE update
      expect(mockVersionHistoryService.createVersion).toHaveBeenCalledWith(
        'artefact',
        artefact._id,
        expect.any(Types.ObjectId),
        {
          title: 'Old Title',
          composedDocument: [{ sectionId: 's1', label: 'S1', text: 'T1' }],
          capabilities: null,
        },
        expect.anything(), // session
      );

      // Verify createVersion was called before updateArtefactById
      const createVersionOrder = mockVersionHistoryService.createVersion.mock.invocationCallOrder[0];
      const updateOrder = mockArtefactsRepo.updateArtefactById.mock.invocationCallOrder[0];
      expect(createVersionOrder).toBeLessThan(updateOrder);
    });

    it('updates only the provided fields', async () => {
      const artefact = makeArtefactDoc();
      const updatedArtefact = makeArtefactDoc({ title: 'New Title' });
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));
      mockArtefactsRepo.updateArtefactById.mockResolvedValue(ok(updatedArtefact));
      mockVersionHistoryService.createVersion.mockResolvedValue(undefined);
      mockVersionHistoryService.countVersions.mockResolvedValue(1);
      setupBuildArtefactDtoMocks();

      // Only title, no reflection
      await service.editArtefact(userIdStr, 'art_abc123', { title: 'New Title' });

      expect(mockArtefactsRepo.updateArtefactById).toHaveBeenCalledWith(
        artefact._id,
        userId,
        { title: 'New Title' },
        expect.anything(),
      );
    });

    it('can edit a section without title (merges text by sectionId)', async () => {
      const artefact = makeArtefactDoc({
        composedDocument: [{ sectionId: 'brief_description', label: 'Brief Description', text: 'Old' }],
      });
      const updatedArtefact = makeArtefactDoc();
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));
      mockArtefactsRepo.updateArtefactById.mockResolvedValue(ok(updatedArtefact));
      mockVersionHistoryService.createVersion.mockResolvedValue(undefined);
      mockVersionHistoryService.countVersions.mockResolvedValue(1);
      setupBuildArtefactDtoMocks();

      await service.editArtefact(userIdStr, 'art_abc123', {
        composedDocument: [{ sectionId: 'brief_description', text: 'New Text' }],
      });

      expect(mockArtefactsRepo.updateArtefactById).toHaveBeenCalledWith(
        artefact._id,
        userId,
        {
          composedDocument: [
            { sectionId: 'brief_description', label: 'Brief Description', text: 'New Text' },
          ],
        },
        expect.anything(),
      );
    });

    it('edits a capability justification by code, keeping code and evidence server-owned', async () => {
      const artefact = makeArtefactDoc({
        capabilities: [
          { code: 'C-01', evidence: 'I reflected on my limits', justification: 'old just' },
          { code: 'C-04', evidence: 'I calculated CRB-65', justification: 'old data just' },
        ],
      });
      const updatedArtefact = makeArtefactDoc();
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));
      mockArtefactsRepo.updateArtefactById.mockResolvedValue(ok(updatedArtefact));
      mockVersionHistoryService.createVersion.mockResolvedValue(undefined);
      mockVersionHistoryService.countVersions.mockResolvedValue(1);
      setupBuildArtefactDtoMocks();

      await service.editArtefact(userIdStr, 'art_abc123', {
        capabilities: [{ code: 'C-04', justification: 'my new justification' }],
      });

      expect(mockArtefactsRepo.updateArtefactById).toHaveBeenCalledWith(
        artefact._id,
        userId,
        {
          capabilities: [
            { code: 'C-01', evidence: 'I reflected on my limits', justification: 'old just' },
            { code: 'C-04', evidence: 'I calculated CRB-65', justification: 'my new justification' },
          ],
        },
        expect.anything(),
      );
    });

    it('ignores capability edits targeting an unknown code', async () => {
      const artefact = makeArtefactDoc({
        capabilities: [{ code: 'C-01', evidence: 'e1', justification: 'j1' }],
      });
      const updatedArtefact = makeArtefactDoc();
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));
      mockArtefactsRepo.updateArtefactById.mockResolvedValue(ok(updatedArtefact));
      mockVersionHistoryService.createVersion.mockResolvedValue(undefined);
      mockVersionHistoryService.countVersions.mockResolvedValue(1);
      setupBuildArtefactDtoMocks();

      await service.editArtefact(userIdStr, 'art_abc123', {
        capabilities: [{ code: 'C-99', justification: 'should be ignored' }],
      });

      expect(mockArtefactsRepo.updateArtefactById).toHaveBeenCalledWith(
        artefact._id,
        userId,
        { capabilities: [{ code: 'C-01', evidence: 'e1', justification: 'j1' }] },
        expect.anything(),
      );
    });

    it('snapshots capabilities before applying a capability edit', async () => {
      const artefact = makeArtefactDoc({
        title: 'T',
        capabilities: [{ code: 'C-01', evidence: 'e1', justification: 'j1' }],
      });
      const updatedArtefact = makeArtefactDoc();
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));
      mockArtefactsRepo.updateArtefactById.mockResolvedValue(ok(updatedArtefact));
      mockVersionHistoryService.createVersion.mockResolvedValue(undefined);
      mockVersionHistoryService.countVersions.mockResolvedValue(1);
      setupBuildArtefactDtoMocks();

      await service.editArtefact(userIdStr, 'art_abc123', {
        capabilities: [{ code: 'C-01', justification: 'new' }],
      });

      expect(mockVersionHistoryService.createVersion).toHaveBeenCalledWith(
        'artefact',
        artefact._id,
        expect.any(Types.ObjectId),
        {
          title: 'T',
          composedDocument: null,
          capabilities: [{ code: 'C-01', evidence: 'e1', justification: 'j1' }],
        },
        expect.anything(),
      );
    });
  });

  // ─── restoreVersion ───

  describe('restoreVersion', () => {
    it('throws NotFoundException when artefact does not exist', async () => {
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(null));

      await expect(
        service.restoreVersion(userIdStr, 'art_abc123', { version: 1 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when artefact is ARCHIVED', async () => {
      mockArtefactsRepo.findByXid.mockResolvedValue(
        ok(makeArtefactDoc({ status: ArtefactStatus.ARCHIVED })),
      );

      await expect(
        service.restoreVersion(userIdStr, 'art_abc123', { version: 1 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when artefact is IN_CONVERSATION', async () => {
      mockArtefactsRepo.findByXid.mockResolvedValue(
        ok(makeArtefactDoc({ status: ArtefactStatus.IN_CONVERSATION })),
      );

      await expect(
        service.restoreVersion(userIdStr, 'art_abc123', { version: 1 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when target version does not exist', async () => {
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(makeArtefactDoc()));
      mockVersionHistoryService.getVersion.mockResolvedValue(null);

      await expect(
        service.restoreVersion(userIdStr, 'art_abc123', { version: 999 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('snapshots current state before restoring', async () => {
      const artefact = makeArtefactDoc({
        title: 'Current Title',
        composedDocument: [{ sectionId: 's1', label: 'Current', text: 'Content' }],
      });
      const targetVersion = {
        version: 1,
        snapshot: {
          title: 'Old Title',
          composedDocument: [{ sectionId: 's1', label: 'Old', text: 'Content' }],
        },
      };
      const updatedArtefact = makeArtefactDoc({ title: 'Old Title' });

      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));
      mockVersionHistoryService.getVersion.mockResolvedValue(targetVersion);
      mockVersionHistoryService.createVersion.mockResolvedValue(undefined);
      mockVersionHistoryService.countVersions.mockResolvedValue(2);
      mockArtefactsRepo.updateArtefactById.mockResolvedValue(ok(updatedArtefact));
      setupBuildArtefactDtoMocks();

      await service.restoreVersion(userIdStr, 'art_abc123', { version: 1 });

      // Verify snapshot of CURRENT state was created
      expect(mockVersionHistoryService.createVersion).toHaveBeenCalledWith(
        'artefact',
        artefact._id,
        expect.any(Types.ObjectId),
        {
          title: 'Current Title',
          composedDocument: [{ sectionId: 's1', label: 'Current', text: 'Content' }],
          capabilities: null,
        },
        expect.anything(), // session
      );
    });

    it('applies target version snapshot fields to artefact', async () => {
      const artefact = makeArtefactDoc();
      const targetVersion = {
        version: 1,
        snapshot: {
          title: 'Restored Title',
          composedDocument: [{ sectionId: 's1', label: 'Restored', text: 'Body' }],
        },
      };
      const updatedArtefact = makeArtefactDoc({ title: 'Restored Title' });

      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));
      mockVersionHistoryService.getVersion.mockResolvedValue(targetVersion);
      mockVersionHistoryService.createVersion.mockResolvedValue(undefined);
      mockVersionHistoryService.countVersions.mockResolvedValue(2);
      mockArtefactsRepo.updateArtefactById.mockResolvedValue(ok(updatedArtefact));
      setupBuildArtefactDtoMocks();

      await service.restoreVersion(userIdStr, 'art_abc123', { version: 1 });

      expect(mockArtefactsRepo.updateArtefactById).toHaveBeenCalledWith(
        artefact._id,
        userId,
        {
          title: 'Restored Title',
          composedDocument: [{ sectionId: 's1', label: 'Restored', text: 'Body' }],
        },
        expect.anything(), // session
      );
    });

    it('restores capabilities from the target version snapshot', async () => {
      const artefact = makeArtefactDoc({
        capabilities: [{ code: 'C-01', evidence: 'e1', justification: 'edited' }],
      });
      const targetVersion = {
        version: 1,
        snapshot: {
          title: 'Restored Title',
          capabilities: [{ code: 'C-01', evidence: 'e1', justification: 'original' }],
        },
      };
      const updatedArtefact = makeArtefactDoc({ title: 'Restored Title' });

      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));
      mockVersionHistoryService.getVersion.mockResolvedValue(targetVersion);
      mockVersionHistoryService.createVersion.mockResolvedValue(undefined);
      mockVersionHistoryService.countVersions.mockResolvedValue(2);
      mockArtefactsRepo.updateArtefactById.mockResolvedValue(ok(updatedArtefact));
      setupBuildArtefactDtoMocks();

      await service.restoreVersion(userIdStr, 'art_abc123', { version: 1 });

      expect(mockArtefactsRepo.updateArtefactById).toHaveBeenCalledWith(
        artefact._id,
        userId,
        {
          title: 'Restored Title',
          capabilities: [{ code: 'C-01', evidence: 'e1', justification: 'original' }],
        },
        expect.anything(),
      );
    });

    it('leaves capabilities untouched when restoring a pre-capability-versioning snapshot', async () => {
      const artefact = makeArtefactDoc({
        capabilities: [{ code: 'C-01', evidence: 'e1', justification: 'current' }],
      });
      // Old snapshot has no `capabilities` key — restore must not wipe them.
      const targetVersion = {
        version: 1,
        snapshot: { title: 'Old Title', composedDocument: null },
      };
      const updatedArtefact = makeArtefactDoc({ title: 'Old Title' });

      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));
      mockVersionHistoryService.getVersion.mockResolvedValue(targetVersion);
      mockVersionHistoryService.createVersion.mockResolvedValue(undefined);
      mockVersionHistoryService.countVersions.mockResolvedValue(2);
      mockArtefactsRepo.updateArtefactById.mockResolvedValue(ok(updatedArtefact));
      setupBuildArtefactDtoMocks();

      await service.restoreVersion(userIdStr, 'art_abc123', { version: 1 });

      expect(mockArtefactsRepo.updateArtefactById).toHaveBeenCalledWith(
        artefact._id,
        userId,
        { title: 'Old Title', composedDocument: null },
        expect.anything(),
      );
    });

    it('creates snapshot before applying restore (non-destructive)', async () => {
      const artefact = makeArtefactDoc();
      const targetVersion = {
        version: 1,
        snapshot: { title: 'Old' },
      };
      const updatedArtefact = makeArtefactDoc({ title: 'Old' });

      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));
      mockVersionHistoryService.getVersion.mockResolvedValue(targetVersion);
      mockVersionHistoryService.createVersion.mockResolvedValue(undefined);
      mockVersionHistoryService.countVersions.mockResolvedValue(2);
      mockArtefactsRepo.updateArtefactById.mockResolvedValue(ok(updatedArtefact));
      setupBuildArtefactDtoMocks();

      await service.restoreVersion(userIdStr, 'art_abc123', { version: 1 });

      // createVersion called before updateArtefactById
      const snapshotOrder = mockVersionHistoryService.createVersion.mock.invocationCallOrder[0];
      const updateOrder = mockArtefactsRepo.updateArtefactById.mock.invocationCallOrder[0];
      expect(snapshotOrder).toBeLessThan(updateOrder);
    });
  });

  // ─── getVersionHistory ───

  describe('getVersionHistory', () => {
    // Derive expected names from the registry so the assertion tracks the config,
    // not a hardcoded descriptor string.
    const gpCapabilities = getSpecialtyConfig(Specialty.GP).capabilities;
    const knownCap = gpCapabilities[0];

    it('projects snapshot capabilities to { code, name, justification } with name enriched and evidence dropped', async () => {
      const artefact = makeArtefactDoc({ specialty: Specialty.GP });
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));
      mockVersionHistoryService.getVersions.mockResolvedValue([
        {
          version: 2,
          timestamp: new Date('2026-06-16T10:00:00.000Z'),
          snapshot: {
            title: 'T',
            composedDocument: null,
            capabilities: [
              {
                code: knownCap.code,
                evidence: 'verbatim quote that must never surface',
                justification: 'my justification',
              },
            ],
          },
        },
      ]);

      const result = await service.getVersionHistory(userIdStr, 'art_abc123');

      const cap = result.versions[0].capabilities![0];
      expect(cap).toEqual({
        code: knownCap.code,
        name: knownCap.name,
        justification: 'my justification',
      });
      // The evidence quote is intentionally hidden provenance — it must not leak.
      expect(cap).not.toHaveProperty('evidence');
    });

    it('falls back to the code when it is not in the registry, and to empty string for missing justification', async () => {
      const artefact = makeArtefactDoc({ specialty: Specialty.GP });
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));
      mockVersionHistoryService.getVersions.mockResolvedValue([
        {
          version: 1,
          timestamp: new Date('2026-06-16T10:00:00.000Z'),
          snapshot: {
            capabilities: [{ code: 'Z-99', evidence: 'e' }],
          },
        },
      ]);

      const result = await service.getVersionHistory(userIdStr, 'art_abc123');

      expect(result.versions[0].capabilities![0]).toEqual({
        code: 'Z-99',
        name: 'Z-99',
        justification: '',
      });
    });

    it('projects capabilities to null when the snapshot has none (pre-feature versions)', async () => {
      const artefact = makeArtefactDoc({ specialty: Specialty.GP });
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));
      mockVersionHistoryService.getVersions.mockResolvedValue([
        {
          version: 1,
          timestamp: new Date('2026-06-16T10:00:00.000Z'),
          snapshot: { title: 'Old', composedDocument: null },
        },
      ]);

      const result = await service.getVersionHistory(userIdStr, 'art_abc123');

      expect(result.versions[0].capabilities).toBeNull();
    });
  });

  // ─── Guest artefact limit ───

  describe('guest artefact limit', () => {
    const dto = { artefactId: 'client_abc12345' };

    function mockCreatePathSuccess() {
      mockArtefactsRepo.upsertArtefact.mockResolvedValue(ok(makeArtefactDoc()));
      mockConversationsRepo.findActiveConversationByArtefact.mockResolvedValue(ok(null));
      mockConversationsRepo.createConversation.mockResolvedValue(ok(makeConversationDoc()));
    }

    it('allows guest under the artefact limit to create', async () => {
      setUserMock({ role: UserRole.USER_GUEST, specialty: 100, trainingStage: 'ST1' });
      mockArtefactsRepo.countByUser.mockResolvedValue(ok(GUEST_ARTEFACT_LIMIT - 1));
      mockCreatePathSuccess();

      await expect(service.createArtefact(userIdStr, dto)).resolves.toBeDefined();
      expect(mockArtefactsRepo.upsertArtefact).toHaveBeenCalled();
    });

    it('blocks guest at the limit with structured ForbiddenException', async () => {
      setUserMock({ role: UserRole.USER_GUEST, specialty: 100, trainingStage: 'ST1' });
      mockArtefactsRepo.countByUser.mockResolvedValue(ok(GUEST_ARTEFACT_LIMIT));

      const promise = service.createArtefact(userIdStr, dto);
      await expect(promise).rejects.toThrow(ForbiddenException);
      await expect(promise).rejects.toMatchObject({
        response: {
          code: QuotaErrorCode.GUEST_ARTEFACT_LIMIT_REACHED,
          limit: GUEST_ARTEFACT_LIMIT,
        },
      });
      expect(mockArtefactsRepo.upsertArtefact).not.toHaveBeenCalled();
    });

    it('counts deleted artefacts toward the limit (no status filter)', async () => {
      setUserMock({ role: UserRole.USER_GUEST, specialty: 100, trainingStage: 'ST1' });
      mockArtefactsRepo.countByUser.mockResolvedValue(ok(GUEST_ARTEFACT_LIMIT));

      await expect(service.createArtefact(userIdStr, dto)).rejects.toThrow(ForbiddenException);
      expect(mockArtefactsRepo.countByUser).toHaveBeenCalledWith(
        userIdStr,
        undefined,
        expect.anything(),
      );
    });

    it('does not enforce the limit for non-guest users', async () => {
      setUserMock({ role: UserRole.USER, specialty: 100, trainingStage: 'ST1' });
      mockCreatePathSuccess();

      await expect(service.createArtefact(userIdStr, dto)).resolves.toBeDefined();
      expect(mockArtefactsRepo.countByUser).not.toHaveBeenCalled();
    });

    it('blocks duplicateToReview when guest is at the limit', async () => {
      mockArtefactsRepo.countByUser.mockResolvedValue(ok(GUEST_ARTEFACT_LIMIT));

      await expect(
        service.duplicateToReview(userIdStr, UserRole.USER_GUEST, 'art_abc123'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockArtefactsRepo.upsertArtefact).not.toHaveBeenCalled();
    });
  });

  // ─── upsertReview ───

  describe('upsertReview', () => {
    it('maps repo NOT_FOUND (missing or not owned) to NotFoundException', async () => {
      mockArtefactsRepo.upsertReview.mockResolvedValue(
        err({ code: 'NOT_FOUND', message: 'Artefact not found' }),
      );

      await expect(
        service.upsertReview(userIdStr, 'art_abc123', { rating: 5 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('upserts keyed by xid, normalising a missing comment to null', async () => {
      const updated = makeArtefactDoc({
        review: { rating: 4, comment: null, updatedAt: new Date() },
      });
      mockArtefactsRepo.upsertReview.mockResolvedValue(ok(updated));
      mockVersionHistoryService.countVersions.mockResolvedValue(0);
      setupBuildArtefactDtoMocks();

      const result = await service.upsertReview(userIdStr, 'art_abc123', { rating: 4 });

      expect(mockArtefactsRepo.upsertReview).toHaveBeenCalledWith('art_abc123', userId, {
        rating: 4,
        comment: null,
      });
      // No prior read — the single atomic upsert is the only repo call.
      expect(mockArtefactsRepo.findByXid).not.toHaveBeenCalled();
      expect(result.review).toEqual({
        rating: 4,
        comment: null,
        updatedAt: expect.any(String),
      });
    });

    it('passes through a provided comment', async () => {
      mockArtefactsRepo.upsertReview.mockResolvedValue(
        ok(makeArtefactDoc({ review: { rating: 3, comment: 'Helpful', updatedAt: new Date() } })),
      );
      setupBuildArtefactDtoMocks();

      await service.upsertReview(userIdStr, 'art_abc123', { rating: 3, comment: 'Helpful' });

      expect(mockArtefactsRepo.upsertReview).toHaveBeenCalledWith('art_abc123', userId, {
        rating: 3,
        comment: 'Helpful',
      });
    });

    it('surfaces a non-NOT_FOUND repo error as InternalServerErrorException', async () => {
      mockArtefactsRepo.upsertReview.mockResolvedValue(
        err({ code: 'DB_ERROR', message: 'boom' }),
      );

      await expect(
        service.upsertReview(userIdStr, 'art_abc123', { rating: 2 }),
      ).rejects.toThrow('boom');
    });
  });

  // ─── replaceNotes ───

  describe('replaceNotes', () => {
    it('throws NotFoundException when artefact does not exist', async () => {
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(null));

      await expect(
        service.replaceNotes(userIdStr, 'art_abc123', { notes: [] }),
      ).rejects.toThrow(NotFoundException);
      expect(mockArtefactsRepo.replaceNotes).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the artefact is ARCHIVED', async () => {
      mockArtefactsRepo.findByXid.mockResolvedValue(
        ok(makeArtefactDoc({ status: ArtefactStatus.ARCHIVED })),
      );

      await expect(
        service.replaceNotes(userIdStr, 'art_abc123', { notes: [{ text: 'nope' }] }),
      ).rejects.toThrow(BadRequestException);
      expect(mockArtefactsRepo.replaceNotes).not.toHaveBeenCalled();
    });

    it.each([
      ArtefactStatus.IN_CONVERSATION,
      ArtefactStatus.IN_REVIEW,
      ArtefactStatus.COMPLETED,
    ])('allows replacing notes in %s status', async (status) => {
      const artefact = makeArtefactDoc({ status, notes: [] });
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));
      mockArtefactsRepo.replaceNotes.mockResolvedValue(ok(artefact));
      setupBuildArtefactDtoMocks();

      await service.replaceNotes(userIdStr, 'art_abc123', { notes: [{ text: 'a note' }] });

      expect(mockArtefactsRepo.replaceNotes).toHaveBeenCalledTimes(1);
    });

    it('reconciles new + existing notes and writes the full array scoped by userId', async () => {
      const existingNote = {
        xid: 'note_existing',
        text: 'original',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      };
      const artefact = makeArtefactDoc({
        status: ArtefactStatus.COMPLETED,
        notes: [existingNote],
      });
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));
      mockArtefactsRepo.replaceNotes.mockResolvedValue(ok(artefact));
      setupBuildArtefactDtoMocks();

      await service.replaceNotes(userIdStr, 'art_abc123', {
        notes: [
          { xid: 'note_existing', text: 'edited' }, // existing -> keep createdAt
          { text: 'a brand new note' }, // new -> mint xid + timestamps
        ],
      });

      const [calledXid, calledUserId, calledNotes] = mockArtefactsRepo.replaceNotes.mock.calls[0];
      expect(calledXid).toBe('art_abc123');
      // Repo interface takes the domain string (no Mongo types leak); it converts internally.
      expect(calledUserId).toBe(userIdStr); // ownership predicate threaded to the repo
      expect(calledNotes).toHaveLength(2);
      // Existing note keeps its xid and createdAt; updatedAt bumped on text change.
      expect(calledNotes[0]).toMatchObject({ xid: 'note_existing', text: 'edited' });
      expect(calledNotes[0].createdAt).toEqual(existingNote.createdAt);
      expect(calledNotes[0].updatedAt).not.toEqual(existingNote.updatedAt);
      // New note gets a fresh server-minted xid.
      expect(calledNotes[1].text).toBe('a brand new note');
      expect(calledNotes[1].xid).toHaveLength(21);
    });

    it('maps repo NOT_FOUND (missing or not owned) to NotFoundException', async () => {
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(makeArtefactDoc({ notes: [] })));
      mockArtefactsRepo.replaceNotes.mockResolvedValue(
        err({ code: 'NOT_FOUND', message: 'Artefact not found' }),
      );

      await expect(
        service.replaceNotes(userIdStr, 'art_abc123', { notes: [{ text: 'x' }] }),
      ).rejects.toThrow(NotFoundException);
    });

    it('does not create a version snapshot (notes are not versioned)', async () => {
      const artefact = makeArtefactDoc({ status: ArtefactStatus.IN_REVIEW, notes: [] });
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));
      mockArtefactsRepo.replaceNotes.mockResolvedValue(ok(artefact));
      setupBuildArtefactDtoMocks();

      await service.replaceNotes(userIdStr, 'art_abc123', { notes: [{ text: 'a note' }] });

      expect(mockVersionHistoryService.createVersion).not.toHaveBeenCalled();
    });
  });
});
