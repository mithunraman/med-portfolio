import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConversationsModule } from '../conversations/conversations.module';
import { DatabaseModule } from '../database';
import { ArtefactsController } from './artefacts.controller';
import { ArtefactsRepository } from './artefacts.repository';
import { ARTEFACTS_REPOSITORY } from './artefacts.repository.interface';
import { ArtefactsService } from './artefacts.service';
import { Artefact, ArtefactSchema } from './schemas/artefact.schema';

@Module({
  imports: [
    DatabaseModule,
    MongooseModule.forFeature([{ name: Artefact.name, schema: ArtefactSchema }]),
    ConversationsModule,
  ],
  controllers: [ArtefactsController],
  providers: [
    ArtefactsService,
    {
      provide: ARTEFACTS_REPOSITORY,
      useClass: ArtefactsRepository,
    },
  ],
  exports: [ArtefactsService],
})
export class ArtefactsModule {}
