import { AnalysisRunStatus } from '@acme/shared';
import { Types } from 'mongoose';
import { AnalysisRunsService } from '../../../analysis-runs/analysis-runs.service';
import type { IConversationsRepository } from '../../../conversations/conversations.repository.interface';
import { TransactionService } from '../../../database/transaction.service';
import { PortfolioGraphService } from '../../../portfolio-graph/portfolio-graph.service';
import { AnalysisResumeHandler, type AnalysisResumePayload } from '../analysis-resume.handler';

// ── Helpers ──

const oid = () => new Types.ObjectId();

function makePayload(overrides: Partial<AnalysisResumePayload> = {}): Record<string, unknown> {
  return {
    analysisRunId: oid().toString(),
    conversationId: oid().toString(),
    node: 'present_classification',
    resumeValue: { entryType: 'CLINICAL_ENCOUNTER' },
    ...overrides,
  };
}

function makeRun(status: AnalysisRunStatus) {
  return {
    _id: oid(),
    status,
    runNumber: 1,
    langGraphThreadId: 'thread-1',
  };
}

function makeInterruptPayload() {
  return {
    idempotencyKey: 'conv:ask_followup:cp-2',
    pausedNode: 'ask_followup' as const,
    questionType: 'free_text' as const,
    messageData: {
      conversation: oid(),
      userId: oid(),
      role: 'ASSISTANT',
      messageType: 'TEXT',
      rawContent: 'follow-up questions',
      content: 'follow-up questions',
      processingStatus: 'COMPLETE',
      question: { questionType: 'free_text', prompts: [], missingSections: [], followUpRound: 1, entryType: 'CE' },
      idempotencyKey: 'conv:ask_followup:cp-2',
    },
  };
}

function createHandler(overrides: {
  findRunById?: jest.Mock;
  transitionStatus?: jest.Mock;
  resumeGraph?: jest.Mock;
  getInterruptPayload?: jest.Mock;
  withTransaction?: jest.Mock;
  findMessageByIdempotencyKey?: jest.Mock;
  createMessage?: jest.Mock;
} = {}) {
  const analysisRunsService = {
    findRunById: overrides.findRunById ?? jest.fn().mockResolvedValue(makeRun(AnalysisRunStatus.AWAITING_INPUT)),
    transitionStatus: overrides.transitionStatus ?? jest.fn().mockResolvedValue({}),
  } as unknown as AnalysisRunsService;

  const portfolioGraphService = {
    resumeGraph: overrides.resumeGraph ?? jest.fn().mockResolvedValue(null),
    getInterruptPayload: overrides.getInterruptPayload ?? jest.fn().mockResolvedValue(null),
  } as unknown as PortfolioGraphService;

  const transactionService = {
    withTransaction: overrides.withTransaction ?? jest.fn((fn) => fn({})),
  } as unknown as TransactionService;

  const conversationsRepository = {
    findMessageByIdempotencyKey: overrides.findMessageByIdempotencyKey ?? jest.fn().mockResolvedValue({ ok: true, value: null }),
    createMessage: overrides.createMessage ?? jest.fn().mockResolvedValue({ ok: true, value: { _id: oid() } }),
  } as unknown as IConversationsRepository;

  return {
    handler: new AnalysisResumeHandler(
      analysisRunsService,
      portfolioGraphService,
      transactionService,
      conversationsRepository,
    ),
    mocks: {
      analysisRunsService,
      portfolioGraphService,
      transactionService,
      conversationsRepository,
    },
  };
}

// ── Tests ──

