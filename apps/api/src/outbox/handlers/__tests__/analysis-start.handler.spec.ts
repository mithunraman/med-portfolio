import { AnalysisRunStatus, ArtefactStatus } from '@acme/shared';
import { Types } from 'mongoose';
import { AnalysisRunsService } from '../../../analysis-runs/analysis-runs.service';
import type { IArtefactsRepository } from '../../../artefacts/artefacts.repository.interface';
import type { IConversationsRepository } from '../../../conversations/conversations.repository.interface';
import { TransactionService } from '../../../database/transaction.service';
import type { IPdpGoalsRepository } from '../../../pdp-goals/pdp-goals.repository.interface';
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
    langGraphThreadId: 'conv:1',
    ...overrides,
  };
}

function makeRun(status: AnalysisRunStatus) {
  return {
    _id: oid(),
    status,
    runNumber: 1,
    langGraphThreadId: 'conv:1',
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
      status: 'COMPLETE',
      question: { questionType: 'single_select', options: [], suggestedKey: 'CE' },
      idempotencyKey: 'conv:present_classification:cp-1',
    },
  };
}

function makeFinalState() {
  return {
    conversationId: 'conv-1',
    artefactId: oid().toString(),
    userId: oid().toString(),
    entryType: 'CLINICAL_ENCOUNTER',
    title: 'Test Entry',
    reflection: [{ title: 'Reflection', text: 'Some text' }],
    capabilities: [{ code: 'CAP1', name: 'Cap 1', confidence: 0.9, reasoning: 'good' }],
    pdpGoals: [
      { goal: 'Improve', actions: [{ action: 'Do X', intendedEvidence: 'Evidence Y' }] },
    ],
  };
}

