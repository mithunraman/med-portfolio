import { AnalysisRunStatus, TERMINAL_RUN_STATUSES } from '@acme/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { AnalysisRunsService } from '../../analysis-runs/analysis-runs.service';
import {
  CONVERSATIONS_REPOSITORY,
  IConversationsRepository,
} from '../../conversations/conversations.repository.interface';
import { TransactionService } from '../../database/transaction.service';
import { PortfolioGraphService } from '../../portfolio-graph/portfolio-graph.service';
import { AnalysisCompletionService } from '../analysis-completion.service';
import type { OutboxHandler } from '../outbox.consumer';

export interface AnalysisStartPayload {
  analysisRunId: string;
  conversationId: string;
  artefactId: string;
  userId: string;
  specialty: string;
  trainingStage: string;
  /** The trainee's entry type, chosen at artefact creation and validated there. */
  entryType: string;
  langGraphThreadId: string;
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
    private readonly completionService: AnalysisCompletionService,
  ) {}

  async handle(payload: Record<string, unknown>): Promise<void> {
    const data = payload as unknown as AnalysisStartPayload;
    const runId = new Types.ObjectId(data.analysisRunId);
    const threadId = data.langGraphThreadId;

    // Skip unless the run is in the one status the transition below can start
    // from. Stated as the expected status rather than a list of finished ones:
    // the guard's job is "can that transition succeed", and anything else falls
    // through to an optimistic-lock throw that the consumer retries to
    // exhaustion and dead-letters — an incident-shaped record of a job that had
    // nothing to do. Enumerating terminal statuses covers less than it looks:
    // it misses RUNNING, which a job re-claimed after its 10-minute lock expires
    // (a graph run outlasting DEFAULT_LOCK_DURATION_MS) sees routinely.
    const run = await this.analysisRunsService.findRunById(runId);
    if (!run) return;
    if (run.status !== AnalysisRunStatus.PENDING) {
      // Terminal is routine — a run finished, a queued sibling arrived late.
      // Anything else means this job was claimed twice, which is worth seeing.
      const message = `Run ${data.analysisRunId} is ${run.status}, not PENDING — skipping start`;
      if (TERMINAL_RUN_STATUSES.has(run.status)) {
        this.logger.log(message);
      } else {
        this.logger.warn(`${message} (concurrent claim?)`);
      }
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
        trainingStage: data.trainingStage ?? '',
        entryType: data.entryType,
        threadId,
      });

      if (pausedNode) {
        await this.handleInterrupt(data, runId, threadId);
      } else {
        await this.completionService.persistCompletion(
          runId,
          threadId,
          'start-handler-completion',
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

  /**
   * Handle graph pausing at an interrupt: create ASSISTANT question message
   * and transition to AWAITING_INPUT atomically.
   */
  private async handleInterrupt(
    data: AnalysisStartPayload,
    runId: Types.ObjectId,
    threadId: string,
  ): Promise<void> {
    const interruptPayload = await this.portfolioGraphService.getInterruptPayload(threadId);
    if (!interruptPayload) {
      throw new Error(`Graph paused but no interrupt payload found`);
    }

    // Check-before-create (idempotency)
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
  }
}
