import { AnalysisRunStatus, ArtefactStatus } from '@acme/shared';
import { Types } from 'mongoose';
import { AnalysisRunsService } from '../../../analysis-runs/analysis-runs.service';
import type { IArtefactsRepository } from '../../../artefacts/artefacts.repository.interface';
import type { IConversationsRepository } from '../../../conversations/conversations.repository.interface';
import { TransactionService } from '../../../database/transaction.service';
import type { IPdpGoalsRepository } from '../../../pdp-goals/pdp-goals.repository.interface';
import { PortfolioGraphService } from '../../../portfolio-graph/portfolio-graph.service';
import { AnalysisCompletionService } from '../../analysis-completion.service';
import { AnalysisStartHandler, type AnalysisStartPayload } from '../analysis-start.handler';

// ── Helpers ──

const oid = () => new Types.ObjectId();

/**
 * `handle()` takes an untyped outbox payload, so the return type is deliberately
 * widened — but the literal is annotated INSIDE the function so it must still
 * satisfy `AnalysisStartPayload`. Annotating only the return type would check
 * nothing: a newly-required field would go missing from every test in this file
 * and surface as `undefined` reaching the graph at runtime, not as a build error.
 */
function makePayload(overrides: Partial<AnalysisStartPayload> = {}): Record<string, unknown> {
  const payload: AnalysisStartPayload = {
    analysisRunId: oid().toString(),
    conversationId: oid().toString(),
    artefactId: oid().toString(),
    userId: oid().toString(),
    specialty: '0',
    trainingStage: 'ST1',
    entryType: 'CLINICAL_CASE_REVIEW',
    langGraphThreadId: 'conv:1',
  };
  return { ...payload, ...overrides };
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
    idempotencyKey: 'conv:ask_followup:cp-1',
    pausedNode: 'ask_followup' as const,
    questionType: 'free_text' as const,
    messageData: {
      conversation: oid(),
      userId: oid(),
      role: 'ASSISTANT',
      messageType: 'TEXT',
      rawContent: 'follow-up questions',
      content: 'follow-up questions',
      status: 'COMPLETE',
      question: {
        questionType: 'free_text',
        prompts: [],
        missingSections: [],
        followUpRound: 0,
        entryType: 'CLINICAL_CASE_REVIEW',
      },
      idempotencyKey: 'conv:ask_followup:cp-1',
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
    composedDocument: [{ sectionId: 'brief_description', label: 'Brief Description', text: 'Some text' }],
    capabilities: [
      { code: 'CAP1', name: 'Cap 1', tier: 'strong', reasoning: 'good', quote: 'a verbatim span' },
    ],
    pdpGoals: [
      { goal: 'Improve', actions: [{ action: 'Do X', intendedEvidence: 'Evidence Y' }] },
    ],
    // Completeness fields a completed run always carries (set by check_completeness).
    missingSections: [],
    hasEnoughInfo: true,
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

  const completionService = new AnalysisCompletionService(
    analysisRunsService,
    portfolioGraphService,
    transactionService,
    artefactsRepository,
    pdpGoalsRepository,
  );

  return {
    handler: new AnalysisStartHandler(
      analysisRunsService,
      portfolioGraphService,
      transactionService,
      conversationsRepository,
      completionService,
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
  describe('early exit when the run is not PENDING', () => {
    // Every status but PENDING must skip, because PENDING is the only one the
    // handler's own transition can start from. Anything that falls through
    // instead throws an optimistic-lock error, which the consumer retries to
    // exhaustion and dead-letters — an incident-shaped record of a no-op.
    //
    // EXPIRED: the sweeper reaped a wedged run whose outbox entry was still
    // live. RUNNING: this job was claimed twice, which happens whenever a graph
    // run outlasts the outbox's 10-minute lock. Neither was covered while the
    // guard enumerated FAILED/COMPLETED.
    it.each([
      ['FAILED', AnalysisRunStatus.FAILED],
      ['COMPLETED', AnalysisRunStatus.COMPLETED],
      ['EXPIRED', AnalysisRunStatus.EXPIRED],
      ['DELETED', AnalysisRunStatus.DELETED],
      ['RUNNING', AnalysisRunStatus.RUNNING],
      ['AWAITING_INPUT', AnalysisRunStatus.AWAITING_INPUT],
    ])('should return early without throwing when run is %s', async (_label, status) => {
      const findRunById = jest.fn().mockResolvedValue(makeRun(status));
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

  describe('payload passthrough', () => {
    it('seeds the graph with every field the outbox payload carries', async () => {
      const startGraph = jest.fn().mockResolvedValue(null);
      const payload = makePayload();

      const { handler } = createHandler({ startGraph });
      await handler.handle(payload);

      // Asserted as a whole object, not field-by-field: `entryType` is the
      // trainee's chosen type and the graph's only source for it, and a dropped
      // field would otherwise reach `getTemplateForEntryType` as `undefined` and
      // throw mid-run. `threadId` is renamed from `langGraphThreadId` on the way
      // through, so it is spelled out rather than spread.
      expect(startGraph).toHaveBeenCalledWith({
        conversationId: payload.conversationId,
        artefactId: payload.artefactId,
        userId: payload.userId,
        specialty: payload.specialty,
        trainingStage: payload.trainingStage,
        entryType: payload.entryType,
        threadId: payload.langGraphThreadId,
      });
    });

    it('defaults a missing trainingStage to empty rather than passing undefined', async () => {
      const startGraph = jest.fn().mockResolvedValue(null);

      const { handler } = createHandler({ startGraph });
      await handler.handle(makePayload({ trainingStage: undefined }));

      expect(startGraph).toHaveBeenCalledWith(
        expect.objectContaining({ trainingStage: '' })
      );
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
        startGraph: jest.fn().mockResolvedValue('ask_followup'),
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
        startGraph: jest.fn().mockResolvedValue('ask_followup'),
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
        startGraph: jest.fn().mockResolvedValue('ask_followup'),
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
        expect.any(Types.ObjectId), // userId — ownership predicate
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
