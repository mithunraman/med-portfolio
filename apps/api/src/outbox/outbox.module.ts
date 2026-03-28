import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalysisRunsModule } from '../analysis-runs';
import { ArtefactsModule } from '../artefacts/artefacts.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { DatabaseModule } from '../database';
import { PdpGoalsModule } from '../pdp-goals/pdp-goals.module';
import { PortfolioGraphModule } from '../portfolio-graph';
import { ProcessingModule } from '../processing/processing.module';
import { AnalysisResumeHandler } from './handlers/analysis-resume.handler';
import { AnalysisStartHandler } from './handlers/analysis-start.handler';
import { MessageProcessingHandler } from './handlers/message-processing.handler';
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
    forwardRef(() => ArtefactsModule),
    DatabaseModule,
    PdpGoalsModule,
    forwardRef(() => ConversationsModule),
    forwardRef(() => PortfolioGraphModule),
    forwardRef(() => ProcessingModule),
  ],
  providers: [
    OutboxService,
    OutboxConsumer,
    AnalysisStartHandler,
    AnalysisResumeHandler,
    MessageProcessingHandler,
    {
      provide: OUTBOX_REPOSITORY,
      useClass: OutboxRepository,
    },
    {
      provide: OUTBOX_HANDLERS,
      useFactory: (
        startHandler: AnalysisStartHandler,
        resumeHandler: AnalysisResumeHandler,
        processingHandler: MessageProcessingHandler,
      ) => [startHandler, resumeHandler, processingHandler],
      inject: [AnalysisStartHandler, AnalysisResumeHandler, MessageProcessingHandler],
    },
  ],
  exports: [OutboxService, OutboxConsumer, OUTBOX_REPOSITORY],
})
export class OutboxModule {}
