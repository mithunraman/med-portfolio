import { Logger } from '@nestjs/common';
import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { ALL_POOLS, POOL_SPECS, Pool } from '../llm/llm-pools';
import { MAX_OTP_WINDOW_MINUTES } from '../otp/otp.constants';

export const NodeEnv = {
  Development: 'development',
  Test: 'test',
  Production: 'production',
} as const;
export type NodeEnv = (typeof NodeEnv)[keyof typeof NodeEnv];

/**
 * A requests-per-minute env var: string → validated positive int. Shared by the
 * default cap and every per-pool cap so the bounds can't drift between them.
 */
const rpmSchema = (defaultValue: string) =>
  z
    .string()
    .default(defaultValue)
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(10000));

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

  // LLM A/B/C/D/E variant selector. Selects a complete stage→model profile from
  // VARIANTS (see llm/model-variants.ts).
  LLM_VARIANT: z.enum(['PROD', 'A', 'B', 'C', 'E']),

  // Per-POOL rate limits, one per member of the Pool enum. Unlike endpoint
  // cardinality (variable, hence parsed by pattern below), the POOL SET is closed
  // — it's a code constant — so these are static, fully-validated schema fields
  // and `byPool` in appConfig is exhaustive.
  //
  // Each DOES have a default (below), so omitting one is legal and boots at that
  // value. Two things this does NOT mean:
  //  - It is not the same as the limiter's removed fallback for a pool with no
  //    `byPool` entry. LlmRateLimiterService now throws there instead. That
  //    guards CODE/CONFIG DRIFT, not operator input — `satisfies Record<Pool,
  //    RateLimitPolicy>` makes an entry mandatory, so it is unreachable through
  //    real config. Do not read it as validation of these env vars.
  //  - A default is only consulted for a pool actually IN USE. An unused pool
  //    gets no bucket and therefore no limiter, so its cap is never read.
  //
  // NB the defaults are not equally conservative: 18 is a genuine floor (10%
  // under a strict 20 rpm, the lowest common tier) while 60/35 are OUR
  // provisioned Azure numbers. If you provision differently and forget the var,
  // 60/35 will silently be wrong for you.
  //
  // Each caps outbound structured LLM calls per API KEY, to protect that key's
  // provider quota. Each key gets its own limiter at its pool's rate, so a pool's
  // aggregate CAPACITY CEILING is its rate × its key count — a ceiling, not a
  // guaranteed rate: utilization depends on how routing keys hash across them.
  // Whether one conversation's calls concentrate on a single key is a per-stage
  // decision (see CacheAffinity in llm/llm-stage-policy.ts), so the per-key value
  // bounds a journey only for the stages that pin. Overflow
  // queues in-process and drains as the window refreshes — see
  // LlmRateLimiterService. Transcription (AssemblyAI) is a separate quota and is
  // NOT gated by any of these.
  //
  // Smoothing (minTime = 60000 / rpm) is DERIVED from the cap — see
  // rateLimitPolicy — so the budget is paced evenly rather than bursted, and
  // there is no separate min-time env var to drift out of sync.

  // Interactive serves the cleaning stage: user-paced and latency-critical, since
  // it sits between the user sending a message and seeing it.
  LLM_RPM_INTERACTIVE: rpmSchema('60'),
  // Analysis serves the eight portfolio-graph stages: machine-paced bursts of ~9
  // calls per turn. NB minTime pacing (60000/35 ≈ 1714ms) applies PER KEY, and only
  // check_completeness pins a journey to one key — the other seven spread across
  // the pool. So BOTH levers are live here: raise this cap to speed up the pinned
  // stage, add a key to relieve the rest. (Pacing only bites when calls arrive
  // faster than the interval; the graph stages run sequentially, so it competes
  // with model latency rather than simply adding to it.)
  LLM_RPM_ANALYSIS: rpmSchema('35'),
  // The two account-scoped provider pools. 18 = 10% headroom under a strict
  // 20 req/min, the historical default for these.
  LLM_RPM_OPENAI: rpmSchema('18'),
  LLM_RPM_OPENROUTER: rpmSchema('18'),

  // LLM credentials — one or more (key, base URL) endpoints PER POOL, each
  // carrying its own quota. Supplied as pool-scoped indexed pairs
  // <PREFIX>_API_KEY_<i> / <PREFIX>_BASE_URL_<i> (i = 1..8), where <PREFIX> comes
  // from POOL_SPECS in llm/llm-pools.ts:
  //
  //   AZURE_FOUNDRY_INTERACTIVE_*  AZURE_FOUNDRY_ANALYSIS_*  OPENAI_*  OPENROUTER_*
  //
  // These are variable-cardinality, so they can't be static schema fields — they
  // are parsed by parseLlmPools() below. Only the pools the active variant
  // actually uses are required, and that is enforced at startup by
  // ModelConfigService. Base URL is the OpenAI-compatible surface, e.g.
  // https://<resource>.services.ai.azure.com/openai/v1/ for Foundry or
  // https://api.openai.com/v1 for OpenAI.

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

