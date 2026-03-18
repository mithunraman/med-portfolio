import { AnalysisRunStatus } from '@acme/shared';
import { Types } from 'mongoose';
import { AnalysisRunsService } from '../../../analysis-runs/analysis-runs.service';
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

function createHandler(overrides: {
  findRunById?: jest.Mock;
  transitionStatus?: jest.Mock;
  resumeGraph?: jest.Mock;
} = {}) {
  const analysisRunsService = {
    findRunById: overrides.findRunById ?? jest.fn().mockResolvedValue(makeRun(AnalysisRunStatus.AWAITING_INPUT)),
    transitionStatus: overrides.transitionStatus ?? jest.fn().mockResolvedValue({}),
  } as unknown as AnalysisRunsService;

  const portfolioGraphService = {
    resumeGraph: overrides.resumeGraph ?? jest.fn().mockResolvedValue(null),
  } as unknown as PortfolioGraphService;

  return new AnalysisResumeHandler(analysisRunsService, portfolioGraphService);
}

// ── Tests ──

describe('AnalysisResumeHandler', () => {
  describe('early exit for terminal runs', () => {
    it('should return early without throwing when run is FAILED', async () => {
      const findRunById = jest.fn().mockResolvedValue(makeRun(AnalysisRunStatus.FAILED));
      const transitionStatus = jest.fn();
      const resumeGraph = jest.fn();

      const handler = createHandler({ findRunById, transitionStatus, resumeGraph });

      await expect(handler.handle(makePayload())).resolves.toBeUndefined();
      expect(transitionStatus).not.toHaveBeenCalled();
      expect(resumeGraph).not.toHaveBeenCalled();
    });

    it('should return early without throwing when run is COMPLETED', async () => {
      const findRunById = jest.fn().mockResolvedValue(makeRun(AnalysisRunStatus.COMPLETED));
      const transitionStatus = jest.fn();
      const resumeGraph = jest.fn();

      const handler = createHandler({ findRunById, transitionStatus, resumeGraph });

      await expect(handler.handle(makePayload())).resolves.toBeUndefined();
      expect(transitionStatus).not.toHaveBeenCalled();
      expect(resumeGraph).not.toHaveBeenCalled();
    });

    it('should return early when run does not exist', async () => {
      const findRunById = jest.fn().mockResolvedValue(null);
      const transitionStatus = jest.fn();
      const resumeGraph = jest.fn();

      const handler = createHandler({ findRunById, transitionStatus, resumeGraph });

      await expect(handler.handle(makePayload())).resolves.toBeUndefined();
      expect(transitionStatus).not.toHaveBeenCalled();
      expect(resumeGraph).not.toHaveBeenCalled();
    });

    it('should proceed normally when run is AWAITING_INPUT', async () => {
      const findRunById = jest.fn().mockResolvedValue(makeRun(AnalysisRunStatus.AWAITING_INPUT));
      const transitionStatus = jest.fn().mockResolvedValue({});
      const resumeGraph = jest.fn().mockResolvedValue(null);

      const handler = createHandler({ findRunById, transitionStatus, resumeGraph });
      await handler.handle(makePayload());

      expect(transitionStatus).toHaveBeenCalled();
      expect(resumeGraph).toHaveBeenCalled();
    });
  });
});
