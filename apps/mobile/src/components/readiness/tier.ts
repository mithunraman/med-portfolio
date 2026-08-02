import type { ReadinessSection } from '@acme/shared';
import type { Ionicons } from '@expo/vector-icons';
import type { ThemeColors } from '../../theme';

export type ReadinessTier = ReadinessSection['tier'];

/** Presentation metadata for a readiness tier - colour resolved against the active theme. */
export interface TierVisual {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: (c: ThemeColors) => string;
}

/**
 * Single source of truth mapping a readiness tier → its chip presentation.
 * Consumed by TierChip and (indirectly) the readiness header.
 *
 * Icons are vector glyphs rather than the literal characters (○ ⚠ ● ✓) used
 * previously: those rendered at whatever weight the system font supplied, which
 * was inconsistent across platforms and soft at small sizes. The progression is
 * unchanged - empty ring → warning → filled → tick.
 */
export const TIER_VISUALS: Record<ReadinessTier, TierVisual> = {
  missing: { label: 'Missing', icon: 'ellipse-outline', color: (c) => c.textSecondary },
  shallow: { label: 'Thin', icon: 'alert-circle-outline', color: (c) => c.warning },
  adequate: { label: 'Adequate', icon: 'ellipse', color: (c) => c.primary },
  strong: { label: 'Strong', icon: 'checkmark-circle', color: (c) => c.accent },
};
