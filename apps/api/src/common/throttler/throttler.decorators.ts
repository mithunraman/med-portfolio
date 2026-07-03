import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { THROTTLER_NAMES } from '../../config/rate-limit.config';

/**
 * Cap a route at `limit` per `ttl` across every configured tier.
 *
 * The app registers NAMED throttlers, and the guard resolves overrides by
 * throttler name — so a `@Throttle({ default: … })` override is a silent no-op.
 * This helper fans the override out to every configured name, so the tightest
 * single limit always binds regardless of which tiers exist.
 */
export const RateLimit = (opts: { limit: number; ttl: number }) =>
  Throttle(Object.fromEntries(THROTTLER_NAMES.map((name) => [name, opts])));

/**
 * Genuinely exempt a route from ALL tiers (e.g. health/liveness probes).
 *
 * A bare `@SkipThrottle()` only skips a throttler named `default`, which does
 * not exist here — so it never skips anything. This keys the skip by every
 * configured name.
 */
export const SkipAllThrottles = () =>
  SkipThrottle(Object.fromEntries(THROTTLER_NAMES.map((name) => [name, true])));
