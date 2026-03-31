/**
 * Burst rate limiting configuration.
 * Protects against scripted abuse and stuck retry loops.
 * Applied globally via @nestjs/throttler — IP-based, in-memory.
 */
export const rateLimitConfig = {
  short: { name: 'short', ttl: 10_000, limit: 20 },  // 20 per 10 seconds
  medium: { name: 'medium', ttl: 60_000, limit: 60 }, // 60 per minute
};
