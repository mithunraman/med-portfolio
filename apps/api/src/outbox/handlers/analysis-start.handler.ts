import { AnalysisRunStatus } from '@acme/shared';
import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { AnalysisRunsService } from '../../analysis-runs/analysis-runs.service';
import { PortfolioGraphService } from '../../portfolio-graph/portfolio-graph.service';
import type { OutboxHandler } from '../outbox.consumer';

export interface AnalysisStartPayload {
  analysisRunId: string;
  conversationId: string;
  artefactId: string;
  userId: string;
  specialty: string;
}

@Injectable()
export class AnalysisStartHandler implements OutboxHandler {
  readonly type = 'analysis.start';
  private readonly logger = new Logger(AnalysisStartHandler.name);

  constructor(
    private readonly analysisRunsService: AnalysisRunsService,
    private readonly portfolioGraphService: PortfolioGraphService,
  ) {}

  async handle(payload: Record<string, unknown>): Promise<void> {
    const data = payload as unknown as AnalysisStartPayload;
    const runId = new Types.ObjectId(data.analysisRunId);

    // Transition run: PENDING → RUNNING
    await this.analysisRunsService.transitionStatus(
      runId,
      AnalysisRunStatus.PENDING,
      AnalysisRunStatus.RUNNING,
    );

    this.logger.log(`Starting graph for analysis run ${data.analysisRunId}`);

    try {
      // Use the existing graph service to invoke LangGraph.
      // Returns GraphPauseResult if paused, null if completed.
      const pauseResult = await this.portfolioGraphService.startGraph({
        conversationId: data.conversationId,
        artefactId: data.artefactId,
        userId: data.userId,
        specialty: data.specialty,
      });

      if (pauseResult) {
        // Graph is waiting for user input
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
          },
        );
      } else {
        // Graph completed (no interrupt hit)
        await this.analysisRunsService.transitionStatus(
          runId,
          AnalysisRunStatus.RUNNING,
          AnalysisRunStatus.COMPLETED,
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Graph start failed for run ${data.analysisRunId}: ${errorMessage}`);

      // Transition to FAILED — but only if still RUNNING (avoid double-transition)
      try {
        await this.analysisRunsService.transitionStatus(
          runId,
          AnalysisRunStatus.RUNNING,
          AnalysisRunStatus.FAILED,
          { error: { code: 'GRAPH_START_FAILED', message: errorMessage } },
        );
      } catch {
        // Status may have already changed — log and move on
        this.logger.warn(`Could not transition run ${data.analysisRunId} to FAILED`);
      }

      throw error; // Re-throw so the outbox consumer handles retry
    }
  }
}
