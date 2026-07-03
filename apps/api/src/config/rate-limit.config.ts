/**
 * Layered rate limiting configuration (per-IP, in-memory).
 *
 * Three nested windows, each catching abuse at a different timescale — the
 * allowed average rate tightens as the window grows:
 *   - short:  burst guard (hot loops, scripted bursts)
 *   - medium: sustained-script guard
 *   - long:   volumetric guard (slow-drip scraping / cost-amplification)
 *
 * These are a generous GLOBAL baseline that normal app usage never trips;
 * sensitive routes tighten further via `@RateLimit()` (see common/throttler).
 *
 * NOTE: the guard resolves per-route overrides by throttler NAME, so any
 * override/skip must be keyed by these names — never `default`. Use the
 * `@RateLimit()` / `@SkipAllThrottles()` helpers, which derive the keys from
 * `THROTTLER_NAMES` below and are immune to that footgun.
 */
export const rateLimitConfig = {
  short: { name: 'short', ttl: 10_000, limit: 50 }, // 50 per 10 seconds
  medium: { name: 'medium', ttl: 60_000, limit: 200 }, // 200 per minute
  long: { name: 'long', ttl: 3_600_000, limit: 2000 }, // 2000 per hour
} as const;

/** The single source of truth for configured throttler names. */
export const THROTTLER_NAMES = Object.keys(rateLimitConfig) as (keyof typeof rateLimitConfig)[];