/**
 * One LLM endpoint: an API key paired with its OpenAI-compatible base URL.
 *
 * Deliberately provider-agnostic — every provider we call is OpenAI-wire
 * compatible, so this pair is the complete credential for all of them. There is
 * no second credential shape anywhere in the LLM layer.
 */
export interface LlmEndpoint {
  apiKey: string;
  baseURL: string;
}

/** Every pool's endpoints. Pools the active variant doesn't use may be empty. */
export type LlmPools = Record<Pool, LlmEndpoint[]>;

/** A resolved rate-limit policy: the cap, plus the pacing derived from it. */
export interface RateLimitPolicy {
  rpm: number;
  minTimeMs: number;
}

const MAX_ENDPOINTS_PER_POOL = 8;
const baseUrlSchema = z.string().url();
const configLogger = new Logger('AppConfig');

/**
 * Derive a rate-limit policy from a cap. `minTime` is DERIVED, never its own env
 * var, so pacing can never drift out of lockstep with the cap it paces. Exported
 * as a pure function so that derivation can be unit-tested directly.
 */
export const rateLimitPolicy = (rpm: number): RateLimitPolicy => ({
  rpm,
  minTimeMs: Math.floor(60_000 / rpm),
});

/**
 * Parse one pool's indexed endpoint pairs (`<PREFIX>_API_KEY_<i>` /
 * `<PREFIX>_BASE_URL_<i>`, prefix from POOL_SPECS) into an ordered list.
 *
 * ONE parser for every pool, provider included: the only thing that varies is
 * the prefix and the duplicate-URL rule, both read from the pool's spec. That is
 * the point — a provider whose credentials were parsed some other way would be a
 * second credential plane, which is exactly what this design removes.
 *
 * Endpoints are variable-cardinality (1..N keys, each its own quota), so they
 * can't be static Zod fields — this is the one place config reads process.env by
 * pattern, and each value is still validated:
 *  - a slot with BOTH vars set → a valid endpoint,
 *  - a slot with NEITHER set → skipped,
 *  - a slot with EXACTLY ONE set → throws (half-configured; naming pool and index)
 *    so a key never routes to a missing URL, or vice versa, undetected,
 *  - the SAME api key in two slots → always throws (see below),
 *  - two slots with the same base URL → throws ONLY where that implies a shared
 *    quota (see PoolSpec.baseUrlImpliesSharedQuota).
 */
export function parseEndpoints(env: NodeJS.ProcessEnv, pool: Pool): LlmEndpoint[] {
  const { envPrefix: prefix, baseUrlImpliesSharedQuota } = POOL_SPECS[pool];
  const endpoints: LlmEndpoint[] = [];
  const seenBaseUrls = new Map<string, number>(); // normalized base URL → first index
  const seenApiKeys = new Map<string, number>(); // api key → first index

  for (let i = 1; i <= MAX_ENDPOINTS_PER_POOL; i++) {
    const apiKey = env[`${prefix}_API_KEY_${i}`]?.trim();
    const baseUrl = env[`${prefix}_BASE_URL_${i}`]?.trim();

    if (!apiKey && !baseUrl) continue;
    if (!apiKey || !baseUrl) {
      throw new Error(
        `LLM pool '${pool}' endpoint ${i} is half-configured: set BOTH ` +
          `${prefix}_API_KEY_${i} and ${prefix}_BASE_URL_${i}, or neither.`
      );
    }

    // One key in two slots is never right, for any pool: it is one credential
    // and therefore one quota, so the second slot only adds a limiter. Unlike
    // the base-URL rule below this needs no per-pool policy — it holds whatever
    // the quota is scoped to.
    //
    // Deliberately NARROW. It catches a duplicated paste, nothing more. For
    // account-scoped pools the far likelier mistake is two DIFFERENT keys from
    // one account (see PoolSpec.baseUrlImpliesSharedQuota) — those keys differ,
    // so they sail past this check. Do not read its presence as coverage of
    // that case; there is no parse-time signal for it.
    const firstKeyIndex = seenApiKeys.get(apiKey);
    if (firstKeyIndex !== undefined) {
      throw new Error(
        `LLM pool '${pool}' endpoints ${firstKeyIndex} and ${i} use the SAME api key. ` +
          `One key is one quota, so the duplicate adds a rate limiter without adding ` +
          `capacity. Configure a distinct credential, or remove the extra slot.`
      );
    }
    seenApiKeys.set(apiKey, i);

    const parsedUrl = baseUrlSchema.safeParse(baseUrl);
    if (!parsedUrl.success) {
      throw new Error(`${prefix}_BASE_URL_${i} must be a valid URL.`);
    }

    const normalized = normalizeBaseUrl(parsedUrl.data);
    const firstIndex = seenBaseUrls.get(normalized);
    // Only meaningful where the base URL identifies the quota holder. On Azure
    // Foundry it identifies the RESOURCE, and a resource labels its access keys
    // "Key 1"/"Key 2" — matching our _1/_2 naming — so pasting one resource's
    // two keys is an easy mistake that would spin up two limiters against a
    // single quota (→ sustained 429s). For account-scoped providers the same
    // shape is legitimate: two OpenAI keys from different orgs necessarily share
    // api.openai.com while holding independent quotas.
    if (baseUrlImpliesSharedQuota && firstIndex !== undefined) {
      throw new Error(
        `LLM pool '${pool}' endpoints ${firstIndex} and ${i} share the same base ` +
          `URL (${parsedUrl.data}). Two keys of ONE resource share a single RPM quota — ` +
          `configure keys from DISTINCT resources/deployments, not "Key 1"/"Key 2" of ` +
          `the same resource.`
      );
    }
    if (firstIndex === undefined) seenBaseUrls.set(normalized, i);

    endpoints.push({ apiKey, baseURL: parsedUrl.data });
  }
  return endpoints;
}

