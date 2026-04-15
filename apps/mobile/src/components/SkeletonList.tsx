import { useTheme } from '@/theme';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

function SkeletonCard() {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.cardContent}>
        <Animated.View
          style={[styles.titleLine, { backgroundColor: colors.border, opacity }]}
        />
        <Animated.View
          style={[styles.metaLine, { backgroundColor: colors.border, opacity }]}
        />
      </View>
      <Animated.View style={[styles.pill, { backgroundColor: colors.border, opacity }]} />
    </View>
  );
}

interface SkeletonListProps {
  count?: number;
}

export function SkeletonList({ count = 5 }: SkeletonListProps) {
  return (
    <View style={styles.container}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    gap: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  cardContent: {
    flex: 1,
    gap: 8,
  },
  titleLine: {
    height: 14,
    borderRadius: 4,
    width: '70%',
  },
  metaLine: {
    height: 10,
    borderRadius: 4,
    width: '45%',
  },
  pill: {
    height: 24,
    width: 72,
    borderRadius: 12,
  },
});
