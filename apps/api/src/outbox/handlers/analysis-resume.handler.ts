import { AnalysisRunStatus } from '@acme/shared';
import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { AnalysisRunsService } from '../../analysis-runs/analysis-runs.service';
import {
  type InterruptNode,
  PortfolioGraphService,
} from '../../portfolio-graph/portfolio-graph.service';
import type { OutboxHandler } from '../outbox.consumer';

export interface AnalysisResumePayload {
  analysisRunId: string;
  conversationId: string;
  node: InterruptNode;
  resumeValue?: Record<string, unknown> | true;
}

@Injectable()
export class AnalysisResumeHandler implements OutboxHandler {
  readonly type = 'analysis.resume';
  private readonly logger = new Logger(AnalysisResumeHandler.name);

  constructor(
    private readonly analysisRunsService: AnalysisRunsService,
    private readonly portfolioGraphService: PortfolioGraphService,
  ) {}

  async handle(payload: Record<string, unknown>): Promise<void> {
    const data = payload as unknown as AnalysisResumePayload;
    const runId = new Types.ObjectId(data.analysisRunId);

    // Transition run: AWAITING_INPUT → RUNNING
    await this.analysisRunsService.transitionStatus(
      runId,
      AnalysisRunStatus.AWAITING_INPUT,
      AnalysisRunStatus.RUNNING,
      { currentQuestion: null, thinkingReason: null },
    );

    this.logger.log(
      `Resuming graph for analysis run ${data.analysisRunId} at node "${data.node}"`,
    );

    try {
      // Resume the graph using the existing service.
      // Type-safe dispatch based on node type.
      // Returns GraphPauseResult if the graph pauses again, null if completed.
      let pauseResult;
      switch (data.node) {
        case 'ask_followup':
          pauseResult = await this.portfolioGraphService.resumeGraph(
            data.conversationId,
            'ask_followup',
          );
          break;
        case 'present_classification':
          pauseResult = await this.portfolioGraphService.resumeGraph(
            data.conversationId,
            'present_classification',
            data.resumeValue as { entryType: string },
          );
          break;
        case 'present_capabilities':
          pauseResult = await this.portfolioGraphService.resumeGraph(
            data.conversationId,
            'present_capabilities',
            data.resumeValue as { selectedCodes: string[] },
          );
          break;
      }

      if (pauseResult) {
        await this.analysisRunsService.transitionStatus(
          runId,
          AnalysisRunStatus.RUNNING,
          AnalysisRunStatus.AWAITING_INPUT,
          {
            currentQuestion: {
              messageId: pauseResult.questionMessageId,
              node: pauseResult.pausedNode,
              questionType: pauseResult.questionType,
            },
            thinkingReason: null,
          },
        );
      } else {
        await this.analysisRunsService.transitionStatus(
          runId,
          AnalysisRunStatus.RUNNING,
          AnalysisRunStatus.COMPLETED,
          { thinkingReason: null },
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Graph resume failed for run ${data.analysisRunId}: ${errorMessage}`);

      try {
        await this.analysisRunsService.transitionStatus(
          runId,
          AnalysisRunStatus.RUNNING,
          AnalysisRunStatus.FAILED,
          { error: { code: 'GRAPH_RESUME_FAILED', message: errorMessage }, thinkingReason: null },
        );
      } catch {
        this.logger.warn(`Could not transition run ${data.analysisRunId} to FAILED`);
      }

      throw error; // Re-throw so the outbox consumer handles retry
    }
  }
}
