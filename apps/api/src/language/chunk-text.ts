/**
 * Split text into contiguous chunks each no longer than `maxChars`.
 *
 * Azure AI Language's synchronous PII endpoint caps a single document at 5,120
 * characters, so long voice transcripts must be split before analysis. Chunks
 * are cut on the nearest natural boundary at or before the limit (paragraph →
 * sentence → whitespace) to avoid slicing through a word — which would split an
 * entity across two documents and defeat detection.
 *
 * The chunks are exact, contiguous slices of the input: concatenating them
 * reproduces the original string byte-for-byte (no trimming, no loss). That
 * invariant is what lets the caller redact each chunk independently and join the
 * results back into faithful text.
 */
export function chunkText(text: string, maxChars: number): string[] {
  if (maxChars <= 0) {
    throw new Error(`chunkText: maxChars must be positive, got ${maxChars}`);
  }
  if (text.length === 0) return [];
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxChars) {
    const splitAt = findSplitPoint(remaining, maxChars);
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  if (remaining.length > 0) chunks.push(remaining);

  return chunks;
}

/**
 * Find the index to slice at: the last natural boundary within the first
 * `maxChars` characters. Boundary characters stay in the left chunk so no
 * character is dropped. Falls back to a hard cut at `maxChars` when the window
 * contains no boundary (e.g. a single very long token).
 */
function findSplitPoint(text: string, maxChars: number): number {
  const window = text.slice(0, maxChars);

  const boundary = Math.max(
    window.lastIndexOf('\n'),
    window.lastIndexOf('. '),
    window.lastIndexOf('? '),
    window.lastIndexOf('! '),
    window.lastIndexOf(' ')
  );

  // No boundary found, or it sits at the very start — hard-split at the limit.
  if (boundary <= 0) return maxChars;

  // Keep the boundary character in the left chunk.
  return boundary + 1;
}
