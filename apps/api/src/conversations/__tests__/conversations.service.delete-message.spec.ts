import {
  ArtefactStatus,
  ConversationStatus,
  MessageRole,
  MessageStatus,
  MessageType,
} from '@acme/shared';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ok } from '../../common/utils/result.util';
import { ConversationsService } from '../conversations.service';

const oid = () => new Types.ObjectId();
const userId = oid();
const userIdStr = userId.toString();
const conversationOid = oid();
const messageOid = oid();
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
  return { _id: artefactOid, status: ArtefactStatus.IN_CONVERSATION, ...overrides };
}

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    _id: messageOid,
    xid: 'msg_abc',
    // findMessagesByXids populates `conversation` and runs .lean() → { _id, xid }.
    conversation: { _id: conversationOid, xid: 'conv_abc' },
    userId,
    role: MessageRole.USER,
    messageType: MessageType.TEXT,
    status: MessageStatus.COMPLETE,
    generated: false,
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
  hasLaterAssistantMessage: jest.fn(),
};

const mockArtefactsRepo = {
  findById: jest.fn(),
};

const mockMediaService = {
  markPendingDeleteByMessageIds: jest.fn().mockResolvedValue(undefined),
};

const mockAnalysisRunsService = {
  findExecutingRun: jest.fn(),
};

const noopService = {} as any;
const noopRepo = {} as any;
const mockTransactionService = {
  withTransaction: jest.fn((fn: (session: any) => Promise<any>) => fn(null)),
};

function createService(): ConversationsService {
  return new ConversationsService(
    mockConversationsRepo as any,
    mockArtefactsRepo as any, // artefactsRepository
    noopRepo, // mediaRepository
    mockMediaService as any,
    mockTransactionService as any,
    noopService, // portfolioGraphService
    mockAnalysisRunsService as any,
    noopService, // outboxService
    noopService, // contextService
    noopService, // localPiiService (unused on the delete path)
  );
}

/** Wire up the happy-path mocks; individual tests override as needed. */
function primeHappyPath() {
  mockConversationsRepo.findConversationByXid.mockResolvedValue(ok(makeConversation()));
  mockArtefactsRepo.findById.mockResolvedValue(ok(makeArtefact()));
  mockAnalysisRunsService.findExecutingRun.mockResolvedValue(null);
  mockConversationsRepo.findMessagesByXids.mockResolvedValue(ok([makeMessage()]));
  mockConversationsRepo.hasLaterAssistantMessage.mockResolvedValue(ok(false));
  mockConversationsRepo.markDeletedMessagesByIds.mockResolvedValue(ok(1));
  mockMediaService.markPendingDeleteByMessageIds.mockResolvedValue(undefined);
}

