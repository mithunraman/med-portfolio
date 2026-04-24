import { Logger, type INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule, getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection, Model } from 'mongoose';
import { ZodValidationPipe } from 'nestjs-zod';
import { User, UserDocument, UserSchema } from '../../schemas/user.schema';
import { Session, SessionDocument, SessionSchema } from '../../schemas/session.schema';
import { AuthController } from '../../auth.controller';
import { AuthService } from '../../auth.service';
import { TokenService } from '../../token.service';
import { JwtStrategy } from '../../strategies/jwt.strategy';
import { SessionsRepository } from '../../sessions.repository';
import { SESSION_REPOSITORY } from '../../sessions.repository.interface';
import { EmailService } from '../../../email/email.service';
import { EmailModule } from '../../../email/email.module';
import { OtpModule } from '../../../otp';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';

export const TEST_JWT_SECRET = 'test-jwt-access-secret-must-be-at-least-32-chars';

/**
 * Test config: returns a synthetic `app.*` namespace so Nest's
 * ConfigService resolves without hitting the user's .env file.
 */
function testAppConfig() {
  return {
    port: 3001,
    nodeEnv: 'development',
    logLevel: 'info',
    mongodb: { uri: '' }, // unused — MongooseModule is wired to an in-memory URI directly
    jwt: {
      accessSecret: TEST_JWT_SECRET,
      accessExpiresIn: '60m',
      refreshTtlDays: 90,
    },
    storage: {
      endpoint: undefined,
      region: 'auto',
      accessKeyId: 'x',
      secretAccessKey: 'x',
      mediaBucket: 'x',
    },
    openai: { apiKey: 'x' },
    assemblyai: { apiKey: 'x' },
    sentry: { dsn: 'https://x@x.ingest.sentry.io/x' },
    smtp: {
      host: undefined,
      port: 587,
      user: undefined,
      pass: undefined,
      from: undefined,
    },
    allowedOrigins: [],
    otp: {
      expiryMinutes: 5,
      maxAttempts: 3,
      rateLimitMax: 3,
      rateLimitWindowMinutes: 10,
    },
  };
}

/**
 * Mocked EmailService that records calls but never hits SMTP.
 * Exposed so tests can assert on what was sent.
 */
export interface MockEmailService {
  sendOtp: jest.Mock<Promise<void>, [string, string, number]>;
}

export function createMockEmailService(): MockEmailService {
  return {
    sendOtp: jest.fn().mockResolvedValue(undefined),
  };
}

/**
 * Standalone harness wiring everything auth needs — without the noise
 * of the real AppModule (LangGraph, outbox, cron, Sentry filter, etc).
 *
 * Adds ThrottlerGuard + JwtAuthGuard + RolesGuard as APP_GUARDs to match
 * production behavior.
 */
export interface AuthTestHarness {
  app: INestApplication;
  module: TestingModule;
  mongod: MongoMemoryServer;
  connection: Connection;
  userModel: Model<UserDocument>;
  sessionModel: Model<SessionDocument>;
  emailService: MockEmailService;
  jwtSecret: string;
}

export async function createAuthHarness(): Promise<AuthTestHarness> {
  const mongod = await MongoMemoryServer.create();
  const emailService = createMockEmailService();

  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        load: [() => ({ app: testAppConfig() })],
        ignoreEnvFile: true,
      }),
      MongooseModule.forRoot(mongod.getUri()),
      MongooseModule.forFeature([
        { name: User.name, schema: UserSchema },
        { name: Session.name, schema: SessionSchema },
      ]),
      PassportModule.register({ defaultStrategy: 'jwt' }),
      JwtModule.registerAsync({
        inject: [ConfigService],
        useFactory: (cfg: ConfigService) => ({
          secret: cfg.get<string>('app.jwt.accessSecret'),
          signOptions: { expiresIn: cfg.get<string>('app.jwt.accessExpiresIn') },
        }),
      }),
      ThrottlerModule.forRoot({
        throttlers: [{ name: 'short', ttl: 10_000, limit: 20 }],
      }),
      EmailModule,
      OtpModule,
    ],
    controllers: [AuthController],
    providers: [
      AuthService,
      TokenService,
      JwtStrategy,
      { provide: SESSION_REPOSITORY, useClass: SessionsRepository },
      { provide: APP_GUARD, useClass: ThrottlerGuard },
      { provide: APP_GUARD, useClass: JwtAuthGuard },
      { provide: APP_GUARD, useClass: RolesGuard },
    ],
  })
    .overrideProvider(EmailService)
    .useValue(emailService)
    .compile();

  const app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ZodValidationPipe());
  Logger.overrideLogger(false);

  await app.init();

  const connection = module.get<Connection>(getConnectionToken());
  const userModel = module.get<Model<UserDocument>>(getModelToken(User.name));
  const sessionModel = module.get<Model<SessionDocument>>(getModelToken(Session.name));

  return {
    app,
    module,
    mongod,
    connection,
    userModel,
    sessionModel,
    emailService,
    jwtSecret: TEST_JWT_SECRET,
  };
}

export async function destroyAuthHarness(harness: AuthTestHarness): Promise<void> {
  await harness.app.close();
  await harness.mongod.stop();
}

export async function cleanupAuthCollections(harness: AuthTestHarness): Promise<void> {
  await harness.userModel.deleteMany({});
  await harness.sessionModel.deleteMany({});
  const otpModel = harness.connection.collection('otps');
  await otpModel.deleteMany({});
}

/**
 * Request headers that satisfy DeviceInfoHeaders validation.
 */
export const DEVICE_HEADERS = {
  'x-device-id': 'test-device-uuid-aaaa',
  'x-device-name': 'iOS iPhone Test',
  'x-app-version': '1.0.0',
  'x-os': 'iOS 17.0',
};

export function deviceHeadersFor(deviceId: string) {
  return { ...DEVICE_HEADERS, 'x-device-id': deviceId };
}

/**
 * Extracts the dev OTP from a /auth/otp/send response.
 */
export function extractDevOtp(body: unknown): string {
  const typed = body as { devOtp?: string };
  if (!typed.devOtp) {
    throw new Error('Test expected devOtp in response — is NODE_ENV set to production?');
  }
  return typed.devOtp;
}
