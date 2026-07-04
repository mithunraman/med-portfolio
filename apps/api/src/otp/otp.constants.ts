/**
 * The maximum configurable OTP rate-limit window, in minutes. Single source of
 * truth for two coupled values that must satisfy `retention >= maxWindow`:
 *   - the Zod `.max()` on OTP_RATE_LIMIT_WINDOW_MINUTES (app.config.ts), and
 *   - OTP_RETENTION_SECONDS, the createdAt TTL (otp.schema.ts).
 *
 * The send-rate limit counts rows with `createdAt >= now - window`, so rows must
 * be retained at least as long as the largest window a deployment can configure,
 * or the count silently under-reports and the per-email cap is defeated.
 */
export const MAX_OTP_WINDOW_MINUTES = 60;

/**
 * Extra retention beyond the max window, so the TTL reaper never removes a row
 * that is still inside the counting window even at the boundary, and to absorb
 * future changes to the count's boundary semantics.
 */
export const OTP_RETENTION_MARGIN_MINUTES = 5;
