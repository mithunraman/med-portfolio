import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalysisRunsModule } from '../analysis-runs';
import { PortfolioGraphModule } from '../portfolio-graph';
import { AnalysisResumeHandler } from './handlers/analysis-resume.handler';
import { AnalysisStartHandler } from './handlers/analysis-start.handler';
import { OutboxConsumer, OUTBOX_HANDLERS } from './outbox.consumer';
import { OutboxRepository } from './outbox.repository';
import { OUTBOX_REPOSITORY } from './outbox.repository.interface';
import { OutboxService } from './outbox.service';
import { OutboxEntry, OutboxEntrySchema } from './schemas/outbox.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OutboxEntry.name, schema: OutboxEntrySchema },
    ]),
    AnalysisRunsModule,
    forwardRef(() => PortfolioGraphModule),
  ],
  providers: [
    OutboxService,
    OutboxConsumer,
    AnalysisStartHandler,
    AnalysisResumeHandler,
    {
      provide: OUTBOX_REPOSITORY,
      useClass: OutboxRepository,
    },
    {
      provide: OUTBOX_HANDLERS,
      useFactory: (
        startHandler: AnalysisStartHandler,
        resumeHandler: AnalysisResumeHandler,
      ) => [startHandler, resumeHandler],
      inject: [AnalysisStartHandler, AnalysisResumeHandler],
    },
  ],
  exports: [OutboxService, OutboxConsumer],
})
export class OutboxModule {}
