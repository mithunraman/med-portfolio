import { randomUUID } from 'crypto';
import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LoggerModule } from 'nestjs-pino';
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
import { SpecialtiesModule } from './specialties/specialties.module';
import { JwtAuthGuard, RolesGuard } from './common/guards';
import { TokenRefreshInterceptor } from './common/interceptors';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    EventEmitterModule.forRoot(),
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
          genReqId: (req: Record<string, any>) =>
            req.headers['x-request-id'] ?? randomUUID(),
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
    SpecialtiesModule,
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
    {
      provide: APP_INTERCEPTOR,
      useClass: TokenRefreshInterceptor,
    },
  ],
})
export class AppModule {}
