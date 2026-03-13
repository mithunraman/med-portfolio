import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VersionHistoryRepository } from './version-history.repository';
import { VERSION_HISTORY_REPOSITORY } from './version-history.repository.interface';
import { VersionHistoryService } from './version-history.service';
import { VersionHistory, VersionHistorySchema } from './schemas/version-history.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: VersionHistory.name, schema: VersionHistorySchema }]),
  ],
  providers: [
    VersionHistoryService,
    {
      provide: VERSION_HISTORY_REPOSITORY,
      useClass: VersionHistoryRepository,
    },
  ],
  exports: [VersionHistoryService],
})
export class VersionHistoryModule {}
