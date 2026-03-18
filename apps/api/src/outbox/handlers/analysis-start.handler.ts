import { AnalysisRunStatus } from '@acme/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { AnalysisRunsService } from '../../analysis-runs/analysis-runs.service';
import {
  CONVERSATIONS_REPOSITORY,
  IConversationsRepository,
} from '../../conversations/conversations.repository.interface';
import { TransactionService } from '../../database/transaction.service';
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
    private readonly transactionService: TransactionService,
    @Inject(CONVERSATIONS_REPOSITORY)
    private readonly conversationsRepository: IConversationsRepository,
  ) {}

  async handle(payload: Record<string, unknown>): Promise<void> {
    const data = payload as unknown as AnalysisStartPayload;
    const runId = new Types.ObjectId(data.analysisRunId);

    // Early exit: if run is already terminal, skip — prevents wasted retries
    const run = await this.analysisRunsService.findRunById(runId);
    if (!run) return;
    if (
      run.status === AnalysisRunStatus.FAILED ||
      run.status === AnalysisRunStatus.COMPLETED
    ) {
      this.logger.log(`Run ${data.analysisRunId} already ${run.status}, skipping`);
      return;
    }

    // Transition run: PENDING → RUNNING
    await this.analysisRunsService.transitionStatus(
      runId,
      AnalysisRunStatus.PENDING,
      AnalysisRunStatus.RUNNING,
    );

    this.logger.log(`Starting graph for analysis run ${data.analysisRunId}`);

    try {
      const pausedNode = await this.portfolioGraphService.startGraph({
        conversationId: data.conversationId,
        artefactId: data.artefactId,
        userId: data.userId,
        specialty: data.specialty,
      });

      if (pausedNode) {
        const interruptPayload = await this.portfolioGraphService.getInterruptPayload(
          data.conversationId,
        );
        if (!interruptPayload) {
          throw new Error(`Graph paused at ${pausedNode} but no interrupt payload found`);
        }

        // Check-before-create (idempotency): if message already exists from a
        // previous attempt, just transition status without creating a duplicate.
        const userOid = new Types.ObjectId(data.userId);
        const existingResult =
          await this.conversationsRepository.findMessageByIdempotencyKey(
            userOid,
            interruptPayload.idempotencyKey,
          );

        if (existingResult.ok && existingResult.value) {
          this.logger.log(
            `Idempotent hit for interrupt message (key: ${interruptPayload.idempotencyKey}), reusing existing`,
          );
          await this.analysisRunsService.transitionStatus(
            runId,
            AnalysisRunStatus.RUNNING,
            AnalysisRunStatus.AWAITING_INPUT,
            {
              currentQuestion: {
                messageId: existingResult.value._id,
                node: interruptPayload.pausedNode,
                questionType: interruptPayload.questionType,
              },
              currentStep: null,
            },
          );
        } else {
          // Atomic: create message + transition status in one transaction
          await this.transactionService.withTransaction(async (session) => {
            const msgResult = await this.conversationsRepository.createMessage(
              interruptPayload.messageData,
              session,
            );
            if (!msgResult.ok) throw new Error(msgResult.error.message);

            await this.analysisRunsService.transitionStatus(
              runId,
              AnalysisRunStatus.RUNNING,
              AnalysisRunStatus.AWAITING_INPUT,
              {
                currentQuestion: {
                  messageId: msgResult.value._id,
                  node: interruptPayload.pausedNode,
                  questionType: interruptPayload.questionType,
                },
                currentStep: null,
              },
              session,
            );
          }, { context: 'start-handler-interrupt' });
        }
      } else {
        // Graph completed (no interrupt hit)
        await this.analysisRunsService.transitionStatus(
          runId,
          AnalysisRunStatus.RUNNING,
          AnalysisRunStatus.COMPLETED,
          { currentStep: null },
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
          { error: { code: 'GRAPH_START_FAILED', message: errorMessage }, currentStep: null },
        );
      } catch {
        // Status may have already changed — log and move on
        this.logger.warn(`Could not transition run ${data.analysisRunId} to FAILED`);
      }

      throw error; // Re-throw so the outbox consumer handles retry
    }
  }
}
