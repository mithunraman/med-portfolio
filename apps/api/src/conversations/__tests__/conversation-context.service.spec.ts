import { AnalysisRunStatus, ConversationStatus } from '@acme/shared';
import { Types } from 'mongoose';
import type { AnalysisRun } from '../../analysis-runs/schemas/analysis-run.schema';
import { err, ok } from '../../common/utils/result.util';
import { ConversationContextService } from '../conversation-context.service';

// ── Helpers ──

const oid = () => new Types.ObjectId();
const conversationOid = oid();

function makeRun(overrides: Partial<AnalysisRun> = {}): AnalysisRun {
  return {
    _id: oid(),
    xid: 'run_abc123',
    conversationId: conversationOid,
    runNumber: 1,
    status: AnalysisRunStatus.PENDING,
    snapshotRange: { fromMessageId: null, toMessageId: null },
    currentQuestion: null,
    artefactId: null,
    idempotencyKey: 'key',
    langGraphThreadId: 'thread-1',
    error: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as AnalysisRun;
}

function makeCurrentQuestion(
  questionType: 'single_select' | 'multi_select' | 'free_text' = 'free_text'
) {
  return { messageId: oid(), node: 'classify', questionType };
}

// ── Mocks ──

const mockRepo = {
  hasProcessingMessages: jest.fn(),
  hasCompleteMessages: jest.fn(),
};

const mockAnalysisRunsService = {
  findLatestRun: jest.fn(),
};

function createService(): ConversationContextService {
  return new ConversationContextService(mockRepo as any, mockAnalysisRunsService as any);
}

// ── Tests ──

describe('ConversationContextService', () => {
  let service: ConversationContextService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = createService();
  });

  // ─── Phase: closed ───

  describe('when conversation is CLOSED', () => {
    it('returns phase "closed" with all actions denied', async () => {
      const ctx = await service.computeContext(conversationOid, ConversationStatus.CLOSED);

      expect(ctx.phase).toBe('closed');
      expect(ctx.actions.sendMessage).toEqual({
        allowed: false,
        code: 'CONVERSATION_CLOSED',
        reason: expect.any(String),
      });
      expect(ctx.actions.sendAudio).toEqual({
        allowed: false,
        code: 'CONVERSATION_CLOSED',
        reason: expect.any(String),
      });
      expect(ctx.actions.startAnalysis).toEqual({
        allowed: false,
        code: 'CONVERSATION_CLOSED',
        reason: expect.any(String),
      });
      expect(ctx.actions.resumeAnalysis).toEqual({
        allowed: false,
        code: 'CONVERSATION_CLOSED',
        reason: expect.any(String),
      });
    });

    it('does not query analysis runs or messages', async () => {
      await service.computeContext(conversationOid, ConversationStatus.CLOSED);

      expect(mockAnalysisRunsService.findLatestRun).not.toHaveBeenCalled();
      expect(mockRepo.hasProcessingMessages).not.toHaveBeenCalled();
      expect(mockRepo.hasCompleteMessages).not.toHaveBeenCalled();
    });
  });

  // ─── Phase: composing (no run) ───

  describe('when no analysis run exists', () => {
    beforeEach(() => {
      mockAnalysisRunsService.findLatestRun.mockResolvedValue(null);
    });

    it('returns phase "composing"', async () => {
      mockRepo.hasProcessingMessages.mockResolvedValue(ok(false));
      mockRepo.hasCompleteMessages.mockResolvedValue(ok(true));

      const ctx = await service.computeContext(conversationOid, ConversationStatus.ACTIVE);
      expect(ctx.phase).toBe('composing');
    });

    it('allows sendMessage and sendAudio', async () => {
      mockRepo.hasProcessingMessages.mockResolvedValue(ok(false));
      mockRepo.hasCompleteMessages.mockResolvedValue(ok(true));

      const ctx = await service.computeContext(conversationOid, ConversationStatus.ACTIVE);
      expect(ctx.actions.sendMessage).toEqual({ allowed: true });
      expect(ctx.actions.sendAudio).toEqual({ allowed: true });
    });

    it('allows startAnalysis when messages are complete and none processing', async () => {
      mockRepo.hasProcessingMessages.mockResolvedValue(ok(false));
      mockRepo.hasCompleteMessages.mockResolvedValue(ok(true));

      const ctx = await service.computeContext(conversationOid, ConversationStatus.ACTIVE);
      expect(ctx.actions.startAnalysis).toEqual({ allowed: true });
    });

    it('denies startAnalysis when messages are still processing', async () => {
      mockRepo.hasProcessingMessages.mockResolvedValue(ok(true));
      mockRepo.hasCompleteMessages.mockResolvedValue(ok(true));

      const ctx = await service.computeContext(conversationOid, ConversationStatus.ACTIVE);
      expect(ctx.actions.startAnalysis).toEqual({
        allowed: false,
        code: 'MESSAGES_PROCESSING',
        reason: expect.any(String),
      });
    });

    it('denies startAnalysis when no complete messages exist', async () => {
      mockRepo.hasProcessingMessages.mockResolvedValue(ok(false));
      mockRepo.hasCompleteMessages.mockResolvedValue(ok(false));

      const ctx = await service.computeContext(conversationOid, ConversationStatus.ACTIVE);
      expect(ctx.actions.startAnalysis).toEqual({
        allowed: false,
        code: 'NO_MESSAGES',
        reason: expect.any(String),
      });
    });

    it('denies resumeAnalysis (no active question)', async () => {
      mockRepo.hasProcessingMessages.mockResolvedValue(ok(false));
      mockRepo.hasCompleteMessages.mockResolvedValue(ok(true));

      const ctx = await service.computeContext(conversationOid, ConversationStatus.ACTIVE);
      expect(ctx.actions.resumeAnalysis).toEqual({
        allowed: false,
        code: 'NO_ACTIVE_QUESTION',
        reason: expect.any(String),
      });
    });

    it('does not include analysisRun or activeQuestion', async () => {
      mockRepo.hasProcessingMessages.mockResolvedValue(ok(false));
      mockRepo.hasCompleteMessages.mockResolvedValue(ok(true));

      const ctx = await service.computeContext(conversationOid, ConversationStatus.ACTIVE);
      expect(ctx.analysisRun).toBeUndefined();
      expect(ctx.activeQuestion).toBeUndefined();
    });
  });

  // ─── Phase: composing (failed run) ───

  describe('when latest run is FAILED', () => {
    beforeEach(() => {
      mockAnalysisRunsService.findLatestRun.mockResolvedValue(
        makeRun({ status: AnalysisRunStatus.FAILED })
      );
      mockRepo.hasProcessingMessages.mockResolvedValue(ok(false));
      mockRepo.hasCompleteMessages.mockResolvedValue(ok(true));
    });

    it('returns phase "composing" (allows retry)', async () => {
      const ctx = await service.computeContext(conversationOid, ConversationStatus.ACTIVE);
      expect(ctx.phase).toBe('composing');
    });

    it('allows startAnalysis (retry after failure)', async () => {
      const ctx = await service.computeContext(conversationOid, ConversationStatus.ACTIVE);
      expect(ctx.actions.startAnalysis).toEqual({ allowed: true });
    });

    it('includes analysisRun summary', async () => {
      const ctx = await service.computeContext(conversationOid, ConversationStatus.ACTIVE);
      expect(ctx.analysisRun).toEqual({
        id: 'run_abc123',
        status: AnalysisRunStatus.FAILED,
      });
    });
  });

  // ─── Phase: composing (completed run — should deny startAnalysis) ───

  describe('when latest run is COMPLETED and phase falls to composing check', () => {
    // COMPLETED maps to "completed" phase, not "composing" — this tests that path
    beforeEach(() => {
      mockAnalysisRunsService.findLatestRun.mockResolvedValue(
        makeRun({ status: AnalysisRunStatus.COMPLETED })
      );
    });

    it('returns phase "completed"', async () => {
      const ctx = await service.computeContext(conversationOid, ConversationStatus.ACTIVE);
      expect(ctx.phase).toBe('completed');
    });

    it('does not query message state (not in composing phase)', async () => {
      await service.computeContext(conversationOid, ConversationStatus.ACTIVE);
      expect(mockRepo.hasProcessingMessages).not.toHaveBeenCalled();
      expect(mockRepo.hasCompleteMessages).not.toHaveBeenCalled();
    });
  });

  // ─── Phase: analysing ───

  describe.each([
    ['PENDING', AnalysisRunStatus.PENDING],
    ['RUNNING', AnalysisRunStatus.RUNNING],
  ])('when latest run is %s', (_label, status) => {
    beforeEach(() => {
      mockAnalysisRunsService.findLatestRun.mockResolvedValue(makeRun({ status }));
    });

    it('returns phase "analysing"', async () => {
      const ctx = await service.computeContext(conversationOid, ConversationStatus.ACTIVE);
      expect(ctx.phase).toBe('analysing');
    });

    it('denies all actions', async () => {
      const ctx = await service.computeContext(conversationOid, ConversationStatus.ACTIVE);
      expect(ctx.actions.sendMessage.allowed).toBe(false);
      expect(ctx.actions.sendAudio.allowed).toBe(false);
      expect(ctx.actions.startAnalysis.allowed).toBe(false);
      expect(ctx.actions.resumeAnalysis.allowed).toBe(false);
    });

    it('does not query message state', async () => {
      await service.computeContext(conversationOid, ConversationStatus.ACTIVE);
      expect(mockRepo.hasProcessingMessages).not.toHaveBeenCalled();
    });
  });

  // ─── Phase: awaiting_input ───

  describe('when latest run is AWAITING_INPUT', () => {
    describe('with free_text question', () => {
      beforeEach(() => {
        mockAnalysisRunsService.findLatestRun.mockResolvedValue(
          makeRun({
            status: AnalysisRunStatus.AWAITING_INPUT,
            currentQuestion: makeCurrentQuestion('free_text'),
          })
        );
      });

      it('returns phase "awaiting_input"', async () => {
        const ctx = await service.computeContext(conversationOid, ConversationStatus.ACTIVE);
        expect(ctx.phase).toBe('awaiting_input');
      });

      it('allows sendMessage and sendAudio for free_text', async () => {
        const ctx = await service.computeContext(conversationOid, ConversationStatus.ACTIVE);
        expect(ctx.actions.sendMessage).toEqual({ allowed: true });
        expect(ctx.actions.sendAudio).toEqual({ allowed: true });
      });

      it('allows resumeAnalysis', async () => {
        const ctx = await service.computeContext(conversationOid, ConversationStatus.ACTIVE);
        expect(ctx.actions.resumeAnalysis).toEqual({ allowed: true });
      });

      it('denies startAnalysis', async () => {
        const ctx = await service.computeContext(conversationOid, ConversationStatus.ACTIVE);
        expect(ctx.actions.startAnalysis.allowed).toBe(false);
        expect(ctx.actions.startAnalysis.code).toBe('ANALYSIS_RUNNING');
      });

      it('includes activeQuestion with messageId and questionType', async () => {
        const ctx = await service.computeContext(conversationOid, ConversationStatus.ACTIVE);
        expect(ctx.activeQuestion).toEqual({
          messageId: expect.any(String),
          questionType: 'free_text',
        });
      });

      it('includes analysisRun summary', async () => {
        const ctx = await service.computeContext(conversationOid, ConversationStatus.ACTIVE);
        expect(ctx.analysisRun).toEqual({
          id: 'run_abc123',
          status: AnalysisRunStatus.AWAITING_INPUT,
        });
      });
    });

    describe('with single_select question', () => {
      beforeEach(() => {
        mockAnalysisRunsService.findLatestRun.mockResolvedValue(
          makeRun({
            status: AnalysisRunStatus.AWAITING_INPUT,
            currentQuestion: makeCurrentQuestion('single_select'),
          })
        );
      });

      it('denies sendMessage and sendAudio for structured input', async () => {
        const ctx = await service.computeContext(conversationOid, ConversationStatus.ACTIVE);
        expect(ctx.actions.sendMessage).toEqual({
          allowed: false,
          code: 'STRUCTURED_INPUT_REQUIRED',
          reason: expect.any(String),
        });
        expect(ctx.actions.sendAudio).toEqual({
          allowed: false,
          code: 'STRUCTURED_INPUT_REQUIRED',
          reason: expect.any(String),
        });
      });

      it('still allows resumeAnalysis', async () => {
        const ctx = await service.computeContext(conversationOid, ConversationStatus.ACTIVE);
        expect(ctx.actions.resumeAnalysis).toEqual({ allowed: true });
      });

      it('returns correct activeQuestion type', async () => {
        const ctx = await service.computeContext(conversationOid, ConversationStatus.ACTIVE);
        expect(ctx.activeQuestion?.questionType).toBe('single_select');
      });
    });

    describe('with multi_select question', () => {
      beforeEach(() => {
        mockAnalysisRunsService.findLatestRun.mockResolvedValue(
          makeRun({
            status: AnalysisRunStatus.AWAITING_INPUT,
            currentQuestion: makeCurrentQuestion('multi_select'),
          })
        );
      });

      it('denies sendMessage for structured input', async () => {
        const ctx = await service.computeContext(conversationOid, ConversationStatus.ACTIVE);
        expect(ctx.actions.sendMessage.allowed).toBe(false);
        expect(ctx.actions.sendMessage.code).toBe('STRUCTURED_INPUT_REQUIRED');
      });

      it('returns correct activeQuestion type', async () => {
        const ctx = await service.computeContext(conversationOid, ConversationStatus.ACTIVE);
        expect(ctx.activeQuestion?.questionType).toBe('multi_select');
      });
    });
  });

  // ─── Phase: completed ───

  describe('when latest run is COMPLETED', () => {
    beforeEach(() => {
      mockAnalysisRunsService.findLatestRun.mockResolvedValue(
        makeRun({ status: AnalysisRunStatus.COMPLETED })
      );
    });

    it('returns phase "completed"', async () => {
      const ctx = await service.computeContext(conversationOid, ConversationStatus.ACTIVE);
      expect(ctx.phase).toBe('completed');
    });

    it('denies all actions', async () => {
      const ctx = await service.computeContext(conversationOid, ConversationStatus.ACTIVE);
      expect(ctx.actions.sendMessage.allowed).toBe(false);
      expect(ctx.actions.sendAudio.allowed).toBe(false);
      expect(ctx.actions.startAnalysis.allowed).toBe(false);
      expect(ctx.actions.resumeAnalysis.allowed).toBe(false);
    });

    it('uses ANALYSIS_COMPLETE codes', async () => {
      const ctx = await service.computeContext(conversationOid, ConversationStatus.ACTIVE);
      expect(ctx.actions.sendMessage.code).toBe('ANALYSIS_COMPLETE');
      expect(ctx.actions.startAnalysis.code).toBe('ANALYSIS_COMPLETE');
    });

    it('does not include activeQuestion', async () => {
      const ctx = await service.computeContext(conversationOid, ConversationStatus.ACTIVE);
      expect(ctx.activeQuestion).toBeUndefined();
    });

    it('includes analysisRun summary', async () => {
      const ctx = await service.computeContext(conversationOid, ConversationStatus.ACTIVE);
      expect(ctx.analysisRun).toEqual({
        id: 'run_abc123',
        status: AnalysisRunStatus.COMPLETED,
      });
    });
  });

  // ─── Edge: activeQuestion guards ───

  describe('activeQuestion edge cases', () => {
    it('returns undefined when AWAITING_INPUT but currentQuestion is null', async () => {
      mockAnalysisRunsService.findLatestRun.mockResolvedValue(
        makeRun({
          status: AnalysisRunStatus.AWAITING_INPUT,
          currentQuestion: null,
        })
      );

      const ctx = await service.computeContext(conversationOid, ConversationStatus.ACTIVE);
      expect(ctx.activeQuestion).toBeUndefined();
    });

    it('returns undefined when run has currentQuestion but status is not AWAITING_INPUT', async () => {
      mockAnalysisRunsService.findLatestRun.mockResolvedValue(
        makeRun({
          status: AnalysisRunStatus.RUNNING,
          currentQuestion: makeCurrentQuestion('free_text'),
        })
      );

      const ctx = await service.computeContext(conversationOid, ConversationStatus.ACTIVE);
      expect(ctx.activeQuestion).toBeUndefined();
    });

    it('returns undefined when currentQuestion has no questionType', async () => {
      mockAnalysisRunsService.findLatestRun.mockResolvedValue(
        makeRun({
          status: AnalysisRunStatus.AWAITING_INPUT,
          currentQuestion: {
            messageId: oid(),
            node: 'classify',
            questionType: undefined as any,
          },
        })
      );

      const ctx = await service.computeContext(conversationOid, ConversationStatus.ACTIVE);
      expect(ctx.activeQuestion).toBeUndefined();
    });
  });

  // ─── Edge: repo errors treated as false ───

  describe('when repository calls return errors', () => {
    beforeEach(() => {
      mockAnalysisRunsService.findLatestRun.mockResolvedValue(null);
    });

    it('treats hasProcessingMessages error as false', async () => {
      mockRepo.hasProcessingMessages.mockResolvedValue(err({ code: 'DB_ERROR', message: 'fail' }));
      mockRepo.hasCompleteMessages.mockResolvedValue(ok(true));

      const ctx = await service.computeContext(conversationOid, ConversationStatus.ACTIVE);
      // hasProcessing = false (error), hasComplete = true → startAnalysis allowed
      expect(ctx.actions.startAnalysis).toEqual({ allowed: true });
    });

    it('treats hasCompleteMessages error as false', async () => {
      mockRepo.hasProcessingMessages.mockResolvedValue(ok(false));
      mockRepo.hasCompleteMessages.mockResolvedValue(err({ code: 'DB_ERROR', message: 'fail' }));

      const ctx = await service.computeContext(conversationOid, ConversationStatus.ACTIVE);
      // hasProcessing = false, hasComplete = false (error) → NO_MESSAGES
      expect(ctx.actions.startAnalysis.code).toBe('NO_MESSAGES');
    });
  });
});
