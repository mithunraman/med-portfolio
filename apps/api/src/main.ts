// 1. Sentry — must be first, patches Node modules at import time.
import './instrument';
// 2. OpenTelemetry — must be before NestJS/Express/Mongoose for auto-instrumentation.
import './tracing';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);

  // Get config service
  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port', 3001);

  // Trust N upstream proxy hops so `req.ip` resolves from X-Forwarded-For.
  // `req.ip` is the rate limiter's tracker key (global ThrottlerGuard), so
  // behind any LB/CDN without this every request shares the proxy's address and
  // one client can exhaust the quota for all of them. Must match deployment
  // topology — too-permissive (`true`) lets clients spoof IPs via X-Forwarded-For.
  //
  // `req.ip` is not persisted to any domain record — it was deliberately removed
  // from `acknowledgements`, which survives account deletion. It *is* captured in
  // request logs (the `req` serializer in app.module.ts, alongside user-agent and
  // userId) and exported to Grafana Cloud over OTLP — see tracing.ts. That is
  // security telemetry with its own retention, not application data; do not
  // conclude from this block that the value goes nowhere.
  const trustProxyHops = configService.get<number>('app.trustProxyHops', 0);
  if (trustProxyHops > 0) {
    app.getHttpAdapter().getInstance().set('trust proxy', trustProxyHops);
  }
  // Surface the resolved value at boot so a deployed-behind-a-proxy misconfig
  // is visible on the first deploy log rather than discovered later as unexplained
  // rate limiting. Warn when production + 0 hops — the footgun the default invites.
  if (configService.get<boolean>('app.isProduction') && trustProxyHops === 0) {
    logger.warn(
      'TRUST_PROXY_HOPS=0 in production — req.ip will reflect the immediate upstream (proxy/LB), not the real client. If any proxy fronts this service, every client shares one rate-limit bucket.'
    );
  } else {
    logger.log(`Trust proxy hops: ${trustProxyHops}`);
  }

  // Security headers
  app.use(helmet());

  // CORS — whitelist specific origins; non-browser clients (mobile, curl) have no Origin header
  const allowedOrigins = configService.get<string[]>('app.allowedOrigins', []);
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(new ZodValidationPipe());

  // API prefix
  app.setGlobalPrefix('api');

  // Simulate network latency in development
  if (configService.get<boolean>('app.isDevelopment')) {
    app.use((_req: Request, _res: Response, next: NextFunction) => setTimeout(next, 1000));
  }

  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}/api`);

  // Ensure clean shutdown on watch-mode restarts (nest CLI sends SIGTERM).
  // Force exit after 2s to avoid EADDRINUSE when app.close() is slow.
  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal}, shutting down...`);
    const forceExit = setTimeout(() => process.exit(0), 2000);
    try {
      await app.close();
    } finally {
      clearTimeout(forceExit);
      process.exit(0);
    }
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

bootstrap();
