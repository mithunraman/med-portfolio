import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigModule } from './config';
import { DatabaseModule } from './database';
import { AuthModule } from './auth/auth.module';
import { ItemsModule } from './items/items.module';
import { ConversationsModule } from './conversations/conversations.module';
import { ArtefactsModule } from './artefacts/artefacts.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { StorageModule } from './storage';
import { LLMModule } from './llm';
import { MediaModule } from './media';
import { ProcessingModule } from './processing';
import { AnalysisRunsModule } from './analysis-runs';
import { OutboxModule } from './outbox';
import { ReviewPeriodsModule } from './review-periods/review-periods.module';
import { OtpModule } from './otp';
import { JwtAuthGuard, RolesGuard } from './common/guards';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    EventEmitterModule.forRoot(),
    AuthModule,
    ItemsModule,
    StorageModule,
    LLMModule,
    MediaModule,
    ProcessingModule,
    ConversationsModule,
    ArtefactsModule,
    DashboardModule,
    AnalysisRunsModule,
    OutboxModule,
    ReviewPeriodsModule,
    OtpModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
