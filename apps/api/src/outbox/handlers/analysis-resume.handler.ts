import { AnalysisRunStatus, TERMINAL_RUN_STATUSES } from '@acme/shared';
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
import { AnalysisCompletionService } from '../analysis-completion.service';
import type { OutboxHandler } from '../outbox.consumer';
import { requiredObjectId } from './payload.util';

export interface AnalysisResumePayload {
  analysisRunId: string;
  conversationId: string;
  userId: string;
  node: InterruptNode;
  resumeValue?: Record<string, unknown> | true;
  langGraphThreadId: string;
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
    private readonly completionService: AnalysisCompletionService,
  ) {}

  async handle(payload: Record<string, unknown>): Promise<void> {
    const data = payload as unknown as AnalysisResumePayload;
    // Validated, not cast — see `requiredObjectId`. An absent id would otherwise
    // be minted, match no run, and complete the job as a no-op.
    const runId = requiredObjectId(payload, 'analysisRunId', this.type);
    const userOid = requiredObjectId(payload, 'userId', this.type);
    const threadId = data.langGraphThreadId;

    // Same guard as AnalysisStartHandler, keyed to this handler's own starting
    // status — see the comment there for why it is stated as the expected
    // status rather than a list of finished ones.
    const run = await this.analysisRunsService.findRunById(runId, userOid);
    if (!run) return;
    if (run.status !== AnalysisRunStatus.AWAITING_INPUT) {
      const message = `Run ${data.analysisRunId} is ${run.status}, not AWAITING_INPUT — skipping resume`;
      if (TERMINAL_RUN_STATUSES.has(run.status)) {
        this.logger.log(message);
      } else {
        this.logger.warn(`${message} (concurrent claim?)`);
      }
      return;
    }

    // Transition run: AWAITING_INPUT → RUNNING
    await this.analysisRunsService.transitionStatus(
      runId,
      userOid,
      AnalysisRunStatus.AWAITING_INPUT,
      AnalysisRunStatus.RUNNING,
      { currentQuestion: null, currentStep: null }
    );

    this.logger.log(`Resuming graph for analysis run ${data.analysisRunId} at node "${data.node}"`);

    try {
      // Resume the graph. Type-safe dispatch based on node type.
      let pausedNode: InterruptNode | null;
      switch (data.node) {
        case 'ask_followup':
          pausedNode = await this.portfolioGraphService.resumeGraph(
            threadId,
            'ask_followup'
          );
          break;
        case 'present_capabilities':
          pausedNode = await this.portfolioGraphService.resumeGraph(
            threadId,
            'present_capabilities',
            data.resumeValue as { selectedCodes: string[] }
          );
          break;
        case 'reject_entry':
          // Terminal: pauses with an informational message and presents no answerable
          // question. The API rejects resumes of terminal questions, so an enqueued
          // payload naming this node means something bypassed that check.
          throw new Error(`Cannot resume graph at terminal node "${data.node}"`);
        default: {
          // Exhaustiveness: `data.node` narrows to `never` only while every
          // InterruptNode is handled above — adding one without wiring it here is a
          // COMPILE error, not a 3am one. The throw still runs, because `data` is
          // cast from an untyped outbox payload: a job enqueued by an older deploy
          // can name a node that no longer exists, and falling through silently
          // would complete the run without ever resuming it.
          const unhandled: never = data.node;
          throw new Error(`Unknown interrupt node "${String(unhandled)}"`);
        }
      }

      if (pausedNode) {
        await this.handleInterrupt(runId, userOid, threadId);
      } else {
        await this.completionService.persistCompletion(
          runId,
          userOid,
          threadId,
          'resume-handler-completion',
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Graph resume failed for run ${data.analysisRunId}: ${errorMessage}`);

      try {
        await this.analysisRunsService.transitionStatus(
          runId,
          userOid,
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

  /**
   * Handle graph pausing at an interrupt: create ASSISTANT question message
   * and transition to AWAITING_INPUT atomically.
   */
  private async handleInterrupt(
    runId: Types.ObjectId,
    userOid: Types.ObjectId,
    threadId: string,
  ): Promise<void> {
    const interruptPayload = await this.portfolioGraphService.getInterruptPayload(threadId);
    if (!interruptPayload) {
      throw new Error(`Graph paused but no interrupt payload found`);
    }

    // Check-before-create (idempotency)
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
        userOid,
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
          userOid,
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
  }
}
