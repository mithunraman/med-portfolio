import { ArtefactStatus, ConversationStatus } from '@acme/shared';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ok } from '../../common/utils/result.util';
import { ConversationsService } from '../conversations.service';

const oid = () => new Types.ObjectId();
const userId = oid();
const userIdStr = userId.toString();
const conversationOid = oid();
const artefactOid = oid();

function makeConversation(overrides: Record<string, unknown> = {}) {
  return {
    _id: conversationOid,
    xid: 'conv_abc',
    userId,
    artefact: artefactOid,
    title: 'Test Conversation',
    status: ConversationStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeArtefact(overrides: Record<string, unknown> = {}) {
  return {
    _id: artefactOid,
    xid: 'art_abc',
    userId,
    status: ArtefactStatus.IN_CONVERSATION,
    title: 'Test Entry',
    ...overrides,
  };
}

const mockConversationsRepo = {
  findConversationByXid: jest.fn(),
  findMessageIdsByConversation: jest.fn(),
  anonymizeConversation: jest.fn(),
};

const mockArtefactsRepo = {
  findById: jest.fn(),
  anonymizeArtefact: jest.fn(),
};

const mockMediaRepo = {
  markDeletedByMessageIds: jest.fn(),
};

const mockPdpGoalsRepo = {
  anonymizeByArtefactId: jest.fn(),
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

// Unused deps — ConversationsService requires them but deleteConversation doesn't use them
const noopService = {} as any;

function createService(): ConversationsService {
  return new ConversationsService(
    mockConversationsRepo as any,
    mockArtefactsRepo as any,
    mockMediaRepo as any,
    mockPdpGoalsRepo as any,
    mockAnalysisRunsRepo as any,
    mockOutboxRepo as any,
    noopService, // mediaService
    mockTransactionService as any,
    noopService, // portfolioGraphService
    noopService, // analysisRunsService
    noopService, // outboxService
    noopService, // contextService
  );
}

describe('ConversationsService.deleteConversation', () => {
  let service: ConversationsService;

  beforeEach(() => {
    jest.resetAllMocks();
    mockTransactionService.withTransaction.mockImplementation(
      (fn: (session: any) => Promise<any>) => fn({}),
    );
    service = createService();
  });

  it('throws NotFoundException when conversation does not exist', async () => {
    mockConversationsRepo.findConversationByXid.mockResolvedValue(ok(null));

    await expect(service.deleteConversation(userIdStr, 'conv_abc')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws NotFoundException when conversation is already DELETED', async () => {
    mockConversationsRepo.findConversationByXid.mockResolvedValue(
      ok(makeConversation({ status: ConversationStatus.DELETED })),
    );

    await expect(service.deleteConversation(userIdStr, 'conv_abc')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws NotFoundException when artefact does not exist', async () => {
    mockConversationsRepo.findConversationByXid.mockResolvedValue(ok(makeConversation()));
    mockArtefactsRepo.findById.mockResolvedValue(ok(null));

    await expect(service.deleteConversation(userIdStr, 'conv_abc')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws BadRequestException when artefact is not IN_CONVERSATION', async () => {
    mockConversationsRepo.findConversationByXid.mockResolvedValue(ok(makeConversation()));
    mockArtefactsRepo.findById.mockResolvedValue(
      ok(makeArtefact({ status: ArtefactStatus.COMPLETED })),
    );

    await expect(service.deleteConversation(userIdStr, 'conv_abc')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('anonymizes conversation, artefact, goals, and media in transaction', async () => {
    const msgId = oid();
    mockConversationsRepo.findConversationByXid.mockResolvedValue(ok(makeConversation()));
    mockArtefactsRepo.findById.mockResolvedValue(ok(makeArtefact()));
    mockConversationsRepo.findMessageIdsByConversation.mockResolvedValue(ok([msgId]));
    mockOutboxRepo.cancelByConversationId.mockResolvedValue(ok(1));
    mockMediaRepo.markDeletedByMessageIds.mockResolvedValue(ok(1));
    mockConversationsRepo.anonymizeConversation.mockResolvedValue(ok(2));
    mockArtefactsRepo.anonymizeArtefact.mockResolvedValue(ok(undefined));
    mockPdpGoalsRepo.anonymizeByArtefactId.mockResolvedValue(ok(1));
    mockAnalysisRunsRepo.anonymizeByConversationIds.mockResolvedValue(ok(1));

    const result = await service.deleteConversation(userIdStr, 'conv_abc');

    expect(result).toEqual({ message: 'Conversation deleted successfully' });
    expect(mockOutboxRepo.cancelByConversationId).toHaveBeenCalledWith(
      conversationOid.toString(),
      expect.anything(),
    );
    expect(mockMediaRepo.markDeletedByMessageIds).toHaveBeenCalledWith(
      [msgId],
      expect.anything(),
    );
    expect(mockConversationsRepo.anonymizeConversation).toHaveBeenCalledWith(
      conversationOid,
      expect.anything(),
    );
    expect(mockArtefactsRepo.anonymizeArtefact).toHaveBeenCalledWith(
      artefactOid,
      expect.anything(),
    );
    expect(mockPdpGoalsRepo.anonymizeByArtefactId).toHaveBeenCalledWith(
      artefactOid,
      expect.anything(),
    );
    expect(mockAnalysisRunsRepo.anonymizeByConversationIds).toHaveBeenCalledWith([
      conversationOid,
    ]);
  });

  it('skips media cleanup when no messages exist', async () => {
    mockConversationsRepo.findConversationByXid.mockResolvedValue(ok(makeConversation()));
    mockArtefactsRepo.findById.mockResolvedValue(ok(makeArtefact()));
    mockConversationsRepo.findMessageIdsByConversation.mockResolvedValue(ok([]));
    mockOutboxRepo.cancelByConversationId.mockResolvedValue(ok(0));
    mockConversationsRepo.anonymizeConversation.mockResolvedValue(ok(1));
    mockArtefactsRepo.anonymizeArtefact.mockResolvedValue(ok(undefined));
    mockPdpGoalsRepo.anonymizeByArtefactId.mockResolvedValue(ok(0));
    mockAnalysisRunsRepo.anonymizeByConversationIds.mockResolvedValue(ok(0));

    const result = await service.deleteConversation(userIdStr, 'conv_abc');

    expect(result).toEqual({ message: 'Conversation deleted successfully' });
    expect(mockMediaRepo.markDeletedByMessageIds).not.toHaveBeenCalled();
  });
});
