import { useTheme } from '@/theme';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

interface CoverageRingProps {
  /** 0–100 */
  percent: number;
  /** e.g. "8 of 13" */
  label?: string;
  /** Ring diameter. Default 64 for dashboard, use 120 for detail. */
  size?: number;
  /** Ring stroke width. Default 6. */
  strokeWidth?: number;
}

export function CoverageRing({
  percent,
  label,
  size = 64,
  strokeWidth = 6,
}: CoverageRingProps) {
  const { colors } = useTheme();
  const clampedPercent = Math.min(100, Math.max(0, percent));

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - clampedPercent / 100);

  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          {/* Track */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colors.border}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Fill */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colors.primary}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            transform={`rotate(-90, ${size / 2}, ${size / 2})`}
          />
        </Svg>

        {/* Centre label */}
        <View style={[styles.centerLabel, { width: size, height: size }]}>
          <Text
            style={[
              styles.percentText,
              {
                color: colors.text,
                fontSize: size >= 100 ? 24 : 14,
                fontWeight: '700',
              },
            ]}
          >
            {Math.round(clampedPercent)}%
          </Text>
        </View>
      </View>

      {label && (
        <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centerLabel: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  percentText: {
    textAlign: 'center',
  },
  label: {
    fontSize: 12,
    textAlign: 'center',
  },
});
