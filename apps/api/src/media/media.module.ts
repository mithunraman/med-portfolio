import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DatabaseModule } from '../database';
import { StorageModule } from '../storage';
import { MediaController } from './media.controller';
import { MediaRepository } from './media.repository';
import { MEDIA_REPOSITORY } from './media.repository.interface';
import { MediaService } from './media.service';
import { MediaSweeperService } from './media-sweeper.service';
import { Media, MediaSchema } from './schemas/media.schema';

@Module({
  imports: [
    DatabaseModule,
    MongooseModule.forFeature([{ name: Media.name, schema: MediaSchema }]),
    StorageModule,
  ],
  controllers: [MediaController],
  providers: [
    MediaService,
    MediaSweeperService,
    {
      provide: MEDIA_REPOSITORY,
      useClass: MediaRepository,
    },
  ],
  exports: [MediaService, MEDIA_REPOSITORY],
})
export class MediaModule {}
