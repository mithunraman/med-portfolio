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
    // findMessagesByXids populates `conversation` and runs .lean(), so the
    // real shape at runtime is { _id, xid } — NOT a raw Types.ObjectId.
    // Tests must mirror this; using a raw ObjectId here previously hid a
    // P0 where .equals() on the populated plain object threw at runtime.
    conversation: { _id: conversationOid, xid: 'conv_abc' },
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
  markDeletedMessagesByIds: jest.fn().mockResolvedValue(ok(1)),
};

const mockMediaService = {
  markPendingDeleteByMessageIds: jest.fn().mockResolvedValue(undefined),
};

const mockAnalysisRunsService = {
  findActiveRun: jest.fn(),
};

const noopService = {} as any;
const noopRepo = {} as any;
const mockTransactionService = {
  withTransaction: jest.fn((fn: (session: any) => Promise<any>) => fn(null)),
};

function createService(): ConversationsService {
  return new ConversationsService(
    mockConversationsRepo as any,
    noopRepo, // artefactsRepository
    noopRepo, // mediaRepository
    mockMediaService as any,
    mockTransactionService as any,
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
    mockTransactionService.withTransaction.mockImplementation(
      (fn: (session: any) => Promise<any>) => fn(null),
    );
    mockConversationsRepo.markDeletedMessagesByIds.mockResolvedValue(ok(1));
    mockMediaService.markPendingDeleteByMessageIds.mockResolvedValue(undefined);
    service = createService();
  });

  it('cascades media + tombstones the message for a USER message in an active conversation', async () => {
    mockConversationsRepo.findConversationByXid.mockResolvedValue(ok(makeConversation()));
    mockAnalysisRunsService.findActiveRun.mockResolvedValue(null);
    mockConversationsRepo.findMessagesByXids.mockResolvedValue(ok([makeMessage()]));

    await expect(
      service.deleteMessage(userIdStr, 'conv_abc', 'msg_abc'),
    ).resolves.toBeUndefined();

    expect(mockMediaService.markPendingDeleteByMessageIds).toHaveBeenCalledWith(
      [messageOid],
      null,
    );
    expect(mockConversationsRepo.markDeletedMessagesByIds).toHaveBeenCalledWith(
      [messageOid],
      null,
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

  it('throws NotFoundException when message is not a USER message', async () => {
    mockConversationsRepo.findConversationByXid.mockResolvedValue(ok(makeConversation()));
    mockAnalysisRunsService.findActiveRun.mockResolvedValue(null);
    mockConversationsRepo.findMessagesByXids.mockResolvedValue(
      ok([makeMessage({ role: MessageRole.ASSISTANT })]),
    );

    await expect(service.deleteMessage(userIdStr, 'conv_abc', 'msg_abc')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws NotFoundException when message belongs to a different conversation owned by the same user', async () => {
    // Both conversations belong to the same user — the route names conv_abc
    // (idle, no active run) while the message lives in conv_other (which
    // could be running an analysis). Without the membership check, the
    // active-run guard would be bypassed.
    const otherConversationOid = oid();
    mockConversationsRepo.findConversationByXid.mockResolvedValue(ok(makeConversation()));
    mockAnalysisRunsService.findActiveRun.mockResolvedValue(null);
    mockConversationsRepo.findMessagesByXids.mockResolvedValue(
      ok([makeMessage({ conversation: { _id: otherConversationOid, xid: 'conv_other' } })]),
    );

    await expect(service.deleteMessage(userIdStr, 'conv_abc', 'msg_abc')).rejects.toThrow(
      NotFoundException,
    );
    expect(mockConversationsRepo.markDeletedMessagesByIds).not.toHaveBeenCalled();
    expect(mockMediaService.markPendingDeleteByMessageIds).not.toHaveBeenCalled();
  });
});
