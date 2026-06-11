import type { ReadinessSnapshot } from '@acme/shared';
import { Feather } from '@expo/vector-icons';
import { memo, useState } from 'react';
import { LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View } from 'react-native';
import { useTheme } from '../../theme';
import { DraftStatusPill } from './DraftStatusPill';
import { ReadinessBar } from './ReadinessBar';
import { TierChip } from './TierChip';

// Enable LayoutAnimation on Android (no-op on iOS, where it's on by default).
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface Props {
  readiness: ReadinessSnapshot;
}

/**
 * Sticky "Entry readiness" header shown above the conversation.
 *
 * Reflects the latest readiness snapshot (score, draft status, per-section
 * tiers) so the trainee always sees a live progress meter. Collapsed by
 * default to preserve vertical space; tap to reveal the section breakdown.
 */
export const ReadinessHeader = memo(function ReadinessHeader({ readiness }: Props) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Pressable style={styles.headerRow} onPress={toggle} accessibilityRole="button">
        <View style={styles.titleBlock}>
          <Text style={[styles.title, { color: colors.textSecondary }]}>Entry readiness</Text>
          <DraftStatusPill status={readiness.draftStatus} />
        </View>
        <Feather
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.textSecondary}
        />
      </Pressable>

      <ReadinessBar score={readiness.score} />

      {expanded && readiness.sections.length > 0 && (
        <View style={[styles.sections, { borderTopColor: colors.border }]}>
          {readiness.sections.map((section) => (
            <View key={section.sectionId} style={styles.sectionRow}>
              <Text style={[styles.sectionLabel, { color: colors.text }]} numberOfLines={1}>
                {section.label}
              </Text>
              <TierChip tier={section.tier} meetsThreshold={section.meetsThreshold} />
            </View>
          ))}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sections: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    gap: 8,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionLabel: {
    flex: 1,
    fontSize: 14,
  },
});
