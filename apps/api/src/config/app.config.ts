import { registerAs } from '@nestjs/config';
import { z } from 'zod';

/**
 * Environment variables schema with validation rules.
 */
export const envSchema = z.object({
  // Server
  PORT: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(65535)),
  NODE_ENV: z.enum(['development', 'production', 'test']),

  // Database
  MONGODB_URI: z
    .string({ required_error: 'MONGODB_URI is required' })
    .min(1, 'MONGODB_URI cannot be empty')
    .url('MONGODB_URI must be a valid URL'),

  // Authentication
  JWT_SECRET: z
    .string({ required_error: 'JWT_SECRET is required' })
    .min(32, 'JWT_SECRET must be at least 32 characters for security'),
  JWT_EXPIRES_IN: z.string().default('7d'),

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
    mongodb: {
      uri: env.MONGODB_URI,
    },
    jwt: {
      secret: env.JWT_SECRET,
      expiresIn: env.JWT_EXPIRES_IN,
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
  };
});

export type AppConfig = ReturnType<typeof appConfig>;
