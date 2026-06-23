import { UpdateNotesRequestSchema } from '@acme/shared';

// The DTO is enforced at the request boundary via ZodValidationPipe. These guard
// the cross-element invariant the reconcile relies on: existing-note xids are
// unique within a single request.

describe('UpdateNotesRequestSchema', () => {
  it('accepts multiple new notes (no xid)', () => {
    const result = UpdateNotesRequestSchema.safeParse({
      notes: [{ text: 'first' }, { text: 'second' }],
    });

    expect(result.success).toBe(true);
  });

  it('accepts distinct existing xids alongside new notes', () => {
    const result = UpdateNotesRequestSchema.safeParse({
      notes: [{ xid: 'n1', text: 'a' }, { xid: 'n2', text: 'b' }, { text: 'new' }],
    });

    expect(result.success).toBe(true);
  });

  it('rejects two entries citing the same existing xid', () => {
    const result = UpdateNotesRequestSchema.safeParse({
      notes: [{ xid: 'n1', text: 'a' }, { xid: 'n1', text: 'b' }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Duplicate note ids are not allowed');
    }
  });

  it('rejects an empty note text (trimmed)', () => {
    const result = UpdateNotesRequestSchema.safeParse({ notes: [{ text: '   ' }] });

    expect(result.success).toBe(false);
  });
});
