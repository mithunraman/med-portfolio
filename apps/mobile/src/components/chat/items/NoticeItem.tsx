import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../../theme';
import { STATUS_COLORS, type StatusVariant } from '../../../theme/statusColors';

interface Props {
  text: string;
  /**
   * `default` (neutral grey) reads as "time passed"; `warning` as "something
   * went wrong". Colours come from the shared status palette, whose dark values
   * are hand-picked for contrast rather than inverted from light.
   *
   * Required, with no default: every notice has to pick a tone explicitly. A
   * fallback would have to be one or the other, and either choice is wrong for
   * half the notices — an expiry rendered in warning colours reads as a fault
   * the trainee caused, which is exactly what the screen's
   * `ANALYSIS_EXPIRED -> 'default'` mapping exists to avoid.
   */
  variant: StatusVariant;
}

export const NoticeItem = memo(function NoticeItem({ text, variant }: Props) {
  const { isDark } = useTheme();
  const scheme = STATUS_COLORS[isDark ? 'dark' : 'light'][variant];

  return (
    <View style={styles.container}>
      <View style={[styles.pill, { backgroundColor: scheme.surface }]}>
        <Text style={[styles.text, { color: scheme.text }]}>{text}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  pill: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxWidth: '100%',
  },
  text: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
  },
});
