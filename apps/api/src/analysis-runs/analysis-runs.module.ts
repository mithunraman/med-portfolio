import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CheckpointsModule } from '../checkpoints';
import { AnalysisRunListener } from './analysis-run.listener';
import { AnalysisRunsRepository } from './analysis-runs.repository';
import { ANALYSIS_RUNS_REPOSITORY } from './analysis-runs.repository.interface';
import { AnalysisRunsService } from './analysis-runs.service';
import { CheckpointSweeperService } from './checkpoint-sweeper.service';
import { AnalysisRun, AnalysisRunSchema } from './schemas/analysis-run.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AnalysisRun.name, schema: AnalysisRunSchema },
    ]),
    // Leaf module (Mongoose connection only), so importing it here cannot create
    // a cycle with the PortfolioGraph → Conversations → AnalysisRuns chain.
    CheckpointsModule,
  ],
  providers: [
    AnalysisRunsService,
    AnalysisRunListener,
    CheckpointSweeperService,
    {
      provide: ANALYSIS_RUNS_REPOSITORY,
      useClass: AnalysisRunsRepository,
    },
  ],
  exports: [AnalysisRunsService, ANALYSIS_RUNS_REPOSITORY],
})
export class AnalysisRunsModule {}
