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
  updateMessage: jest.fn(),
  hasLaterAssistantMessage: jest.fn(),
};

const mockArtefactsRepo = {
  findById: jest.fn(),
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
    noopService, // mediaService
    mockTransactionService as any,
    noopService, // portfolioGraphService
    mockAnalysisRunsService as any,
    noopService, // outboxService
    noopService, // contextService
  );
}

/** Wire up the happy-path mocks; individual tests override as needed. */
function primeHappyPath() {
  mockConversationsRepo.findConversationByXid.mockResolvedValue(ok(makeConversation()));
  mockArtefactsRepo.findById.mockResolvedValue(ok(makeArtefact()));
  mockAnalysisRunsService.findExecutingRun.mockResolvedValue(null);
  mockConversationsRepo.findMessagesByXids.mockResolvedValue(ok([makeMessage()]));
  mockConversationsRepo.hasLaterAssistantMessage.mockResolvedValue(ok(false));
  mockConversationsRepo.updateMessage.mockResolvedValue(ok(makeMessage()));
}

describe('ConversationsService.editMessage', () => {
  let service: ConversationsService;

  beforeEach(() => {
    jest.resetAllMocks();
    mockTransactionService.withTransaction.mockImplementation(
      (fn: (session: any) => Promise<any>) => fn(null),
    );
    service = createService();
  });

  it('redacts structured PII, writes the new content, and stamps editedAt', async () => {
    primeHappyPath();

    const result = await service.editMessage(
      userIdStr,
      'conv_abc',
      'msg_abc',
      'Call me at test@example.com',
    );

    expect(mockConversationsRepo.updateMessage).toHaveBeenCalledWith(
      messageOid,
      {
        rawContent: 'Call me at test@example.com',
        cleanedContent: 'Call me at [EMAIL]',
        content: 'Call me at [EMAIL]',
        editedAt: expect.any(Date),
      },
      null,
    );
    expect(result.id).toBe('msg_abc');
  });

  it('throws NotFoundException when the conversation does not exist', async () => {
    mockConversationsRepo.findConversationByXid.mockResolvedValue(ok(null));

    await expect(service.editMessage(userIdStr, 'conv_abc', 'msg_abc', 'new')).rejects.toThrow(
      NotFoundException,
    );
    expect(mockConversationsRepo.updateMessage).not.toHaveBeenCalled();
  });

  it('throws ConflictException when the artefact is not IN_CONVERSATION', async () => {
    mockConversationsRepo.findConversationByXid.mockResolvedValue(ok(makeConversation()));
    mockArtefactsRepo.findById.mockResolvedValue(ok(makeArtefact({ status: ArtefactStatus.IN_REVIEW })));

    await expect(service.editMessage(userIdStr, 'conv_abc', 'msg_abc', 'new')).rejects.toThrow(
      ConflictException,
    );
    expect(mockConversationsRepo.updateMessage).not.toHaveBeenCalled();
  });

  it('throws ConflictException when the graph is actively executing', async () => {
    mockConversationsRepo.findConversationByXid.mockResolvedValue(ok(makeConversation()));
    mockArtefactsRepo.findById.mockResolvedValue(ok(makeArtefact()));
    mockAnalysisRunsService.findExecutingRun.mockResolvedValue({ _id: oid() });

    await expect(service.editMessage(userIdStr, 'conv_abc', 'msg_abc', 'new')).rejects.toThrow(
      ConflictException,
    );
    expect(mockConversationsRepo.updateMessage).not.toHaveBeenCalled();
  });

  it('allows editing while a run is paused (findExecutingRun returns null)', async () => {
    // A run parked at AWAITING_INPUT is not "executing" — editExecutingRun is null.
    primeHappyPath();

    await expect(
      service.editMessage(userIdStr, 'conv_abc', 'msg_abc', 'corrected'),
    ).resolves.toBeDefined();
    expect(mockConversationsRepo.updateMessage).toHaveBeenCalled();
  });

  it('throws NotFoundException when the message does not exist', async () => {
    primeHappyPath();
    mockConversationsRepo.findMessagesByXids.mockResolvedValue(ok([]));

    await expect(service.editMessage(userIdStr, 'conv_abc', 'msg_abc', 'new')).rejects.toThrow(
      NotFoundException,
    );
    expect(mockConversationsRepo.updateMessage).not.toHaveBeenCalled();
  });

  it('throws NotFoundException for a non-USER message', async () => {
    primeHappyPath();
    mockConversationsRepo.findMessagesByXids.mockResolvedValue(
      ok([makeMessage({ role: MessageRole.ASSISTANT })]),
    );

    await expect(service.editMessage(userIdStr, 'conv_abc', 'msg_abc', 'new')).rejects.toThrow(
      NotFoundException,
    );
    expect(mockConversationsRepo.updateMessage).not.toHaveBeenCalled();
  });

  it('throws NotFoundException for a system-generated (selection) message', async () => {
    primeHappyPath();
    mockConversationsRepo.findMessagesByXids.mockResolvedValue(
      ok([makeMessage({ generated: true })]),
    );

    await expect(service.editMessage(userIdStr, 'conv_abc', 'msg_abc', 'new')).rejects.toThrow(
      NotFoundException,
    );
    expect(mockConversationsRepo.updateMessage).not.toHaveBeenCalled();
  });

  it('throws NotFoundException for a non-text/audio message', async () => {
    primeHappyPath();
    mockConversationsRepo.findMessagesByXids.mockResolvedValue(
      ok([makeMessage({ messageType: MessageType.IMAGE })]),
    );

    await expect(service.editMessage(userIdStr, 'conv_abc', 'msg_abc', 'new')).rejects.toThrow(
      NotFoundException,
    );
    expect(mockConversationsRepo.updateMessage).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the message belongs to a different conversation', async () => {
    primeHappyPath();
    mockConversationsRepo.findMessagesByXids.mockResolvedValue(
      ok([makeMessage({ conversation: { _id: oid(), xid: 'conv_other' } })]),
    );

    await expect(service.editMessage(userIdStr, 'conv_abc', 'msg_abc', 'new')).rejects.toThrow(
      NotFoundException,
    );
    expect(mockConversationsRepo.updateMessage).not.toHaveBeenCalled();
  });

  it('throws ConflictException when the assistant has already responded after the message', async () => {
    primeHappyPath();
    mockConversationsRepo.hasLaterAssistantMessage.mockResolvedValue(ok(true));

    await expect(service.editMessage(userIdStr, 'conv_abc', 'msg_abc', 'new')).rejects.toThrow(
      ConflictException,
    );
    expect(mockConversationsRepo.updateMessage).not.toHaveBeenCalled();
  });

  it('throws NotFoundException (opaque) for an already-deleted message', async () => {
    primeHappyPath();
    mockConversationsRepo.findMessagesByXids.mockResolvedValue(
      ok([makeMessage({ status: MessageStatus.DELETED })]),
    );

    await expect(service.editMessage(userIdStr, 'conv_abc', 'msg_abc', 'new')).rejects.toThrow(
      NotFoundException,
    );
    expect(mockConversationsRepo.updateMessage).not.toHaveBeenCalled();
  });

  it('throws ConflictException when the message is not COMPLETE', async () => {
    primeHappyPath();
    mockConversationsRepo.findMessagesByXids.mockResolvedValue(
      ok([makeMessage({ status: MessageStatus.PENDING })]),
    );

    await expect(service.editMessage(userIdStr, 'conv_abc', 'msg_abc', 'new')).rejects.toThrow(
      ConflictException,
    );
    expect(mockConversationsRepo.updateMessage).not.toHaveBeenCalled();
  });

  it('preserves messageType for an edited AUDIO (transcript) message', async () => {
    const audioMsg = makeMessage({ messageType: MessageType.AUDIO });
    mockConversationsRepo.findConversationByXid.mockResolvedValue(ok(makeConversation()));
    mockArtefactsRepo.findById.mockResolvedValue(ok(makeArtefact()));
    mockAnalysisRunsService.findExecutingRun.mockResolvedValue(null);
    mockConversationsRepo.findMessagesByXids.mockResolvedValue(ok([audioMsg]));
    mockConversationsRepo.hasLaterAssistantMessage.mockResolvedValue(ok(false));
    mockConversationsRepo.updateMessage.mockResolvedValue(ok(audioMsg));

    const result = await service.editMessage(userIdStr, 'conv_abc', 'msg_abc', 'corrected transcript');

    expect(result.messageType).toBe(MessageType.AUDIO);
    // Edit never re-runs transcription nor touches status.
    expect(mockConversationsRepo.updateMessage).toHaveBeenCalledWith(
      messageOid,
      expect.not.objectContaining({ status: expect.anything() }),
      null,
    );
  });
});
