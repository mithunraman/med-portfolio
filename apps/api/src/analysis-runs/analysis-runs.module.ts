import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalysisRunsRepository } from './analysis-runs.repository';
import { ANALYSIS_RUNS_REPOSITORY } from './analysis-runs.repository.interface';
import { AnalysisRunsService } from './analysis-runs.service';
import { AnalysisRun, AnalysisRunSchema } from './schemas/analysis-run.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AnalysisRun.name, schema: AnalysisRunSchema },
    ]),
  ],
  providers: [
    AnalysisRunsService,
    {
      provide: ANALYSIS_RUNS_REPOSITORY,
      useClass: AnalysisRunsRepository,
    },
  ],
  exports: [AnalysisRunsService],
})
export class AnalysisRunsModule {}
