import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { MAX_OTP_WINDOW_MINUTES } from '../otp/otp.constants';

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
  S3_ENDPOINT: z.string().url(),
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

  // LLM A/B/C/D/E variant selector. Selects a complete stage→model profile from
  // VARIANTS (see llm/model-variants.ts).
  LLM_VARIANT: z.enum(['A', 'B', 'C', 'D', 'E']).default('A'),

  // Per-KEY LLM request rate limit. Caps outbound structured LLM calls per API
  // key to protect each key's provider quota. With multiple Azure Foundry keys
  // (AZURE_FOUNDRY_API_KEY_<i>) each key gets its own limiter at this rate, so the
  // aggregate CAPACITY CEILING is this value × number of keys — a ceiling, not a
  // guaranteed rate: actual utilization depends on how conversations hash across
  // keys. A single conversation is sharded to ONE key (sticky routing), so its own
  // throughput is bound by this per-key value regardless of key count. Overflow
  // queues in-process and drains as the window refreshes — see LlmRateLimiterService.
  // Transcription (AssemblyAI) is a separate quota and is NOT gated by this.
  //
  // Default 18 = 10% headroom under each key's strict 20 req/min. Smoothing
  // (minTime = 60000 / rpm) is DERIVED from this single knob — see appConfig — so
  // the budget is paced evenly rather than bursted; there is no separate min-time
  // env var to drift out of sync.
  LLM_MAX_REQUESTS_PER_MINUTE: z
    .string()
    .default('18')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(10000)),

  // OpenRouter — required only when the active variant routes any stage to it
  // (ModelConfigService enforces this at startup).
  OPENROUTER_API_KEY: z.string().optional(),

  // Azure AI Foundry — one or more (key, base URL) endpoints, each carrying its
  // own RPM quota. Supplied as indexed pairs AZURE_FOUNDRY_API_KEY_<i> /
  // AZURE_FOUNDRY_BASE_URL_<i> (i = 1..8) and parsed by parseFoundryEndpoints()
  // below: they are variable-cardinality, so they can't be static schema fields.
  // Required only when the active variant (D) routes any stage to Foundry
  // (ModelConfigService enforces at startup). Base URL is the OpenAI-compatible
  // surface, e.g. https://<resource>.services.ai.azure.com/openai/v1/

  // Azure AI Language — PII/PHI redaction. Authenticated with a Microsoft Entra
  // service principal (no static key), so `disableLocalAuth` can be enforced on
  // the resource. All four are required for the redaction pipeline;
  // AzureLanguageService asserts their presence at startup and fails fast if any
  // is missing. Kept optional in the schema so unrelated tooling can still parse
  // config without provisioning Azure creds.
  AZURE_LANGUAGE_ENDPOINT: z.string().url().optional(),
  AZURE_TENANT_ID: z.string().optional(),
  AZURE_CLIENT_ID: z.string().optional(),
  AZURE_CLIENT_SECRET: z.string().optional(),

  // How the PHI layer treats DateTime entities. 'keep-relative' (default) keeps
  // non-identifying relative temporal expressions ("today", "three weeks ago")
  // for reflective narrative while still redacting absolute dates (DOB,
  // "12/05/1980"). 'redact-all' removes every date for maximum de-identification
  // strictness. A DPIA-level policy switch — see AzureLanguageService.
  REDACTION_DATE_POLICY: z.enum(['keep-relative', 'redact-all']).default('keep-relative'),

  // Whether the PHI layer keeps `PersonType` entities (job roles / relationship
  // nouns like "supervisor", "GP", "daughter"). These are NOT HIPAA/ICO
  // identifiers, so keeping them (default) preserves reflective narrative without
  // leaking PII. Set to 'false' for maximum strictness. Explicit enum→boolean so
  // the string 'false' is honoured (z.coerce.boolean would treat it as true).
  REDACTION_KEEP_PERSON_TYPE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  // AssemblyAI
  ASSEMBLYAI_API_KEY: z
    .string({ required_error: 'ASSEMBLYAI_API_KEY is required' })
    .min(1, 'ASSEMBLYAI_API_KEY cannot be empty'),
  ASSEMBLYAI_BASE_URL: z.string().url().default('https://api.eu.assemblyai.com'),

  // Sentry
  SENTRY_DSN: z
    .string({ required_error: 'SENTRY_DSN is required' })
    .url('SENTRY_DSN must be a valid URL'),

  // Transactional email (Resend) — required; the app cannot deliver OTP logins without both.
  RESEND_API_KEY: z.string().min(1),
  MAIL_FROM: z.string().min(1),

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
    .pipe(z.number().int().min(1).max(MAX_OTP_WINDOW_MINUTES))
    .default('10'),

  // Reverse-proxy hop count. Determines how many proxy hops Express trusts
  // when resolving `req.ip` from X-Forwarded-For. 0 = no proxy (dev/bare).
  // Set to 1 behind Render/ALB; 2 if Cloudflare fronts another proxy. Audit
  // fields (acknowledgement IP, rate-limit IP) rely on this being correct
  // for the deployment topology.
  TRUST_PROXY_HOPS: z
    .string()
    .default('0')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(0).max(10)),
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

