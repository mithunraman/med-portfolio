import { registerAs } from '@nestjs/config';
import { z } from 'zod';

export const NodeEnv = {
  Development: 'development',
  Test: 'test',
  Production: 'production',
} as const;
export type NodeEnv = (typeof NodeEnv)[keyof typeof NodeEnv];

/**
 * Environment variables schema with validation rules.
 */
export const envSchema = z.object({
  // Server
  PORT: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(65535)),
  NODE_ENV: z.nativeEnum(NodeEnv),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Database
  MONGODB_URI: z
    .string({ required_error: 'MONGODB_URI is required' })
    .min(1, 'MONGODB_URI cannot be empty')
    .url('MONGODB_URI must be a valid URL'),

  // Authentication
  JWT_ACCESS_SECRET: z
    .string({ required_error: 'JWT_ACCESS_SECRET is required' })
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters for security'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('60m'),
  REFRESH_TOKEN_TTL_DAYS: z
    .string()
    .default('90')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(365)),

  // Storage (S3/R2)
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('auto'),
  S3_ACCESS_KEY_ID: z
    .string({ required_error: 'S3_ACCESS_KEY_ID is required' })
    .min(1, 'S3_ACCESS_KEY_ID cannot be empty'),
  S3_SECRET_ACCESS_KEY: z
    .string({ required_error: 'S3_SECRET_ACCESS_KEY is required' })
    .min(1, 'S3_SECRET_ACCESS_KEY cannot be empty'),
  S3_BUCKET_MEDIA: z
    .string({ required_error: 'S3_BUCKET_MEDIA is required' })
    .min(1, 'S3_BUCKET_MEDIA cannot be empty'),

  // OpenAI
  OPENAI_API_KEY: z
    .string({ required_error: 'OPENAI_API_KEY is required' })
    .min(1, 'OPENAI_API_KEY cannot be empty'),

  // AssemblyAI
  ASSEMBLYAI_API_KEY: z
    .string({ required_error: 'ASSEMBLYAI_API_KEY is required' })
    .min(1, 'ASSEMBLYAI_API_KEY cannot be empty'),

  // Sentry
  SENTRY_DSN: z
    .string({ required_error: 'SENTRY_DSN is required' })
    .url('SENTRY_DSN must be a valid URL'),

  // SMTP (email)
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(65535))
    .default('587'),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  SMTP_FROM: z.string().min(1).optional(),

  // CORS — comma-separated list of allowed browser origins
  ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((val) =>
      val
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    ),

  // OTP
  OTP_EXPIRY_MINUTES: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(60))
    .default('5'),
  OTP_MAX_ATTEMPTS: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(10))
    .default('3'),
  OTP_RATE_LIMIT_MAX: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(20))
    .default('3'),
  OTP_RATE_LIMIT_WINDOW_MINUTES: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(60))
    .default('10'),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Validates environment variables and returns typed config.
 * Throws with detailed error messages if validation fails.
 */
function validateEnv(): EnvConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues.map((issue) => {
      const path = issue.path.join('.');
      return `  - ${path}: ${issue.message}`;
    });

    throw new Error(
      `\n❌ Environment validation failed:\n${errors.join('\n')}\n\n` +
        `Please check your .env file against .env.example\n`
    );
  }

  return result.data;
}

/**
 * Validated environment configuration.
 * Loaded once at startup and cached.
 */
let cachedEnv: EnvConfig | null = null;

function getEnv(): EnvConfig {
  if (!cachedEnv) {
    cachedEnv = validateEnv();
  }
  return cachedEnv;
}

export const appConfig = registerAs('app', () => {
  const env = getEnv();

  return {
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
    isDevelopment: env.NODE_ENV === NodeEnv.Development,
    isTest: env.NODE_ENV === NodeEnv.Test,
    isProduction: env.NODE_ENV === NodeEnv.Production,
    logLevel: env.LOG_LEVEL,
    mongodb: {
      uri: env.MONGODB_URI,
    },
    jwt: {
      accessSecret: env.JWT_ACCESS_SECRET,
      accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
      refreshTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
    },
    storage: {
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      mediaBucket: env.S3_BUCKET_MEDIA,
    },
    openai: {
      apiKey: env.OPENAI_API_KEY,
    },
    assemblyai: {
      apiKey: env.ASSEMBLYAI_API_KEY,
    },
    sentry: {
      dsn: env.SENTRY_DSN,
    },
    smtp: {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      from: env.SMTP_FROM,
    },
    allowedOrigins: env.ALLOWED_ORIGINS,
    otp: {
      expiryMinutes: env.OTP_EXPIRY_MINUTES,
      maxAttempts: env.OTP_MAX_ATTEMPTS,
      rateLimitMax: env.OTP_RATE_LIMIT_MAX,
      rateLimitWindowMinutes: env.OTP_RATE_LIMIT_WINDOW_MINUTES,
    },
  };
});

export type AppConfig = ReturnType<typeof appConfig>;
