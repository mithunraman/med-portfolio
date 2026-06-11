import type { ReadinessSection } from '@acme/shared';
import type { ThemeColors } from '../../theme';

export type ReadinessTier = ReadinessSection['tier'];

/** Presentation metadata for a readiness tier — colour resolved against the active theme. */
export interface TierVisual {
  label: string;
  icon: string;
  color: (c: ThemeColors) => string;
}

/**
 * Single source of truth mapping a readiness tier → its chip presentation.
 * Consumed by TierChip and (indirectly) the readiness header.
 */
export const TIER_VISUALS: Record<ReadinessTier, TierVisual> = {
  missing: { label: 'Missing', icon: '○', color: (c) => c.textSecondary },
  shallow: { label: 'Thin', icon: '⚠', color: (c) => c.warning },
  adequate: { label: 'Adequate', icon: '●', color: (c) => c.primary },
  strong: { label: 'Strong', icon: '✓', color: (c) => c.accent },
};
