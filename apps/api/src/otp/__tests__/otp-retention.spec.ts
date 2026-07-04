import { MAX_OTP_WINDOW_MINUTES } from '../otp.constants';
import { OTP_RETENTION_SECONDS } from '../schemas/otp.schema';

describe('OTP retention invariant', () => {
  // The send-rate limit counts rows with `createdAt >= now - window`, so rows
  // must be retained at least as long as the largest configurable window, or
  // the createdAt TTL reaps rows inside the counting window → countRecentByEmail
  // under-counts → the per-email send cap is silently defeated. Even though
  // OTP_RETENTION_SECONDS is derived from MAX_OTP_WINDOW_MINUTES today, this
  // guards against a future edit that de-couples them.
  it('retains rows at least as long as the max rate-limit window', () => {
    expect(OTP_RETENTION_SECONDS).toBeGreaterThanOrEqual(MAX_OTP_WINDOW_MINUTES * 60);
  });
});