/** One Azure Foundry endpoint: an API key paired with its OpenAI-compatible base URL. */
export interface FoundryEndpoint {
  apiKey: string;
  baseURL: string;
}

const MAX_FOUNDRY_ENDPOINTS = 8;
const foundryBaseUrlSchema = z.string().url();

/**
 * Parse the indexed Azure Foundry endpoint pairs (AZURE_FOUNDRY_API_KEY_<i> /
 * AZURE_FOUNDRY_BASE_URL_<i>) into an ordered list. These are variable-cardinality
 * (1..N keys, each its own quota), so they can't be static Zod fields — this is the
 * one place config reads process.env by pattern, and each value is still validated:
 *  - a slot with BOTH vars set → a valid endpoint,
 *  - a slot with NEITHER set → skipped,
 *  - a slot with EXACTLY ONE set → throws (half-configured; naming the index) so a
 *    key never routes to a missing URL, or vice versa, undetected,
 *  - two slots with the SAME base URL → throws (see below).
 *
 * Duplicate base URL = duplicate resource = duplicate quota. An Azure resource has
 * ONE shared RPM quota regardless of how many access keys it exposes, and it labels
 * those keys "Key 1"/"Key 2" — matching our _1/_2 naming — so pasting one resource's
 * two keys is an easy mistake that would spin up two limiters against a single quota
 * (→ sustained 429s). Same resource always means an identical base URL, so we reject
 * the collision at startup, naming the offending indices.
 */
export function parseFoundryEndpoints(env: NodeJS.ProcessEnv): FoundryEndpoint[] {
  const endpoints: FoundryEndpoint[] = [];
  const seenBaseUrls = new Map<string, number>(); // normalized base URL → first index

  for (let i = 1; i <= MAX_FOUNDRY_ENDPOINTS; i++) {
    const apiKey = env[`AZURE_FOUNDRY_API_KEY_${i}`]?.trim();
    const baseUrl = env[`AZURE_FOUNDRY_BASE_URL_${i}`]?.trim();

    if (!apiKey && !baseUrl) continue;
    if (!apiKey || !baseUrl) {
      throw new Error(
        `Azure Foundry endpoint ${i} is half-configured: set BOTH ` +
          `AZURE_FOUNDRY_API_KEY_${i} and AZURE_FOUNDRY_BASE_URL_${i}, or neither.`
      );
    }

    const parsedUrl = foundryBaseUrlSchema.safeParse(baseUrl);
    if (!parsedUrl.success) {
      throw new Error(`AZURE_FOUNDRY_BASE_URL_${i} must be a valid URL.`);
    }

    const normalized = normalizeBaseUrl(parsedUrl.data);
    const firstIndex = seenBaseUrls.get(normalized);
    if (firstIndex !== undefined) {
      throw new Error(
        `Azure Foundry endpoints ${firstIndex} and ${i} share the same base URL ` +
          `(${parsedUrl.data}). Two keys of ONE resource share a single RPM quota — ` +
          `configure keys from DISTINCT resources/deployments, not "Key 1"/"Key 2" of ` +
          `the same resource.`
      );
    }
    seenBaseUrls.set(normalized, i);

    endpoints.push({ apiKey, baseURL: parsedUrl.data });
  }
  return endpoints;
}

/** Canonicalize a base URL for duplicate detection: lowercase, no trailing slash. */
function normalizeBaseUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`.toLowerCase();
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
    llm: {
      variant: env.LLM_VARIANT,
      rateLimit: {
        maxRequestsPerMinute: env.LLM_MAX_REQUESTS_PER_MINUTE,
        // Derived, not a separate env var: pacing stays in lockstep with the cap.
        minTimeMs: Math.floor(60_000 / env.LLM_MAX_REQUESTS_PER_MINUTE),
      },
    },
    openrouter: {
      apiKey: env.OPENROUTER_API_KEY,
    },
    azureFoundry: {
      endpoints: parseFoundryEndpoints(process.env),
    },
    azureLanguage: {
      endpoint: env.AZURE_LANGUAGE_ENDPOINT,
      tenantId: env.AZURE_TENANT_ID,
      clientId: env.AZURE_CLIENT_ID,
      clientSecret: env.AZURE_CLIENT_SECRET,
      datePolicy: env.REDACTION_DATE_POLICY,
      keepPersonType: env.REDACTION_KEEP_PERSON_TYPE,
    },
    assemblyai: {
      apiKey: env.ASSEMBLYAI_API_KEY,
      baseUrl: env.ASSEMBLYAI_BASE_URL,
    },
    sentry: {
      dsn: env.SENTRY_DSN,
    },
    resend: {
      apiKey: env.RESEND_API_KEY,
      from: env.MAIL_FROM,
    },
    allowedOrigins: env.ALLOWED_ORIGINS,
    trustProxyHops: env.TRUST_PROXY_HOPS,
    otp: {
      expiryMinutes: env.OTP_EXPIRY_MINUTES,
      maxAttempts: env.OTP_MAX_ATTEMPTS,
      rateLimitMax: env.OTP_RATE_LIMIT_MAX,
      rateLimitWindowMinutes: env.OTP_RATE_LIMIT_WINDOW_MINUTES,
    },
  };
});

export type AppConfig = ReturnType<typeof appConfig>;
