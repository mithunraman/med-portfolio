import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { TIER_VISUALS, type ReadinessTier } from './tier';

interface Props {
  tier: ReadinessTier;
  /** When false, the chip is rendered muted (threshold not yet met). */
  meetsThreshold?: boolean;
}

/**
 * Compact pill showing a single section's readiness tier (missing/thin/adequate/strong).
 * Pure presentational — colour is resolved from the active theme.
 */
export const TierChip = memo(function TierChip({ tier, meetsThreshold = true }: Props) {
  const { colors } = useTheme();
  const visual = TIER_VISUALS[tier];
  const color = visual.color(colors);

  return (
    <View style={[styles.chip, { borderColor: color }, !meetsThreshold && styles.muted]}>
      <Text style={[styles.icon, { color }]}>{visual.icon}</Text>
      <Text style={[styles.label, { color }]}>{visual.label}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  muted: {
    opacity: 0.55,
  },
  icon: {
    fontSize: 11,
    fontWeight: '700',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
  },
});
