import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalysisRunsModule } from '../analysis-runs';
import { ConversationsModule } from '../conversations/conversations.module';
import { DatabaseModule } from '../database';
import { MediaModule } from '../media';
import { OutboxModule } from '../outbox/outbox.module';
import { PdpGoalsModule } from '../pdp-goals/pdp-goals.module';
import { VersionHistoryModule } from '../version-history';
import { ArtefactsController } from './artefacts.controller';
import { ArtefactsRepository } from './artefacts.repository';
import { ARTEFACTS_REPOSITORY } from './artefacts.repository.interface';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { ArtefactsService } from './artefacts.service';
import { Artefact, ArtefactSchema } from './schemas/artefact.schema';

@Module({
  imports: [
    DatabaseModule,
    MongooseModule.forFeature([
      { name: Artefact.name, schema: ArtefactSchema },
      { name: User.name, schema: UserSchema },
    ]),
    PdpGoalsModule,
    MediaModule,
    AnalysisRunsModule,
    VersionHistoryModule,
    forwardRef(() => ConversationsModule),
    forwardRef(() => OutboxModule),
  ],
  controllers: [ArtefactsController],
  providers: [
    ArtefactsService,
    {
      provide: ARTEFACTS_REPOSITORY,
      useClass: ArtefactsRepository,
    },
  ],
  exports: [ArtefactsService, ARTEFACTS_REPOSITORY],
})
export class ArtefactsModule {}
