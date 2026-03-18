import { AnalysisRunStatus } from '@acme/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { AnalysisRunsService } from '../../analysis-runs/analysis-runs.service';
import {
  CONVERSATIONS_REPOSITORY,
  IConversationsRepository,
} from '../../conversations/conversations.repository.interface';
import { TransactionService } from '../../database/transaction.service';
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
    private readonly transactionService: TransactionService,
    @Inject(CONVERSATIONS_REPOSITORY)
    private readonly conversationsRepository: IConversationsRepository,
  ) {}

  async handle(payload: Record<string, unknown>): Promise<void> {
    const data = payload as unknown as AnalysisResumePayload;
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

    // Transition run: AWAITING_INPUT → RUNNING
    await this.analysisRunsService.transitionStatus(
      runId,
      AnalysisRunStatus.AWAITING_INPUT,
      AnalysisRunStatus.RUNNING,
      { currentQuestion: null, currentStep: null }
    );

    this.logger.log(`Resuming graph for analysis run ${data.analysisRunId} at node "${data.node}"`);

    try {
      // Resume the graph using the existing service.
      // Type-safe dispatch based on node type.
      let pausedNode: InterruptNode | null;
      switch (data.node) {
        case 'ask_followup':
          pausedNode = await this.portfolioGraphService.resumeGraph(
            data.conversationId,
            'ask_followup'
          );
          break;
        case 'present_classification':
          pausedNode = await this.portfolioGraphService.resumeGraph(
            data.conversationId,
            'present_classification',
            data.resumeValue as { entryType: string }
          );
          break;
        case 'present_capabilities':
          pausedNode = await this.portfolioGraphService.resumeGraph(
            data.conversationId,
            'present_capabilities',
            data.resumeValue as { selectedCodes: string[] }
          );
          break;
      }

      if (pausedNode) {
        const interruptPayload = await this.portfolioGraphService.getInterruptPayload(
          data.conversationId,
        );
        if (!interruptPayload) {
          throw new Error(`Graph paused at ${pausedNode} but no interrupt payload found`);
        }

        // Check-before-create (idempotency): if message already exists from a
        // previous attempt, just transition status without creating a duplicate.
        // userId comes from graph state via the interrupt payload's messageData.
        const existingResult =
          await this.conversationsRepository.findMessageByIdempotencyKey(
            interruptPayload.messageData.userId,
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
            }
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
          }, { context: 'resume-handler-interrupt' });
        }
      } else {
        await this.analysisRunsService.transitionStatus(
          runId,
          AnalysisRunStatus.RUNNING,
          AnalysisRunStatus.COMPLETED,
          { currentStep: null }
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
          { error: { code: 'GRAPH_RESUME_FAILED', message: errorMessage }, currentStep: null }
        );
      } catch {
        this.logger.warn(`Could not transition run ${data.analysisRunId} to FAILED`);
      }

      throw error; // Re-throw so the outbox consumer handles retry
    }
  }
}
