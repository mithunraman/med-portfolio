import {
  AddPdpGoalActionRequestSchema,
  ARTEFACT_REVIEW_COMMENT_MAX_LENGTH,
  normalizeMultilineText,
  normalizeSingleLineText,
  PDP_ACTION_MAX_LENGTH,
  PDP_COMPLETION_REVIEW_MAX_LENGTH,
  UpdatePdpGoalRequestSchema,
  UpsertArtefactReviewRequestSchema,
} from '@acme/shared';

describe('normalizeMultilineText', () => {
  it('collapses 3+ newlines to a single blank line', () => {
    expect(normalizeMultilineText('a\n\n\n\nb')).toBe('a\n\nb');
  });

  it('preserves a single blank line (paragraph break)', () => {
    expect(normalizeMultilineText('a\n\nb')).toBe('a\n\nb');
  });

  it('normalises CRLF, strips per-line trailing whitespace, and trims', () => {
    expect(normalizeMultilineText('  a  \r\n\r\n\r\nb  \n')).toBe('a\n\nb');
  });

  it('is idempotent', () => {
    const once = normalizeMultilineText('a\n\n\n\nb   \n');
    expect(normalizeMultilineText(once)).toBe(once);
  });
});

describe('normalizeSingleLineText', () => {
  it('flattens internal whitespace and newlines to single spaces', () => {
    expect(normalizeSingleLineText('  My   goal\n\nname ')).toBe('My goal name');
  });

  it('is idempotent', () => {
    const once = normalizeSingleLineText('  a\n b   c ');
    expect(normalizeSingleLineText(once)).toBe(once);
  });
});

describe('UpdatePdpGoalRequestSchema (boundary transform)', () => {
  it('normalises completionReview whitespace on parse', () => {
    expect(UpdatePdpGoalRequestSchema.parse({ completionReview: 'a\n\n\n\nb  ' })).toEqual({
      completionReview: 'a\n\nb',
    });
  });

  it('maps a whitespace-only completionReview to null', () => {
    expect(UpdatePdpGoalRequestSchema.parse({ completionReview: '   \n\n  ' })).toEqual({
      completionReview: null,
    });
  });

  it('passes an explicit null through', () => {
    expect(UpdatePdpGoalRequestSchema.parse({ completionReview: null })).toEqual({
      completionReview: null,
    });
  });

  it('accepts a completionReview at the max length', () => {
    const atMax = 'a'.repeat(PDP_COMPLETION_REVIEW_MAX_LENGTH);
    expect(UpdatePdpGoalRequestSchema.parse({ completionReview: atMax })).toEqual({
      completionReview: atMax,
    });
  });

  it('rejects a completionReview over the max length (cleaned value)', () => {
    const overMax = 'a'.repeat(PDP_COMPLETION_REVIEW_MAX_LENGTH + 1);
    expect(() => UpdatePdpGoalRequestSchema.parse({ completionReview: overMax })).toThrow();
  });
});

describe('nullableMultilineText max is validated on the cleaned value', () => {
  // Consistency with multilineText/singleLineText: length is checked after
  // normalization, so trailing/blank-line whitespace can't push a comment that
  // fits over the limit.
  it('accepts a comment that exceeds max raw but fits once whitespace is stripped', () => {
    const body = 'a'.repeat(ARTEFACT_REVIEW_COMMENT_MAX_LENGTH);
    const raw = `${body}${'\n'.repeat(20)}`; // over max raw, exactly max once trimmed
    expect(UpsertArtefactReviewRequestSchema.parse({ rating: 5, comment: raw })).toEqual({
      rating: 5,
      comment: body,
    });
  });

  it('still rejects a comment that exceeds max after normalization', () => {
    const raw = 'a'.repeat(ARTEFACT_REVIEW_COMMENT_MAX_LENGTH + 1);
    expect(() => UpsertArtefactReviewRequestSchema.parse({ rating: 5, comment: raw })).toThrow();
  });
});

describe('AddPdpGoalActionRequestSchema (single-line action)', () => {
  it('flattens embedded newlines to single spaces', () => {
    expect(
      AddPdpGoalActionRequestSchema.parse({ action: 'Attend clinic\n\nRead guidelines' })
    ).toEqual({ action: 'Attend clinic Read guidelines' });
  });

  it('rejects a whitespace-only action (fails min after normalization)', () => {
    expect(() => AddPdpGoalActionRequestSchema.parse({ action: '   \n  ' })).toThrow();
  });

  it('rejects an action over the max length', () => {
    const overMax = 'a'.repeat(PDP_ACTION_MAX_LENGTH + 1);
    expect(() => AddPdpGoalActionRequestSchema.parse({ action: overMax })).toThrow();
  });
});
