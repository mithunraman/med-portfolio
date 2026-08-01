import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { SentryGlobalFilter } from '@sentry/nestjs/setup';
import { randomUUID } from 'crypto';
import { LoggerModule } from 'nestjs-pino';
import { AccountCleanupModule } from './account-cleanup';
import { AcknowledgementsModule } from './acknowledgements';
import { AnalysisRunsModule } from './analysis-runs';
import { ArtefactsModule } from './artefacts/artefacts.module';
import { AuthModule } from './auth/auth.module';
import { DevOnlyGuard, JwtAuthGuard, QuotaGuard, RolesGuard } from './common/guards';
import { QuotaInterceptor } from './common/interceptors';
import { MetricsModule } from './common/metrics';
import { ConfigModule } from './config';
import { rateLimitConfig } from './config/rate-limit.config';
import { ConversationsModule } from './conversations/conversations.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DatabaseModule } from './database';
import { EmailModule } from './email';
import { HealthModule } from './health';
import { InitModule } from './init';
import { ItemsModule } from './items/items.module';
import { LLMModule } from './llm';
import { MediaModule } from './media';
import { NoticesModule } from './notices';
import { OtpModule } from './otp';
import { OutboxModule } from './outbox';
import { ProcessingModule } from './processing';
import { QuotaModule } from './quota';
import { ReviewPeriodsModule } from './review-periods/review-periods.module';
import { SpecialtiesModule } from './specialties/specialties.module';
import { StorageModule } from './storage';
import { VersionPolicyModule } from './version-policy';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    MetricsModule,
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot({ throttlers: Object.values(rateLimitConfig) }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get('app.logLevel'),
          transport: config.get<boolean>('app.isDevelopment')
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
          // Severity carries the outcome, so warn/error lines are greppable and
          // alertable without inspecting statusCode. Without this, pino-http logs
          // everything below 500 at `info` — a 401 or 429 looks like a healthy request.
          customLogLevel: (_req: Record<string, any>, res: Record<string, any>, err?: Error) => {
            if (err || res.statusCode >= 500) return 'error';
            if (res.statusCode >= 400) return 'warn';
            return 'info';
          },
          // The default serializers log every request and response header on every
          // request. Those become log-record attributes in Loki (the OTel pino
          // instrumentation in tracing.ts ships each record over OTLP), so the blob
          // is both ingest cost and an unnecessary export of device/session headers.
          // `wrapSerializers` (pino-http default) means these receive the
          // std-serialized shape, with the Express req/res on `.raw`.
          serializers: {
            req: (req: Record<string, any>) => ({
              id: req.id,
              method: req.method,
              url: req.url,
              // req.raw.ip honours `trust proxy`; remoteAddress is the reverse proxy.
              ip: req.raw?.ip ?? req.remoteAddress,
              userAgent: req.headers?.['user-agent'],
            }),
            res: (res: Record<string, any>) => ({ statusCode: res.statusCode }),
          },
          // Kept as defence in depth: headers are no longer serialized above, but
          // these paths must stay redacted if the req serializer is ever widened.
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
    VersionPolicyModule,
    NoticesModule,
    AcknowledgementsModule,
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
  ],
})
export class AppModule {}
