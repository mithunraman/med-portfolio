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

  // Security headers
  app.use(helmet());

  // Enable CORS
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(new ZodValidationPipe());

  // API prefix
  app.setGlobalPrefix('api');

  // Simulate network latency in development
  if (configService.get('app.nodeEnv') === 'development') {
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
