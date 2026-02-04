import { z } from 'zod';

/**
 * Environment variables schema with validation rules.
 */
const envSchema = z.object({
  EXPO_PUBLIC_API_URL: z
    .string({ required_error: 'EXPO_PUBLIC_API_URL is required' })
    .min(1, 'EXPO_PUBLIC_API_URL cannot be empty')
    .url('EXPO_PUBLIC_API_URL must be a valid URL'),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Validates environment variables and returns typed config.
 * Throws with detailed error messages if validation fails.
 */
function validateEnv(): EnvConfig {
  const result = envSchema.safeParse({
    EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  });

  if (!result.success) {
    const errors = result.error.issues.map((issue) => {
      const path = issue.path.join('.');
      return `  - ${path}: ${issue.message}`;
    });

    throw new Error(
      `\n❌ Environment validation failed:\n${errors.join('\n')}\n\n` +
      `Please create a .env file with:\n` +
      `EXPO_PUBLIC_API_URL=http://YOUR_IP:3001/api\n`
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

/**
 * Validated and typed environment config for the mobile app.
 */
export const env = getEnv();
