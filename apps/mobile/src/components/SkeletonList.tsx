import { useTheme } from '@/theme';
import { StyleSheet, View } from 'react-native';
import { SkeletonBone } from './SkeletonBone';

function SkeletonCard() {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.cardContent}>
        <SkeletonBone width="70%" height={14} />
        <SkeletonBone width="45%" height={10} />
      </View>
      <SkeletonBone width={72} height={24} borderRadius={12} />
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
});
