import { AnalysisRunStatus } from '@acme/shared';
import { Types } from 'mongoose';
import { AnalysisRunsService } from '../../../analysis-runs/analysis-runs.service';
import type { IConversationsRepository } from '../../../conversations/conversations.repository.interface';
import { TransactionService } from '../../../database/transaction.service';
import { PortfolioGraphService } from '../../../portfolio-graph/portfolio-graph.service';
import { AnalysisStartHandler, type AnalysisStartPayload } from '../analysis-start.handler';

// ── Helpers ──

const oid = () => new Types.ObjectId();

function makePayload(overrides: Partial<AnalysisStartPayload> = {}): Record<string, unknown> {
  return {
    analysisRunId: oid().toString(),
    conversationId: oid().toString(),
    artefactId: oid().toString(),
    userId: oid().toString(),
    specialty: '0',
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
    idempotencyKey: 'conv:present_classification:cp-1',
    pausedNode: 'present_classification' as const,
    questionType: 'single_select' as const,
    messageData: {
      conversation: oid(),
      userId: oid(),
      role: 'ASSISTANT',
      messageType: 'TEXT',
      rawContent: 'test',
      content: 'test',
      processingStatus: 'COMPLETE',
      question: { questionType: 'single_select', options: [], suggestedKey: 'CE' },
      idempotencyKey: 'conv:present_classification:cp-1',
    },
  };
}

function createHandler(overrides: {
  findRunById?: jest.Mock;
  transitionStatus?: jest.Mock;
  startGraph?: jest.Mock;
  getInterruptPayload?: jest.Mock;
  withTransaction?: jest.Mock;
  findMessageByIdempotencyKey?: jest.Mock;
  createMessage?: jest.Mock;
} = {}) {
  const analysisRunsService = {
    findRunById: overrides.findRunById ?? jest.fn().mockResolvedValue(makeRun(AnalysisRunStatus.PENDING)),
    transitionStatus: overrides.transitionStatus ?? jest.fn().mockResolvedValue({}),
  } as unknown as AnalysisRunsService;

  const portfolioGraphService = {
    startGraph: overrides.startGraph ?? jest.fn().mockResolvedValue(null),
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
    handler: new AnalysisStartHandler(
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

describe('AnalysisStartHandler', () => {
  describe('early exit for terminal runs', () => {
    it('should return early without throwing when run is FAILED', async () => {
      const findRunById = jest.fn().mockResolvedValue(makeRun(AnalysisRunStatus.FAILED));
      const transitionStatus = jest.fn();
      const startGraph = jest.fn();

      const { handler } = createHandler({ findRunById, transitionStatus, startGraph });

      await expect(handler.handle(makePayload())).resolves.toBeUndefined();
      expect(transitionStatus).not.toHaveBeenCalled();
      expect(startGraph).not.toHaveBeenCalled();
    });

    it('should return early without throwing when run is COMPLETED', async () => {
      const findRunById = jest.fn().mockResolvedValue(makeRun(AnalysisRunStatus.COMPLETED));
      const transitionStatus = jest.fn();
      const startGraph = jest.fn();

      const { handler } = createHandler({ findRunById, transitionStatus, startGraph });

      await expect(handler.handle(makePayload())).resolves.toBeUndefined();
      expect(transitionStatus).not.toHaveBeenCalled();
      expect(startGraph).not.toHaveBeenCalled();
    });

    it('should return early when run does not exist', async () => {
      const findRunById = jest.fn().mockResolvedValue(null);
      const transitionStatus = jest.fn();
      const startGraph = jest.fn();

      const { handler } = createHandler({ findRunById, transitionStatus, startGraph });

      await expect(handler.handle(makePayload())).resolves.toBeUndefined();
      expect(transitionStatus).not.toHaveBeenCalled();
      expect(startGraph).not.toHaveBeenCalled();
    });

    it('should proceed normally when run is PENDING', async () => {
      const findRunById = jest.fn().mockResolvedValue(makeRun(AnalysisRunStatus.PENDING));
      const transitionStatus = jest.fn().mockResolvedValue({});
      const startGraph = jest.fn().mockResolvedValue(null);

      const { handler } = createHandler({ findRunById, transitionStatus, startGraph });
      await handler.handle(makePayload());

      expect(transitionStatus).toHaveBeenCalled();
      expect(startGraph).toHaveBeenCalled();
    });
  });

  describe('transactional interrupt handling', () => {
    it('should create message and transition status in a single transaction when graph pauses', async () => {
      const interruptPayload = makeInterruptPayload();
      const messageId = oid();
      const createMessage = jest.fn().mockResolvedValue({ ok: true, value: { _id: messageId } });
      const transitionStatus = jest.fn().mockResolvedValue({});
      const withTransaction = jest.fn((fn) => fn({}));

      const { handler } = createHandler({
        startGraph: jest.fn().mockResolvedValue('present_classification'),
        getInterruptPayload: jest.fn().mockResolvedValue(interruptPayload),
        transitionStatus,
        withTransaction,
        createMessage,
        findMessageByIdempotencyKey: jest.fn().mockResolvedValue({ ok: true, value: null }),
      });

      await handler.handle(makePayload());

      // Transaction was used
      expect(withTransaction).toHaveBeenCalledTimes(1);
      // Message created inside transaction
      expect(createMessage).toHaveBeenCalledWith(interruptPayload.messageData, expect.anything());
      // Status transitioned to AWAITING_INPUT inside transaction
      expect(transitionStatus).toHaveBeenCalledWith(
        expect.any(Types.ObjectId),
        AnalysisRunStatus.RUNNING,
        AnalysisRunStatus.AWAITING_INPUT,
        expect.objectContaining({
          currentQuestion: expect.objectContaining({
            messageId,
            node: 'present_classification',
            questionType: 'single_select',
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
        startGraph: jest.fn().mockResolvedValue('present_classification'),
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

      // No transaction needed — message already exists
      expect(withTransaction).not.toHaveBeenCalled();
      expect(createMessage).not.toHaveBeenCalled();
      // But status still transitions
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
        startGraph: jest.fn().mockResolvedValue('present_classification'),
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
        startGraph: jest.fn().mockResolvedValue(null),
        transitionStatus,
      });

      await handler.handle(makePayload());

      // Second call (after PENDING → RUNNING) should be RUNNING → COMPLETED
      expect(transitionStatus).toHaveBeenCalledWith(
        expect.any(Types.ObjectId),
        AnalysisRunStatus.RUNNING,
        AnalysisRunStatus.COMPLETED,
        { currentStep: null },
      );
    });
  });
});