/** Parse every pool's endpoints. Unconfigured pools yield an empty list. */
export function parseLlmPools(env: NodeJS.ProcessEnv): LlmPools {
  const pools = Object.fromEntries(
    ALL_POOLS.map((pool) => [pool, parseEndpoints(env, pool)])
  ) as LlmPools;

  warnOnSharedResources(pools);
  return pools;
}

/**
 * Warn — but do NOT throw — when two RESOURCE-SCOPED pools point at the same
 * base URL.
 *
 * Within such a pool this is fatal (same resource ⇒ one quota). Across pools it
 * is usually fine: Azure assigns quota PER DEPLOYMENT, and two pools on one
 * resource normally means two different deployments with independent caps. But
 * if they do turn out to share a quota, the two limiters cannot prevent 429s
 * between them — and that failure is otherwise very hard to attribute, so it's
 * worth a startup line pointing straight at the cause.
 *
 * Account-scoped pools are skipped entirely: for them a shared base URL is the
 * norm, so warning would be pure noise.
 */
function warnOnSharedResources(pools: LlmPools): void {
  const seen = new Map<string, Pool>(); // normalized base URL → first pool that used it

  for (const pool of ALL_POOLS) {
    if (!POOL_SPECS[pool].baseUrlImpliesSharedQuota) continue;
    for (const { baseURL } of pools[pool]) {
      const normalized = normalizeBaseUrl(baseURL);
      const firstPool = seen.get(normalized);
      if (firstPool !== undefined && firstPool !== pool) {
        configLogger.warn(
          `LLM pools '${firstPool}' and '${pool}' both use ${baseURL}. That is ` +
            `safe only if they target DIFFERENT deployments on that resource — deployments ` +
            `carry their own quota, resources do not. If you see unexplained 429s, this is ` +
            `the first thing to check: their separate rate limiters cannot pace a shared quota.`
        );
      }
      if (firstPool === undefined) seen.set(normalized, pool);
    }
  }
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
    llm: {
      variant: env.LLM_VARIANT,
      // Every pool's credentials, in one place. `satisfies Record<Pool, …>` on
      // the caps and an exhaustive parser over ALL_POOLS mean a new pool cannot
      // be half-wired: the compiler demands a cap, and the parser gives it a
      // (possibly empty) endpoint list that ModelConfigService then validates.
      pools: parseLlmPools(process.env),
      rateLimit: {
        byPool: {
          [Pool.Interactive]: rateLimitPolicy(env.LLM_RPM_INTERACTIVE),
          [Pool.Analysis]: rateLimitPolicy(env.LLM_RPM_ANALYSIS),
          [Pool.OpenAI]: rateLimitPolicy(env.LLM_RPM_OPENAI),
          [Pool.OpenRouter]: rateLimitPolicy(env.LLM_RPM_OPENROUTER),
        } satisfies Record<Pool, RateLimitPolicy>,
      },
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
