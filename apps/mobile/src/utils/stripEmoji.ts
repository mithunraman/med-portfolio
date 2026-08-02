import emojiRegex from 'emoji-regex';

// One shared matcher. `emojiRegex()` returns a global regex; `String.replace`
// resets its lastIndex on each call, so reusing a single instance is safe.
const EMOJI = emojiRegex();

/**
 * Removes emoji (including flags, skin-tone and ZWJ sequences) from a string.
 *
 * Used to keep portfolio entries professional - these are serious clinical
 * cases (MOB-067). Applied at the entry text inputs so typing *and* pasting are
 * both covered. Non-emoji characters (accents, medical symbols like °/µ/±) are
 * left untouched.
 */
export function stripEmoji(text: string): string {
  return text.replace(EMOJI, '');
}