describe('ConversationsService.deleteMessage', () => {
  let service: ConversationsService;

  beforeEach(() => {
    jest.resetAllMocks();
    mockTransactionService.withTransaction.mockImplementation(
      (fn: (session: any) => Promise<any>) => fn(null),
    );
    service = createService();
  });

  it('tombstones a COMPLETE user message (cascades media cleanup)', async () => {
    primeHappyPath();

    await expect(service.deleteMessage(userIdStr, 'conv_abc', 'msg_abc')).resolves.toBeUndefined();

    expect(mockMediaService.markPendingDeleteByMessageIds).toHaveBeenCalledWith([messageOid], null);
    expect(mockConversationsRepo.markDeletedMessagesByIds).toHaveBeenCalledWith([messageOid], null);
  });

  it('allows deleting a FAILED message', async () => {
    primeHappyPath();
    mockConversationsRepo.findMessagesByXids.mockResolvedValue(
      ok([makeMessage({ status: MessageStatus.FAILED })]),
    );

    await expect(service.deleteMessage(userIdStr, 'conv_abc', 'msg_abc')).resolves.toBeUndefined();
    expect(mockConversationsRepo.markDeletedMessagesByIds).toHaveBeenCalledWith([messageOid], null);
  });

  it('allows deleting a REJECTED (injection-flagged) message', async () => {
    primeHappyPath();
    mockConversationsRepo.findMessagesByXids.mockResolvedValue(
      ok([makeMessage({ status: MessageStatus.REJECTED, content: null, cleanedContent: null })]),
    );

    await expect(service.deleteMessage(userIdStr, 'conv_abc', 'msg_abc')).resolves.toBeUndefined();
    expect(mockConversationsRepo.markDeletedMessagesByIds).toHaveBeenCalledWith([messageOid], null);
  });

  it('throws NotFoundException when conversation does not exist', async () => {
    mockConversationsRepo.findConversationByXid.mockResolvedValue(ok(null));

    await expect(service.deleteMessage(userIdStr, 'conv_abc', 'msg_abc')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws ConflictException when the artefact is not IN_CONVERSATION', async () => {
    mockConversationsRepo.findConversationByXid.mockResolvedValue(ok(makeConversation()));
    mockArtefactsRepo.findById.mockResolvedValue(ok(makeArtefact({ status: ArtefactStatus.IN_REVIEW })));

    await expect(service.deleteMessage(userIdStr, 'conv_abc', 'msg_abc')).rejects.toThrow(
      ConflictException,
    );
    expect(mockConversationsRepo.markDeletedMessagesByIds).not.toHaveBeenCalled();
  });

  it('throws ConflictException when the graph is actively executing', async () => {
    mockConversationsRepo.findConversationByXid.mockResolvedValue(ok(makeConversation()));
    mockArtefactsRepo.findById.mockResolvedValue(ok(makeArtefact()));
    mockAnalysisRunsService.findExecutingRun.mockResolvedValue({ _id: oid() });

    await expect(service.deleteMessage(userIdStr, 'conv_abc', 'msg_abc')).rejects.toThrow(
      ConflictException,
    );
    expect(mockConversationsRepo.markDeletedMessagesByIds).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when message does not exist', async () => {
    primeHappyPath();
    mockConversationsRepo.findMessagesByXids.mockResolvedValue(ok([]));

    await expect(service.deleteMessage(userIdStr, 'conv_abc', 'msg_abc')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws NotFoundException for a non-USER message', async () => {
    primeHappyPath();
    mockConversationsRepo.findMessagesByXids.mockResolvedValue(
      ok([makeMessage({ role: MessageRole.ASSISTANT })]),
    );

    await expect(service.deleteMessage(userIdStr, 'conv_abc', 'msg_abc')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws NotFoundException for a system-generated (selection) message', async () => {
    primeHappyPath();
    mockConversationsRepo.findMessagesByXids.mockResolvedValue(
      ok([makeMessage({ generated: true })]),
    );

    await expect(service.deleteMessage(userIdStr, 'conv_abc', 'msg_abc')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws NotFoundException for a non-text/audio message', async () => {
    primeHappyPath();
    mockConversationsRepo.findMessagesByXids.mockResolvedValue(
      ok([makeMessage({ messageType: MessageType.IMAGE })]),
    );

    await expect(service.deleteMessage(userIdStr, 'conv_abc', 'msg_abc')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws NotFoundException when message belongs to a different conversation', async () => {
    primeHappyPath();
    mockConversationsRepo.findMessagesByXids.mockResolvedValue(
      ok([makeMessage({ conversation: { _id: oid(), xid: 'conv_other' } })]),
    );

    await expect(service.deleteMessage(userIdStr, 'conv_abc', 'msg_abc')).rejects.toThrow(
      NotFoundException,
    );
    expect(mockConversationsRepo.markDeletedMessagesByIds).not.toHaveBeenCalled();
  });

  it('throws ConflictException when the assistant has already responded after the message', async () => {
    primeHappyPath();
    mockConversationsRepo.hasLaterAssistantMessage.mockResolvedValue(ok(true));

    await expect(service.deleteMessage(userIdStr, 'conv_abc', 'msg_abc')).rejects.toThrow(
      ConflictException,
    );
    expect(mockConversationsRepo.markDeletedMessagesByIds).not.toHaveBeenCalled();
  });

  it('throws NotFoundException (opaque, idempotent) for an already-deleted message', async () => {
    primeHappyPath();
    mockConversationsRepo.findMessagesByXids.mockResolvedValue(
      ok([makeMessage({ status: MessageStatus.DELETED })]),
    );

    await expect(service.deleteMessage(userIdStr, 'conv_abc', 'msg_abc')).rejects.toThrow(
      NotFoundException,
    );
    expect(mockConversationsRepo.markDeletedMessagesByIds).not.toHaveBeenCalled();
  });

  it('throws ConflictException for a status that is neither COMPLETE nor FAILED', async () => {
    primeHappyPath();
    mockConversationsRepo.findMessagesByXids.mockResolvedValue(
      ok([makeMessage({ status: MessageStatus.PENDING })]),
    );

    await expect(service.deleteMessage(userIdStr, 'conv_abc', 'msg_abc')).rejects.toThrow(
      ConflictException,
    );
    expect(mockConversationsRepo.markDeletedMessagesByIds).not.toHaveBeenCalled();
  });
});
