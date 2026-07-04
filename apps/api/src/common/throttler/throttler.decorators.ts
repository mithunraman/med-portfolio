import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { THROTTLER_NAMES } from '../../config/rate-limit.config';

/**
 * Cap a route at `limit` per `ttl` by REPLACING every configured tier with this
 * single `{limit, ttl}`.
 *
 * The app registers NAMED throttlers, and the guard resolves overrides by
 * throttler name — so a `@Throttle({ default: … })` override is a silent no-op.
 * This helper fans the override out to every configured name so the cap actually
 * binds regardless of which tiers exist.
 *
 * IMPORTANT: this REPLACES, it does not intersect. NestJS `@Throttle` overrides
 * swap out the named tier's global config for this route, so the value you pass
 * becomes the route's ENTIRE rate-limit policy — the global tiers (short/medium/
 * long) no longer apply. Pass something tighter than every global tier you care
 * about, or you will LOOSEN the ones you don't: e.g. `{ limit: 100, ttl: 1000 }`
 * as a 100/sec burst cap also rewrites the `long` tier to 100/sec, discarding
 * the 2000/hr volumetric guard. If you ever need "tighten one window, keep the
 * others", this uniform helper can't express it — add a per-tier override form.
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
