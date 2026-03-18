import { AnalysisRunStatus } from '@acme/shared';
import { Types } from 'mongoose';
import { AnalysisRunsService } from '../../../analysis-runs/analysis-runs.service';
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

function createHandler(overrides: {
  findRunById?: jest.Mock;
  transitionStatus?: jest.Mock;
  startGraph?: jest.Mock;
} = {}) {
  const analysisRunsService = {
    findRunById: overrides.findRunById ?? jest.fn().mockResolvedValue(makeRun(AnalysisRunStatus.PENDING)),
    transitionStatus: overrides.transitionStatus ?? jest.fn().mockResolvedValue({}),
  } as unknown as AnalysisRunsService;

  const portfolioGraphService = {
    startGraph: overrides.startGraph ?? jest.fn().mockResolvedValue(null),
  } as unknown as PortfolioGraphService;

  return new AnalysisStartHandler(analysisRunsService, portfolioGraphService);
}

// ── Tests ──

describe('AnalysisStartHandler', () => {
  describe('early exit for terminal runs', () => {
    it('should return early without throwing when run is FAILED', async () => {
      const findRunById = jest.fn().mockResolvedValue(makeRun(AnalysisRunStatus.FAILED));
      const transitionStatus = jest.fn();
      const startGraph = jest.fn();

      const handler = createHandler({ findRunById, transitionStatus, startGraph });

      await expect(handler.handle(makePayload())).resolves.toBeUndefined();
      expect(transitionStatus).not.toHaveBeenCalled();
      expect(startGraph).not.toHaveBeenCalled();
    });

    it('should return early without throwing when run is COMPLETED', async () => {
      const findRunById = jest.fn().mockResolvedValue(makeRun(AnalysisRunStatus.COMPLETED));
      const transitionStatus = jest.fn();
      const startGraph = jest.fn();

      const handler = createHandler({ findRunById, transitionStatus, startGraph });

      await expect(handler.handle(makePayload())).resolves.toBeUndefined();
      expect(transitionStatus).not.toHaveBeenCalled();
      expect(startGraph).not.toHaveBeenCalled();
    });

    it('should return early when run does not exist', async () => {
      const findRunById = jest.fn().mockResolvedValue(null);
      const transitionStatus = jest.fn();
      const startGraph = jest.fn();

      const handler = createHandler({ findRunById, transitionStatus, startGraph });

      await expect(handler.handle(makePayload())).resolves.toBeUndefined();
      expect(transitionStatus).not.toHaveBeenCalled();
      expect(startGraph).not.toHaveBeenCalled();
    });

    it('should proceed normally when run is PENDING', async () => {
      const findRunById = jest.fn().mockResolvedValue(makeRun(AnalysisRunStatus.PENDING));
      const transitionStatus = jest.fn().mockResolvedValue({});
      const startGraph = jest.fn().mockResolvedValue(null);

      const handler = createHandler({ findRunById, transitionStatus, startGraph });
      await handler.handle(makePayload());

      expect(transitionStatus).toHaveBeenCalled();
      expect(startGraph).toHaveBeenCalled();
    });
  });
});