function createHandler(overrides: {
  findRunById?: jest.Mock;
  transitionStatus?: jest.Mock;
  startGraph?: jest.Mock;
  getInterruptPayload?: jest.Mock;
  getFinalState?: jest.Mock;
  withTransaction?: jest.Mock;
  findMessageByIdempotencyKey?: jest.Mock;
  createMessage?: jest.Mock;
  updateArtefactById?: jest.Mock;
  deleteByArtefactId?: jest.Mock;
  pdpCreate?: jest.Mock;
} = {}) {
  const analysisRunsService = {
    findRunById: overrides.findRunById ?? jest.fn().mockResolvedValue(makeRun(AnalysisRunStatus.PENDING)),
    transitionStatus: overrides.transitionStatus ?? jest.fn().mockResolvedValue({}),
  } as unknown as AnalysisRunsService;

  const portfolioGraphService = {
    startGraph: overrides.startGraph ?? jest.fn().mockResolvedValue(null),
    getInterruptPayload: overrides.getInterruptPayload ?? jest.fn().mockResolvedValue(null),
    getFinalState: overrides.getFinalState ?? jest.fn().mockResolvedValue(makeFinalState()),
  } as unknown as PortfolioGraphService;

  const transactionService = {
    withTransaction: overrides.withTransaction ?? jest.fn((fn) => fn({})),
  } as unknown as TransactionService;

  const conversationsRepository = {
    findMessageByIdempotencyKey: overrides.findMessageByIdempotencyKey ?? jest.fn().mockResolvedValue({ ok: true, value: null }),
    createMessage: overrides.createMessage ?? jest.fn().mockResolvedValue({ ok: true, value: { _id: oid() } }),
  } as unknown as IConversationsRepository;

  const artefactsRepository = {
    updateArtefactById: overrides.updateArtefactById ?? jest.fn().mockResolvedValue({ ok: true, value: {} }),
  } as unknown as IArtefactsRepository;

  const pdpGoalsRepository = {
    deleteByArtefactId: overrides.deleteByArtefactId ?? jest.fn().mockResolvedValue({ ok: true, value: 0 }),
    create: overrides.pdpCreate ?? jest.fn().mockResolvedValue({ ok: true, value: [] }),
  } as unknown as IPdpGoalsRepository;

  return {
    handler: new AnalysisStartHandler(
      analysisRunsService,
      portfolioGraphService,
      transactionService,
      conversationsRepository,
      artefactsRepository,
      pdpGoalsRepository,
    ),
    mocks: {
      analysisRunsService,
      portfolioGraphService,
      transactionService,
      conversationsRepository,
      artefactsRepository,
      pdpGoalsRepository,
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

      expect(withTransaction).toHaveBeenCalledTimes(1);
      expect(createMessage).toHaveBeenCalledWith(interruptPayload.messageData, expect.anything());
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

      expect(withTransaction).not.toHaveBeenCalled();
      expect(createMessage).not.toHaveBeenCalled();
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
  });

  describe('transactional completion (artefact + PDP goals + status)', () => {
    it('should save artefact, PDP goals, and transition to COMPLETED in one transaction', async () => {
      const updateArtefactById = jest.fn().mockResolvedValue({ ok: true, value: {} });
      const deleteByArtefactId = jest.fn().mockResolvedValue({ ok: true, value: 0 });
      const pdpCreate = jest.fn().mockResolvedValue({ ok: true, value: [] });
      const transitionStatus = jest.fn().mockResolvedValue({});
      const withTransaction = jest.fn((fn) => fn({}));

      const { handler } = createHandler({
        startGraph: jest.fn().mockResolvedValue(null), // graph completed
        transitionStatus,
        withTransaction,
        updateArtefactById,
        deleteByArtefactId,
        pdpCreate,
      });

      await handler.handle(makePayload());

      // Transaction used for completion
      expect(withTransaction).toHaveBeenCalledTimes(1);
      // Artefact updated
      expect(updateArtefactById).toHaveBeenCalledWith(
        expect.any(Types.ObjectId),
        expect.objectContaining({ status: ArtefactStatus.IN_REVIEW }),
        expect.anything(), // session
      );
      // Delete-then-create for PDP goals
      expect(deleteByArtefactId).toHaveBeenCalled();
      expect(pdpCreate).toHaveBeenCalled();
      // Status transitioned to COMPLETED inside transaction
      expect(transitionStatus).toHaveBeenCalledWith(
        expect.any(Types.ObjectId),
        AnalysisRunStatus.RUNNING,
        AnalysisRunStatus.COMPLETED,
        { currentStep: null },
        expect.anything(), // session
      );
    });

    it('should not create PDP goals when pdpGoals is empty', async () => {
      const finalState = makeFinalState();
      finalState.pdpGoals = [];

      const pdpCreate = jest.fn();
      const deleteByArtefactId = jest.fn().mockResolvedValue({ ok: true, value: 0 });

      const { handler } = createHandler({
        startGraph: jest.fn().mockResolvedValue(null),
        getFinalState: jest.fn().mockResolvedValue(finalState),
        transitionStatus: jest.fn().mockResolvedValue({}),
        withTransaction: jest.fn((fn) => fn({})),
        updateArtefactById: jest.fn().mockResolvedValue({ ok: true, value: {} }),
        deleteByArtefactId,
        pdpCreate,
      });

      await handler.handle(makePayload());

      // Delete still called (for idempotency)
      expect(deleteByArtefactId).toHaveBeenCalled();
      // But create is NOT called when empty
      expect(pdpCreate).not.toHaveBeenCalled();
    });

    it('should use langGraphThreadId from payload for graph operations', async () => {
      const startGraph = jest.fn().mockResolvedValue(null);
      const getFinalState = jest.fn().mockResolvedValue(makeFinalState());

      const { handler } = createHandler({
        startGraph,
        getFinalState,
        transitionStatus: jest.fn().mockResolvedValue({}),
        withTransaction: jest.fn((fn) => fn({})),
        updateArtefactById: jest.fn().mockResolvedValue({ ok: true, value: {} }),
        deleteByArtefactId: jest.fn().mockResolvedValue({ ok: true, value: 0 }),
      });

      const payload = makePayload({ langGraphThreadId: 'conv-123:2' });
      await handler.handle(payload);

      // startGraph receives threadId
      expect(startGraph).toHaveBeenCalledWith(
        expect.objectContaining({ threadId: 'conv-123:2' }),
      );
      // getFinalState uses threadId
      expect(getFinalState).toHaveBeenCalledWith('conv-123:2');
    });
  });
});
