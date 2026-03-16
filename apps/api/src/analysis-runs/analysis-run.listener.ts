import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Types } from 'mongoose';
import { ANALYSIS_STEP_STARTED, AnalysisStepStartedEvent } from '../portfolio-graph/graph-deps';
import { AnalysisRunsService } from './analysis-runs.service';

@Injectable()
export class AnalysisRunListener {
  private readonly logger = new Logger(AnalysisRunListener.name);

  constructor(private readonly analysisRunsService: AnalysisRunsService) {}

  @OnEvent(ANALYSIS_STEP_STARTED)
  async handleStepStarted(event: AnalysisStepStartedEvent): Promise<void> {
    try {
      const conversationId = new Types.ObjectId(event.conversationId);
      await this.analysisRunsService.updateCurrentStep(conversationId, event.step);
      this.logger.debug(
        `Updated currentStep to '${event.step}' for conversation ${event.conversationId}`
      );
    } catch (error) {
      // Fire-and-forget — don't let a failed progress update crash the graph
      this.logger.warn(
        `Failed to update currentStep for conversation ${event.conversationId}: ${error}`
      );
    }
  }
}
