import { validateCronExpression } from 'cron';
import { CRON_SCHEDULES } from '../cron.constants';

/**
 * A malformed expression currently surfaces at boot, in a Nest startup trace.
 * Catching it here is cheaper, and matters more now that the expressions live
 * away from the jobs they schedule: the likely mistake is a five-field string
 * pasted from crontab.guru, which `@nestjs/schedule` reads as a different
 * schedule entirely rather than rejecting.
 *
 * `validateCronExpression` comes from `cron`, already a transitive dependency
 * of `@nestjs/schedule` — no new package for this.
 */
describe('CRON_SCHEDULES', () => {
  it.each(Object.entries(CRON_SCHEDULES))('%s is a valid cron expression', (_name, expression) => {
    expect(validateCronExpression(expression).valid).toBe(true);
  });

  it('uses six-field expressions throughout', () => {
    // Five fields parse successfully but mean something else — `'0 0 * * *'` is
    // "midnight daily", not "hourly". Validity alone cannot catch that, so the
    // field count is asserted separately.
    for (const [name, expression] of Object.entries(CRON_SCHEDULES)) {
      expect(`${name}: ${expression.trim().split(/\s+/).length} fields`).toBe(`${name}: 6 fields`);
    }
  });
});
