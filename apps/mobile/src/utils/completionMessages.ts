/**
 * Completion-card copy for a finished portfolio entry (MOB-063).
 *
 * The message is varied so trainees who log many cases don't see the same six
 * words every time — but the tone stays calm and professional, since these are
 * serious clinical cases (no confetti-speak). See also MOB-067 / MOB-071.
 *
 * Selection is *deterministic per entry* (keyed off the artefact id), not random
 * on each render — otherwise the message would flicker whenever the completed
 * screen re-renders.
 */
export interface CompletionMessage {
  heading: string;
  supportText: string;
}

const MESSAGES: CompletionMessage[] = [
  {
    heading: 'Case ready',
    supportText: 'Your draft is saved — give it a review before you finish.',
  },
  { heading: 'Draft complete', supportText: "We've turned your case into portfolio evidence." },
  { heading: 'Nicely done', supportText: 'Your case is ready to review.' },
  {
    heading: "That's captured",
    supportText: 'Your case is written up and ready for a final check.',
  },
  { heading: 'Ready for review', supportText: 'Take a look through before you mark it done.' },
];

/** Deterministic 32-bit string hash (FNV-1a). Stable across renders and sessions. */
function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Picks a completion message for an entry. The same `key` always yields the same
 * message. Falls back to the first variant when no key is available.
 */
export function getCompletionMessage(key: string | null | undefined): CompletionMessage {
  if (!key) return MESSAGES[0];
  return MESSAGES[hashString(key) % MESSAGES.length];
}
