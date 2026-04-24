import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalysisRunsModule } from '../analysis-runs';
import { ArtefactsModule } from '../artefacts/artefacts.module';
import { AuthModule } from '../auth/auth.module';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { ConversationsModule } from '../conversations/conversations.module';
import { ItemsModule } from '../items/items.module';
import { MediaModule } from '../media';
import { OutboxModule } from '../outbox';
import { PdpGoalsModule } from '../pdp-goals/pdp-goals.module';
import { ReviewPeriodsModule } from '../review-periods/review-periods.module';
import { StorageModule } from '../storage';
import { VersionHistoryModule } from '../version-history/version-history.module';
import { AccountCleanupController } from './account-cleanup.controller';
import { AccountCleanupService } from './account-cleanup.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    AuthModule,
    ArtefactsModule,
    ConversationsModule,
    MediaModule,
    PdpGoalsModule,
    ReviewPeriodsModule,
    AnalysisRunsModule,
    ItemsModule,
    VersionHistoryModule,
    OutboxModule,
    StorageModule,
  ],
  controllers: [AccountCleanupController],
  providers: [AccountCleanupService],
})
export class AccountCleanupModule {}
