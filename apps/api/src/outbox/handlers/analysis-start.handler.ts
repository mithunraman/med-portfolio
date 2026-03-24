import { AnalysisRunStatus, ArtefactStatus } from '@acme/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { AnalysisRunsService } from '../../analysis-runs/analysis-runs.service';
import {
  ARTEFACTS_REPOSITORY,
  IArtefactsRepository,
} from '../../artefacts/artefacts.repository.interface';
import {
  CONVERSATIONS_REPOSITORY,
  IConversationsRepository,
} from '../../conversations/conversations.repository.interface';
import { TransactionService } from '../../database/transaction.service';
import {
  IPdpGoalsRepository,
  PDP_GOALS_REPOSITORY,
} from '../../pdp-goals/pdp-goals.repository.interface';
import { PortfolioGraphService } from '../../portfolio-graph/portfolio-graph.service';
import type { OutboxHandler } from '../outbox.consumer';

export interface AnalysisStartPayload {
  analysisRunId: string;
  conversationId: string;
  artefactId: string;
  userId: string;
  specialty: string;
  trainingStage: string;
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
    @Inject(ARTEFACTS_REPOSITORY)
    private readonly artefactsRepository: IArtefactsRepository,
    @Inject(PDP_GOALS_REPOSITORY)
    private readonly pdpGoalsRepository: IPdpGoalsRepository,
  ) {}

  async handle(payload: Record<string, unknown>): Promise<void> {
    const data = payload as unknown as AnalysisStartPayload;
    const runId = new Types.ObjectId(data.analysisRunId);
    const threadId = data.langGraphThreadId;

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
        trainingStage: data.trainingStage ?? '',
        threadId,
      });

      if (pausedNode) {
        await this.handleInterrupt(data, runId, threadId);
      } else {
        await this.handleCompletion(runId, threadId);
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

  /**
   * Handle graph completion: save artefact + PDP goals + transition to COMPLETED
   * in a single transaction. Idempotent via delete-then-create for PDP goals
   * and overwrite for artefact update.
   */
  private async handleCompletion(
    runId: Types.ObjectId,
    threadId: string,
  ): Promise<void> {
    const finalState = await this.portfolioGraphService.getFinalState(threadId);

    await this.transactionService.withTransaction(async (session) => {
      const artefactOid = new Types.ObjectId(finalState.artefactId);
      const userOid = new Types.ObjectId(finalState.userId);

      // Artefact update (idempotent — overwrites same doc)
      const artefactResult = await this.artefactsRepository.updateArtefactById(
        artefactOid,
        {
          artefactType: finalState.entryType,
          title: finalState.title,
          reflection: finalState.reflection,
          capabilities: finalState.capabilities.map((c) => ({
            code: c.code,
            evidence: c.reasoning,
          })),
          status: ArtefactStatus.IN_REVIEW,
        },
        session,
      );
      if (!artefactResult.ok) throw new Error(artefactResult.error.message);

      // Delete-then-create for PDP goals (idempotent on replay)
      const deleteResult = await this.pdpGoalsRepository.deleteByArtefactId(artefactOid, session);
      if (!deleteResult.ok) throw new Error(deleteResult.error.message);

      if (finalState.pdpGoals.length > 0) {
        const pdpResult = await this.pdpGoalsRepository.create(
          finalState.pdpGoals.map((g) => ({
            userId: userOid,
            artefactId: artefactOid,
            goal: g.goal,
            actions: g.actions.map((a) => ({
              action: a.action,
              intendedEvidence: a.intendedEvidence,
            })),
          })),
          session,
        );
        if (!pdpResult.ok) throw new Error(pdpResult.error.message);
      }

      // Status transition in same transaction
      await this.analysisRunsService.transitionStatus(
        runId,
        AnalysisRunStatus.RUNNING,
        AnalysisRunStatus.COMPLETED,
        { currentStep: null },
        session,
      );
    }, { context: 'start-handler-completion' });
  }
}
