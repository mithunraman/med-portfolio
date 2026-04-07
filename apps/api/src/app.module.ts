import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerGuard } from '@nestjs/throttler';
import { SentryGlobalFilter } from '@sentry/nestjs/setup';
import { randomUUID } from 'crypto';
import { LoggerModule } from 'nestjs-pino';
import { rateLimitConfig } from './config/rate-limit.config';
import { AccountCleanupModule } from './account-cleanup';
import { AnalysisRunsModule } from './analysis-runs';
import { ArtefactsModule } from './artefacts/artefacts.module';
import { AuthModule } from './auth/auth.module';
import { DevOnlyGuard, JwtAuthGuard, QuotaGuard, RolesGuard } from './common/guards';
import { QuotaInterceptor, TokenRefreshInterceptor } from './common/interceptors';
import { MetricsModule } from './common/metrics';
import { ConfigModule } from './config';
import { ConversationsModule } from './conversations/conversations.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { EmailModule } from './email';
import { DatabaseModule } from './database';
import { HealthModule } from './health';
import { InitModule } from './init';
import { ItemsModule } from './items/items.module';
import { LLMModule } from './llm';
import { MediaModule } from './media';
import { OtpModule } from './otp';
import { OutboxModule } from './outbox';
import { ProcessingModule } from './processing';
import { QuotaModule } from './quota';
import { ReviewPeriodsModule } from './review-periods/review-periods.module';
import { SpecialtiesModule } from './specialties/specialties.module';
import { StorageModule } from './storage';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    MetricsModule,
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot({ throttlers: [rateLimitConfig.short, rateLimitConfig.medium] }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get('app.logLevel'),
          transport:
            config.get('app.nodeEnv') === 'development'
              ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } }
              : undefined,
          // Phase 3: Correlation IDs — honour client X-Request-Id, else generate UUID
          genReqId: (req: Record<string, any>) => req.headers['x-request-id'] ?? randomUUID(),
          // Phase 2: HTTP request logging
          customProps: (req: Record<string, any>, res: Record<string, any>) => {
            // Return X-Request-Id in response so clients can correlate
            if (req.id && !res.headersSent) {
              res.setHeader('X-Request-Id', req.id);
            }
            return { userId: req['user']?.userId };
          },
          redact: ['req.headers.authorization', 'req.headers.cookie'],
          customSuccessMessage: (req: Record<string, any>, res: Record<string, any>) =>
            `${req.method} ${req.url} ${res.statusCode}`,
          customErrorMessage: (req: Record<string, any>, res: Record<string, any>) =>
            `${req.method} ${req.url} ${res.statusCode}`,
          autoLogging: {
            ignore: (req: Record<string, any>) => req.url === '/api/health',
          },
        },
      }),
    }),
    EmailModule,
    AuthModule,
    ItemsModule,
    StorageModule,
    LLMModule,
    MediaModule,
    ProcessingModule,
    ConversationsModule,
    ArtefactsModule,
    DashboardModule,
    InitModule,
    AccountCleanupModule,
    AnalysisRunsModule,
    OutboxModule,
    QuotaModule,
    ReviewPeriodsModule,
    OtpModule,
    SpecialtiesModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: QuotaGuard,
    },
    {
      provide: APP_GUARD,
      useClass: DevOnlyGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: QuotaInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TokenRefreshInterceptor,
    },
  ],
})
export class AppModule {}