describe('AnalysisResumeHandler', () => {
  describe('early exit for terminal runs', () => {
    it('should return early without throwing when run is FAILED', async () => {
      const findRunById = jest.fn().mockResolvedValue(makeRun(AnalysisRunStatus.FAILED));
      const transitionStatus = jest.fn();
      const resumeGraph = jest.fn();

      const { handler } = createHandler({ findRunById, transitionStatus, resumeGraph });

      await expect(handler.handle(makePayload())).resolves.toBeUndefined();
      expect(transitionStatus).not.toHaveBeenCalled();
      expect(resumeGraph).not.toHaveBeenCalled();
    });

    it('should return early without throwing when run is COMPLETED', async () => {
      const findRunById = jest.fn().mockResolvedValue(makeRun(AnalysisRunStatus.COMPLETED));
      const transitionStatus = jest.fn();
      const resumeGraph = jest.fn();

      const { handler } = createHandler({ findRunById, transitionStatus, resumeGraph });

      await expect(handler.handle(makePayload())).resolves.toBeUndefined();
      expect(transitionStatus).not.toHaveBeenCalled();
      expect(resumeGraph).not.toHaveBeenCalled();
    });

    it('should return early when run does not exist', async () => {
      const findRunById = jest.fn().mockResolvedValue(null);
      const transitionStatus = jest.fn();
      const resumeGraph = jest.fn();

      const { handler } = createHandler({ findRunById, transitionStatus, resumeGraph });

      await expect(handler.handle(makePayload())).resolves.toBeUndefined();
      expect(transitionStatus).not.toHaveBeenCalled();
      expect(resumeGraph).not.toHaveBeenCalled();
    });

    it('should proceed normally when run is AWAITING_INPUT', async () => {
      const findRunById = jest.fn().mockResolvedValue(makeRun(AnalysisRunStatus.AWAITING_INPUT));
      const transitionStatus = jest.fn().mockResolvedValue({});
      const resumeGraph = jest.fn().mockResolvedValue(null);

      const { handler } = createHandler({ findRunById, transitionStatus, resumeGraph });
      await handler.handle(makePayload());

      expect(transitionStatus).toHaveBeenCalled();
      expect(resumeGraph).toHaveBeenCalled();
    });
  });

  describe('transactional interrupt handling', () => {
    it('should create message and transition status in a single transaction when graph pauses again', async () => {
      const interruptPayload = makeInterruptPayload();
      const messageId = oid();
      const createMessage = jest.fn().mockResolvedValue({ ok: true, value: { _id: messageId } });
      const transitionStatus = jest.fn().mockResolvedValue({});
      const withTransaction = jest.fn((fn) => fn({}));

      const { handler } = createHandler({
        resumeGraph: jest.fn().mockResolvedValue('ask_followup'),
        getInterruptPayload: jest.fn().mockResolvedValue(interruptPayload),
        transitionStatus,
        withTransaction,
        createMessage,
        findMessageByIdempotencyKey: jest.fn().mockResolvedValue({ ok: true, value: null }),
      });

      await handler.handle(makePayload());

      expect(withTransaction).toHaveBeenCalledTimes(1);
      expect(createMessage).toHaveBeenCalledWith(interruptPayload.messageData, expect.anything());
      expect(transitionStatus).toHaveBeenCalledWith(
        expect.any(Types.ObjectId),
        AnalysisRunStatus.RUNNING,
        AnalysisRunStatus.AWAITING_INPUT,
        expect.objectContaining({
          currentQuestion: expect.objectContaining({
            messageId,
            node: 'ask_followup',
            questionType: 'free_text',
          }),
        }),
        expect.anything(), // session
      );
    });

    it('should reuse existing message without transaction when idempotent hit', async () => {
      const interruptPayload = makeInterruptPayload();
      const existingMessageId = oid();
      const transitionStatus = jest.fn().mockResolvedValue({});
      const withTransaction = jest.fn();
      const createMessage = jest.fn();

      const { handler } = createHandler({
        resumeGraph: jest.fn().mockResolvedValue('ask_followup'),
        getInterruptPayload: jest.fn().mockResolvedValue(interruptPayload),
        transitionStatus,
        withTransaction,
        createMessage,
        findMessageByIdempotencyKey: jest.fn().mockResolvedValue({
          ok: true,
          value: { _id: existingMessageId },
        }),
      });

      await handler.handle(makePayload());

      expect(withTransaction).not.toHaveBeenCalled();
      expect(createMessage).not.toHaveBeenCalled();
      expect(transitionStatus).toHaveBeenCalledWith(
        expect.any(Types.ObjectId),
        AnalysisRunStatus.RUNNING,
        AnalysisRunStatus.AWAITING_INPUT,
        expect.objectContaining({
          currentQuestion: expect.objectContaining({
            messageId: existingMessageId,
          }),
        }),
      );
    });

    it('should throw when graph pauses but no interrupt payload found', async () => {
      const { handler } = createHandler({
        resumeGraph: jest.fn().mockResolvedValue('ask_followup'),
        getInterruptPayload: jest.fn().mockResolvedValue(null),
        transitionStatus: jest.fn().mockResolvedValue({}),
      });

      await expect(handler.handle(makePayload())).rejects.toThrow(
        'no interrupt payload found',
      );
    });

    it('should transition to COMPLETED when graph finishes without interrupt', async () => {
      const transitionStatus = jest.fn().mockResolvedValue({});

      const { handler } = createHandler({
        resumeGraph: jest.fn().mockResolvedValue(null),
        transitionStatus,
      });

      await handler.handle(makePayload());

      expect(transitionStatus).toHaveBeenCalledWith(
        expect.any(Types.ObjectId),
        AnalysisRunStatus.RUNNING,
        AnalysisRunStatus.COMPLETED,
        { currentStep: null },
      );
    });
  });
});
