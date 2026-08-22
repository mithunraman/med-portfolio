import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { toObjectId } from '../common/utils/objectid.util';
import { ANALYSIS_STEP_STARTED, AnalysisStepStartedEvent } from '../portfolio-graph/graph-deps';
import { AnalysisRunsService } from './analysis-runs.service';

@Injectable()
export class AnalysisRunListener {
  private readonly logger = new Logger(AnalysisRunListener.name);

  constructor(private readonly analysisRunsService: AnalysisRunsService) {}

  @OnEvent(ANALYSIS_STEP_STARTED)
  async handleStepStarted(event: AnalysisStepStartedEvent): Promise<void> {
    try {
      // Validated, not cast. This event arrives through EventEmitter2's
      // `emit(name, ...values: any[])` from 12 hand-written literals across the
      // graph nodes — `AnalysisStepStartedEvent` is applied to none of them, so a
      // node omitting a field compiles. Left unguarded, an absent id would be
      // MINTED rather than rejected (see `toObjectId`), match no run, and stop
      // progress updates silently.
      const conversationId = toObjectId(event.conversationId, 'analysis.step.started: conversationId');
      const userId = toObjectId(event.userId, 'analysis.step.started: userId');

      const updated = await this.analysisRunsService.updateCurrentStep(
        conversationId,
        userId,
        event.step
      );
      if (updated) {
        this.logger.debug(
          `Updated currentStep to '${event.step}' for conversation ${event.conversationId}`
        );
      } else {
        // Routine when the run has terminated; noteworthy otherwise. Either way
        // this is NOT the success path — see updateCurrentStep's contract.
        this.logger.warn(
          `No active run matched for conversation ${event.conversationId} — currentStep '${event.step}' not recorded`
        );
      }
    } catch (error) {
      // Fire-and-forget — don't let a failed progress update crash the graph
      this.logger.warn(
        `Failed to update currentStep for conversation ${event.conversationId}: ${error}`
      );
    }
  }
}
