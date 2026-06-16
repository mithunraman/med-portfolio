import { useCallback, useState } from 'react';

/**
 * Minimum number of options that must be hidden for collapsing to be worthwhile.
 * Below this, the "Show more" affordance costs more friction than it saves, so
 * we render the full list instead.
 */
const MIN_HIDDEN_TO_COLLAPSE = 3;

interface CollapsibleOptions {
  /** Max options to show while collapsed. */
  maxVisible?: number;
  /** When false, collapsing is disabled and all options are returned. */
  enabled?: boolean;
}

/**
 * Decides whether a long option list should be folded behind a one-way
 * "Show more" affordance. Pure presentation logic shared by single- and
 * multi-select so their collapse behavior can never drift apart.
 *
 * Expansion is intentionally one-way (no collapse back): once a user opts into
 * the full list they are about to answer, and the answered state renders only
 * the selected options anyway.
 */
export function useCollapsibleOptions<T>(
  options: T[],
  { maxVisible = 5, enabled = true }: CollapsibleOptions = {}
) {
  const [expanded, setExpanded] = useState(false);
  const hiddenCount = Math.max(0, options.length - maxVisible);
  const collapsed = enabled && !expanded && hiddenCount >= MIN_HIDDEN_TO_COLLAPSE;
  const visible = collapsed ? options.slice(0, maxVisible) : options;
  const expand = useCallback(() => setExpanded(true), []);

  return { visible, hiddenCount, collapsed, expand };
}
