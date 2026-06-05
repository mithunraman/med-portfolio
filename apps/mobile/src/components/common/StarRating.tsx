import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

const STAR_FILLED_COLOR = '#F5A623';
const MAX_STARS = 5;

interface StarRatingProps {
  /** Current rating, 0–5. 0 renders every star empty. */
  value: number;
  /** Called with the tapped star value (1–5). Omit (or set `readOnly`) for display-only. */
  onChange?: (value: number) => void;
  /** Icon size in px. */
  size?: number;
  /** Force display-only even if `onChange` is provided. */
  readOnly?: boolean;
  /** Horizontal gap between stars. */
  gap?: number;
}

/**
 * Presentation-only 1–5 star control. Reused by the inline rating row and the
 * review sheet (and any future supervisor rating) — no redux/thunk awareness.
 */
export const StarRating = memo(function StarRating({
  value,
  onChange,
  size = 32,
  readOnly = false,
  gap = 8,
}: StarRatingProps) {
  const { colors } = useTheme();
  const interactive = !readOnly && !!onChange;

  return (
    <View style={[styles.row, { gap }]}>
      {Array.from({ length: MAX_STARS }, (_, i) => {
        const starValue = i + 1;
        const filled = starValue <= value;
        const star = (
          <Ionicons
            name={filled ? 'star' : 'star-outline'}
            size={size}
            color={filled ? STAR_FILLED_COLOR : colors.border}
          />
        );

        if (!interactive) {
          return <View key={starValue}>{star}</View>;
        }

        return (
          <Pressable
            key={starValue}
            onPress={() => onChange?.(starValue)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Rate ${starValue} of ${MAX_STARS} stars`}
          >
            {star}
          </Pressable>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
