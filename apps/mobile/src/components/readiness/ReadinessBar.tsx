import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';

const MAX_SCORE = 10;

interface Props {
  /** Readiness on a 0–10 scale. */
  score: number;
  /** Hide the numeric "n/10" label (e.g. when shown elsewhere). */
  hideLabel?: boolean;
}

/**
 * 10-segment progress bar visualising the 0–10 readiness score.
 * Filled segments take the accent colour; the rest read as muted track.
 */
export const ReadinessBar = memo(function ReadinessBar({ score, hideLabel = false }: Props) {
  const { colors } = useTheme();
  const filled = Math.max(0, Math.min(MAX_SCORE, Math.round(score)));

  return (
    <View style={styles.row}>
      <View style={styles.track}>
        {Array.from({ length: MAX_SCORE }, (_, i) => (
          <View
            key={i}
            style={[
              styles.segment,
              { backgroundColor: i < filled ? colors.accent : colors.border },
            ]}
          />
        ))}
      </View>
      {!hideLabel && (
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          {filled}/{MAX_SCORE}
        </Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  track: {
    flex: 1,
    flexDirection: 'row',
    gap: 3,
  },
  segment: {
    flex: 1,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    minWidth: 34,
    textAlign: 'right',
  },
});
