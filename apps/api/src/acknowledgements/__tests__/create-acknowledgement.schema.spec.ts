import { createAcknowledgementRequestSchema } from '@acme/shared';

// Validation lives at the controller boundary (ZodValidationPipe). These
// tests cover the schema directly because Zod-rejected bodies never reach
// the service — there's no other layer to assert on.
describe('createAcknowledgementRequestSchema', () => {
  const valid = {
    noticeVersion: 'v1.0',
    acknowledgements: [
      { id: 'role_uk_trainee' as const, given: true },
      { id: 'patient_anon_duty' as const, given: true },
    ],
  };

  it('accepts a well-formed body', () => {
    expect(createAcknowledgementRequestSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects duplicate ack ids (the audit-record hole)', () => {
    const result = createAcknowledgementRequestSchema.safeParse({
      noticeVersion: 'v1.0',
      acknowledgements: [
        { id: 'role_uk_trainee', given: false },
        { id: 'role_uk_trainee', given: true },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => /unique/.test(i.message))).toBe(true);
    }
  });

  it('rejects an empty acknowledgements array', () => {
    const result = createAcknowledgementRequestSchema.safeParse({
      noticeVersion: 'v1.0',
      acknowledgements: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects oversize arrays (>20 entries)', () => {
    // The body also violates `.refine(unique)` since the enum only has 2 values,
    // so `success: false` alone wouldn't isolate the .max(20) bound. Assert on
    // the `too_big` issue code to pin the constraint independently.
    const result = createAcknowledgementRequestSchema.safeParse({
      noticeVersion: 'v1.0',
      acknowledgements: Array.from({ length: 21 }, () => ({
        id: 'role_uk_trainee' as const,
        given: true,
      })),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.code === 'too_big')).toBe(true);
    }
  });

  it('rejects unknown ack ids', () => {
    const result = createAcknowledgementRequestSchema.safeParse({
      noticeVersion: 'v1.0',
      acknowledgements: [{ id: 'something_else', given: true }],
    });
    expect(result.success).toBe(false);
  });
});
