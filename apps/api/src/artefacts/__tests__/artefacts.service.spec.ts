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
    status: ArtefactStatus.IN_REVIEW,
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
  listArtefacts: jest.fn(),
  countByUser: jest.fn(),
  anonymizeArtefact: jest.fn(),
};

const mockConversationsRepo = {
  findActiveConversationByArtefact: jest.fn(),
  findActiveConversationsByArtefacts: jest.fn(),
  createConversation: jest.fn(),
  findConversationIdsByArtefact: jest.fn(),
  findMessageIdsByConversation: jest.fn(),
  anonymizeConversation: jest.fn(),
};

const mockPdpGoalsRepo = {
  findByArtefactId: jest.fn(),
  findByArtefactIds: jest.fn(),
  create: jest.fn(),
  updateGoal: jest.fn(),
  updateManyByArtefactId: jest.fn(),
  findByUserId: jest.fn(),
  countByUserId: jest.fn(),
  anonymizeByArtefactId: jest.fn(),
};

const mockMediaRepo = {
  markDeletedByMessageIds: jest.fn(),
};

const mockAnalysisRunsRepo = {
  anonymizeByConversationIds: jest.fn(),
};

const mockOutboxRepo = {
  cancelByConversationId: jest.fn(),
};

const mockTransactionService = {
  withTransaction: jest.fn((fn: (session: any) => Promise<any>) => fn({})),
};

const mockVersionHistoryService = {
  createVersion: jest.fn(),
  getVersions: jest.fn(),
  getVersion: jest.fn(),
  countVersions: jest.fn().mockResolvedValue(0),
};

const mockEventEmitter = {
  emit: jest.fn(),
};

const mockUserModel = {
  findById: jest.fn().mockReturnValue({
    lean: jest.fn().mockResolvedValue({ specialty: 100, trainingStage: 'ST1' }),
  }),
};

function createService(): ArtefactsService {
  return new ArtefactsService(
    mockArtefactsRepo as any,
    mockConversationsRepo as any,
    mockPdpGoalsRepo as any,
    mockMediaRepo as any,
    mockAnalysisRunsRepo as any,
    mockOutboxRepo as any,
    mockUserModel as any,
    mockTransactionService as any,
    mockVersionHistoryService as any,
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

    it('throws BadRequestException when artefact is IN_CONVERSATION', async () => {
      mockArtefactsRepo.findByXid.mockResolvedValue(
        ok(makeArtefactDoc({ status: ArtefactStatus.IN_CONVERSATION })),
      );

      await expect(service.deleteArtefact(userIdStr, 'art_abc123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException when artefact is already DELETED', async () => {
      mockArtefactsRepo.findByXid.mockResolvedValue(
        ok(makeArtefactDoc({ status: ArtefactStatus.DELETED })),
      );

      await expect(service.deleteArtefact(userIdStr, 'art_abc123')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('anonymizes artefact, conversations, goals, and media in transaction', async () => {
      const convId = oid();
      const msgId = oid();
      const artefact = makeArtefactDoc({ status: ArtefactStatus.COMPLETED });

      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));
      mockConversationsRepo.findConversationIdsByArtefact = jest
        .fn()
        .mockResolvedValue(ok([convId]));
      mockConversationsRepo.findMessageIdsByConversation = jest
        .fn()
        .mockResolvedValue(ok([msgId]));
      mockOutboxRepo.cancelByConversationId.mockResolvedValue(ok(1));
      mockMediaRepo.markDeletedByMessageIds.mockResolvedValue(ok(1));
      mockConversationsRepo.anonymizeConversation = jest.fn().mockResolvedValue(ok(2));
      mockArtefactsRepo.anonymizeArtefact = jest.fn().mockResolvedValue(ok(undefined));
      mockPdpGoalsRepo.anonymizeByArtefactId = jest.fn().mockResolvedValue(ok(1));
      mockAnalysisRunsRepo.anonymizeByConversationIds.mockResolvedValue(ok(1));

      const result = await service.deleteArtefact(userIdStr, 'art_abc123');

      expect(result).toEqual({ message: 'Entry deleted successfully' });
      expect(mockOutboxRepo.cancelByConversationId).toHaveBeenCalledWith(
        convId.toString(),
        expect.anything(),
      );
      expect(mockMediaRepo.markDeletedByMessageIds).toHaveBeenCalledWith(
        [msgId],
        expect.anything(),
      );
      expect(mockConversationsRepo.anonymizeConversation).toHaveBeenCalledWith(
        convId,
        expect.anything(),
      );
      expect(mockArtefactsRepo.anonymizeArtefact).toHaveBeenCalledWith(
        artefact._id,
        expect.anything(),
      );
      expect(mockPdpGoalsRepo.anonymizeByArtefactId).toHaveBeenCalledWith(
        artefact._id,
        expect.anything(),
      );
      expect(mockAnalysisRunsRepo.anonymizeByConversationIds).toHaveBeenCalledWith([convId]);
      expect(mockEventEmitter.emit).toHaveBeenCalled();
    });

    it('succeeds for ARCHIVED artefacts', async () => {
      const artefact = makeArtefactDoc({ status: ArtefactStatus.ARCHIVED });
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));
      mockConversationsRepo.findConversationIdsByArtefact = jest
        .fn()
        .mockResolvedValue(ok([]));
      mockArtefactsRepo.anonymizeArtefact = jest.fn().mockResolvedValue(ok(undefined));
      mockPdpGoalsRepo.anonymizeByArtefactId = jest.fn().mockResolvedValue(ok(0));

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
        expect.objectContaining({ status: PdpGoalStatus.STARTED }),
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
        { status: ArtefactStatus.IN_REVIEW },
        expect.anything(),
      );
      expect(mockPdpGoalsRepo.updateManyByArtefactId).not.toHaveBeenCalled();
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
        reflection: [{ title: 'S1', text: 'T1' }],
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
        { title: 'Old Title', reflection: [{ title: 'S1', text: 'T1' }] },
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
        { title: 'New Title' },
        expect.anything(),
      );
    });

    it('can edit reflection without title', async () => {
      const artefact = makeArtefactDoc();
      const reflection = [{ title: 'New Section', text: 'New Text' }];
      const updatedArtefact = makeArtefactDoc({ reflection });
      mockArtefactsRepo.findByXid.mockResolvedValue(ok(artefact));
      mockArtefactsRepo.updateArtefactById.mockResolvedValue(ok(updatedArtefact));
      mockVersionHistoryService.createVersion.mockResolvedValue(undefined);
      mockVersionHistoryService.countVersions.mockResolvedValue(1);
      setupBuildArtefactDtoMocks();

      await service.editArtefact(userIdStr, 'art_abc123', { reflection });

      expect(mockArtefactsRepo.updateArtefactById).toHaveBeenCalledWith(
        artefact._id,
        { reflection },
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
        reflection: [{ title: 'Current', text: 'Content' }],
      });
      const targetVersion = {
        version: 1,
        snapshot: { title: 'Old Title', reflection: [{ title: 'Old', text: 'Content' }] },
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
        { title: 'Current Title', reflection: [{ title: 'Current', text: 'Content' }] },
        expect.anything(), // session
      );
    });

    it('applies target version snapshot fields to artefact', async () => {
      const artefact = makeArtefactDoc();
      const targetVersion = {
        version: 1,
        snapshot: {
          title: 'Restored Title',
          reflection: [{ title: 'Restored', text: 'Body' }],
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
        {
          title: 'Restored Title',
          reflection: [{ title: 'Restored', text: 'Body' }],
        },
        expect.anything(), // session
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
});
