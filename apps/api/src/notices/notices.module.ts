import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Notice, NoticeSchema } from './schemas/notice.schema';
import { NoticeDismissal, NoticeDismissalSchema } from './schemas/notice-dismissal.schema';
import { NoticesAdminController } from './notices.admin.controller';
import { NoticesController } from './notices.controller';
import { NoticesRepository } from './notices.repository';
import { NoticesService } from './notices.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notice.name, schema: NoticeSchema },
      { name: NoticeDismissal.name, schema: NoticeDismissalSchema },
    ]),
  ],
  controllers: [NoticesController, NoticesAdminController],
  providers: [NoticesRepository, NoticesService],
  exports: [NoticesService],
})
export class NoticesModule {}
