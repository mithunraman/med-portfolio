import { useTheme } from '@/theme';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SkeletonBone } from './SkeletonBone';
import { SkeletonProvider } from './SkeletonProvider';

function SectionHeaderBone() {
  return (
    <View style={styles.sectionHeader}>
      <SkeletonBone width={120} height={18} borderRadius={6} />
    </View>
  );
}

function ReviewPeriodBone() {
  const { colors } = useTheme();
  return (
    <View style={styles.module}>
      <SectionHeaderBone />
      <View style={[styles.coverageCard, { backgroundColor: colors.surface }]}>
        <SkeletonBone width={64} height={64} borderRadius={32} />
        <View style={styles.coverageText}>
          <SkeletonBone width="60%" height={14} borderRadius={6} />
          <SkeletonBone width="80%" height={12} borderRadius={6} />
          <SkeletonBone width="40%" height={10} borderRadius={6} />
        </View>
      </View>
    </View>
  );
}

function RecentEntriesBone() {
  return (
    <View style={styles.module}>
      <SectionHeaderBone />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        contentContainerStyle={styles.recentList}
      >
        {[0, 1, 2].map((i) => (
          <RecentCardBone key={i} />
        ))}
      </ScrollView>
    </View>
  );
}

function RecentCardBone() {
  const { colors } = useTheme();
  return (
    <View style={[styles.recentCard, { backgroundColor: colors.surface }]}>
      <SkeletonBone width="80%" height={14} borderRadius={6} />
      <SkeletonBone width="50%" height={12} borderRadius={6} />
      <SkeletonBone width={72} height={24} borderRadius={12} />
    </View>
  );
}

function PdpGoalsBone() {
  const { colors } = useTheme();
  return (
    <View style={styles.module}>
      <SectionHeaderBone />
      {[0, 1].map((i) => (
        <View key={i} style={[styles.pdpCard, { backgroundColor: colors.surface }]}>
          <SkeletonBone width={18} height={18} borderRadius={9} />
          <View style={styles.pdpText}>
            <SkeletonBone width="70%" height={14} borderRadius={6} />
            <SkeletonBone width="40%" height={10} borderRadius={6} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function HomeSkeleton() {
  return (
    <SkeletonProvider>
      <ReviewPeriodBone />
      <RecentEntriesBone />
      <PdpGoalsBone />
    </SkeletonProvider>
  );
}

const styles = StyleSheet.create({
  module: {
    marginTop: 8,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  coverageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    padding: 14,
    borderRadius: 12,
    gap: 12,
  },
  coverageText: {
    flex: 1,
    gap: 6,
  },
  recentList: {
    paddingHorizontal: 20,
    gap: 12,
  },
  recentCard: {
    width: 140,
    padding: 14,
    borderRadius: 12,
    gap: 8,
    justifyContent: 'space-between',
    minHeight: 120,
  },
  pdpCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: 20,
    marginBottom: 8,
    padding: 14,
    borderRadius: 12,
    gap: 10,
  },
  pdpText: {
    flex: 1,
    gap: 6,
  },
});
