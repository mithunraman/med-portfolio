import { ConversationStatus, MessageRole, MessageStatus } from '@acme/shared';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ok } from '../../common/utils/result.util';
import { ConversationsService } from '../conversations.service';

const oid = () => new Types.ObjectId();
const userId = oid();
const userIdStr = userId.toString();
const conversationOid = oid();
const messageOid = oid();

function makeConversation(overrides: Record<string, unknown> = {}) {
  return {
    _id: conversationOid,
    xid: 'conv_abc',
    userId,
    artefact: oid(),
    title: 'Test Conversation',
    status: ConversationStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    _id: messageOid,
    xid: 'msg_abc',
    conversation: conversationOid,
    userId,
    role: MessageRole.USER,
    status: MessageStatus.COMPLETE,
    content: 'Hello world',
    rawContent: 'Hello world',
    cleanedContent: 'Hello world',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const mockConversationsRepo = {
  findConversationByXid: jest.fn(),
  findMessagesByXids: jest.fn(),
  softDeleteMessage: jest.fn(),
};

const mockAnalysisRunsService = {
  findActiveRun: jest.fn(),
};

// Unused deps — ConversationsService requires them but deleteMessage doesn't use them
const noopService = {} as any;
const noopRepo = {} as any;

function createService(): ConversationsService {
  return new ConversationsService(
    mockConversationsRepo as any,
    noopRepo, // artefactsRepository
    noopRepo, // mediaRepository
    noopRepo, // pdpGoalsRepository
    noopRepo, // analysisRunsRepository
    noopRepo, // outboxRepository
    noopService, // mediaService
    noopService, // transactionService
    noopService, // portfolioGraphService
    mockAnalysisRunsService as any,
    noopService, // outboxService
    noopService, // contextService
  );
}

describe('ConversationsService.deleteMessage', () => {
  let service: ConversationsService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = createService();
  });

  it('deletes a user message in an active conversation', async () => {
    mockConversationsRepo.findConversationByXid.mockResolvedValue(ok(makeConversation()));
    mockAnalysisRunsService.findActiveRun.mockResolvedValue(null);
    mockConversationsRepo.findMessagesByXids.mockResolvedValue(ok([makeMessage()]));
    mockConversationsRepo.softDeleteMessage.mockResolvedValue(ok(makeMessage({ status: MessageStatus.DELETED })));

    await expect(service.deleteMessage(userIdStr, 'conv_abc', 'msg_abc')).resolves.toBeUndefined();

    expect(mockConversationsRepo.softDeleteMessage).toHaveBeenCalledWith(
      messageOid,
      conversationOid,
      userId,
    );
  });

  it('throws NotFoundException when conversation does not exist', async () => {
    mockConversationsRepo.findConversationByXid.mockResolvedValue(ok(null));

    await expect(service.deleteMessage(userIdStr, 'conv_abc', 'msg_abc')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws ConflictException when conversation is not ACTIVE', async () => {
    mockConversationsRepo.findConversationByXid.mockResolvedValue(
      ok(makeConversation({ status: ConversationStatus.CLOSED })),
    );

    await expect(service.deleteMessage(userIdStr, 'conv_abc', 'msg_abc')).rejects.toThrow(
      ConflictException,
    );
  });

  it('throws ConflictException when analysis is in progress', async () => {
    mockConversationsRepo.findConversationByXid.mockResolvedValue(ok(makeConversation()));
    mockAnalysisRunsService.findActiveRun.mockResolvedValue({ _id: oid() });

    await expect(service.deleteMessage(userIdStr, 'conv_abc', 'msg_abc')).rejects.toThrow(
      ConflictException,
    );
  });

  it('throws NotFoundException when message does not exist', async () => {
    mockConversationsRepo.findConversationByXid.mockResolvedValue(ok(makeConversation()));
    mockAnalysisRunsService.findActiveRun.mockResolvedValue(null);
    mockConversationsRepo.findMessagesByXids.mockResolvedValue(ok([]));

    await expect(service.deleteMessage(userIdStr, 'conv_abc', 'msg_abc')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws NotFoundException when softDeleteMessage returns null (not owned or not USER role)', async () => {
    mockConversationsRepo.findConversationByXid.mockResolvedValue(ok(makeConversation()));
    mockAnalysisRunsService.findActiveRun.mockResolvedValue(null);
    mockConversationsRepo.findMessagesByXids.mockResolvedValue(ok([makeMessage()]));
    mockConversationsRepo.softDeleteMessage.mockResolvedValue(ok(null));

    await expect(service.deleteMessage(userIdStr, 'conv_abc', 'msg_abc')).rejects.toThrow(
      NotFoundException,
    );
  });
});
