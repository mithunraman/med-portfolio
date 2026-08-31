import { validateCronExpression } from 'cron';
import { CRON_SCHEDULES } from '../cron.constants';

/**
 * A malformed expression currently surfaces at boot, in a Nest startup trace.
 * Catching it here is cheaper, and matters more now that the expressions live
 * away from the jobs they schedule.
 *
 * `validateCronExpression` comes from `cron`, already a transitive dependency
 * of `@nestjs/schedule` — no new package for this.
 */
describe('CRON_SCHEDULES', () => {
  it.each(Object.entries(CRON_SCHEDULES))('%s is a valid cron expression', (_name, expression) => {
    expect(validateCronExpression(expression).valid).toBe(true);
  });

  it('uses six-field expressions throughout', () => {
    // `cron` detects the field count, so a DROPPED field does not fail
    // validation — it silently changes the schedule. `'0 0 * * * *'` (hourly)
    // minus one field is `'0 0 * * *'`, valid and meaning "midnight daily".
    // Validity alone cannot catch that, so the field count is asserted
    // separately.
    for (const [name, expression] of Object.entries(CRON_SCHEDULES)) {
      expect(`${name}: ${expression.trim().split(/\s+/).length} fields`).toBe(`${name}: 6 fields`);
    }
  });
});
