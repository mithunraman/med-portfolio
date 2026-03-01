import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Get config service
  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port', 3001);

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
}

bootstrap();
