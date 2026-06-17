import { AnalysisRunStatus, ArtefactStatus } from '@acme/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { AnalysisRunsService } from '../analysis-runs/analysis-runs.service';
import {
  ARTEFACTS_REPOSITORY,
  IArtefactsRepository,
} from '../artefacts/artefacts.repository.interface';
import { TransactionService } from '../database/transaction.service';
import {
  IPdpGoalsRepository,
  PDP_GOALS_REPOSITORY,
} from '../pdp-goals/pdp-goals.repository.interface';
import { deriveCompleteness } from '../portfolio-graph/completeness';
import { PortfolioGraphService } from '../portfolio-graph/portfolio-graph.service';

/**
 * Shared completion-persistence logic for the analysis outbox handlers.
 *
 * Both the start and resume handlers reach the same terminal state — a finished graph
 * whose artefact, PDP goals and run status must be saved atomically. That block used to
 * be copy-pasted in both handlers and had already drifted (the `completeness` field was
 * added to only one). Centralising it here makes the persistence shape single-sourced;
 * the `context` argument keeps the two callers distinguishable in transaction logs.
 */
@Injectable()
export class AnalysisCompletionService {
  private readonly logger = new Logger(AnalysisCompletionService.name);

  constructor(
    private readonly analysisRunsService: AnalysisRunsService,
    private readonly portfolioGraphService: PortfolioGraphService,
    private readonly transactionService: TransactionService,
    @Inject(ARTEFACTS_REPOSITORY)
    private readonly artefactsRepository: IArtefactsRepository,
    @Inject(PDP_GOALS_REPOSITORY)
    private readonly pdpGoalsRepository: IPdpGoalsRepository,
  ) {}

  /**
   * Persist a completed graph run: save artefact + PDP goals + transition the run to
   * COMPLETED in a single transaction. Idempotent via delete-then-create for PDP goals
   * and overwrite for the artefact update.
   *
   * @param context A label for the calling handler, surfaced in transaction logs.
   */
  async persistCompletion(
    runId: Types.ObjectId,
    threadId: string,
    context: string,
  ): Promise<void> {
    const finalState = await this.portfolioGraphService.getFinalState(threadId);

    // If the graph completed without producing an artefact (e.g. irrelevant content),
    // just transition to COMPLETED without saving artefact/PDP data.
    if (!finalState.entryType || !finalState.composedDocument?.length) {
      this.logger.warn(
        `Graph completed without artefact output (entryType: ${finalState.entryType}) — skipping saves`,
      );
      await this.analysisRunsService.transitionStatus(
        runId,
        AnalysisRunStatus.RUNNING,
        AnalysisRunStatus.COMPLETED,
        { currentStep: null },
      );
      return;
    }

    await this.transactionService.withTransaction(
      async (session) => {
        const artefactOid = new Types.ObjectId(finalState.artefactId);
        const userOid = new Types.ObjectId(finalState.userId);

        // Artefact update (idempotent — overwrites same doc)
        const artefactResult = await this.artefactsRepository.updateArtefactById(
          artefactOid,
          {
            artefactType: finalState.entryType,
            title: finalState.title,
            capabilities: finalState.capabilities.map((c) => ({
              code: c.code,
              evidence: c.quote,
              justification: c.justification ?? '',
            })),
            status: ArtefactStatus.IN_REVIEW,
            completeness: deriveCompleteness(finalState),
            draftStatus: finalState.draftStatus,
            readinessScore: finalState.readinessScore,
            composedDocument: finalState.composedDocument,
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

        // Status transition in same transaction. The reflect and dedupe traces
        // are written here as immutable debug/eval provenance on the run record.
        await this.analysisRunsService.transitionStatus(
          runId,
          AnalysisRunStatus.RUNNING,
          AnalysisRunStatus.COMPLETED,
          {
            currentStep: null,
            reflectTrace: finalState.reflectTrace,
            dedupeTrace: finalState.dedupeTrace,
          },
          session,
        );
      },
      { context },
    );
  }
}
