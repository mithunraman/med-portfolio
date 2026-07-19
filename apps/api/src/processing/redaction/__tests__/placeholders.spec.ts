import { toPlaceholder } from '../../../language/azure-language.service';
import { PLACEHOLDER_PATTERN, placeholderTypes } from '../placeholders';
import { OFFLINE_PLACEHOLDERS } from '../uk-pii-patterns';

describe('placeholderTypes', () => {
  it('extracts distinct bracketed placeholder tokens', () => {
    expect(placeholderTypes('Seen by [PERSON] at [ORGANIZATION], NHS [NHS_NUMBER]')).toEqual(
      new Set(['[PERSON]', '[ORGANIZATION]', '[NHS_NUMBER]'])
    );
  });

  it('collapses repeats to a set and ignores non-placeholder brackets', () => {
    expect(placeholderTypes('[PERSON] and [PERSON] — see [notes] and BP 140/90')).toEqual(
      new Set(['[PERSON]'])
    );
  });

  it('returns an empty set when there are no placeholders', () => {
    expect(placeholderTypes('BP 140/90, HR 88, tamsulosin 400mcg')).toEqual(new Set());
  });
});

describe('placeholder shape conformance (the guard must recognise every emitted token)', () => {
  it('recognises every offline (uk-pii) placeholder', () => {
    expect(OFFLINE_PLACEHOLDERS.length).toBeGreaterThan(0);
    for (const token of OFFLINE_PLACEHOLDERS) {
      expect(PLACEHOLDER_PATTERN.test(token)).toBe(true);
      // The exact extraction path the cleaning guard uses must recover the token.
      expect(placeholderTypes(token)).toEqual(new Set([token]));
    }
  });

  it('recognises every Azure toPlaceholder output', () => {
    // A spread of real Azure PHI categories — incl. multi-word ones and the
    // synthetic [AGE] bucket. toPlaceholder snake-uppercases, so all must conform.
    const categories = [
      'Person',
      'PhoneNumber',
      'Organization',
      'Address',
      'Email',
      'DateTime',
      'Quantity',
      'UKNationalHealthNumber',
      'USSocialSecurityNumber',
      'Age', // the [AGE] fallback for an unreadable age
    ];
    for (const category of categories) {
      const token = toPlaceholder(category);
      expect(PLACEHOLDER_PATTERN.test(token)).toBe(true);
      expect(placeholderTypes(token)).toEqual(new Set([token]));
    }
  });
});
