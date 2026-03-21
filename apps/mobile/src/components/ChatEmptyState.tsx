import { Feather } from '@expo/vector-icons';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

const STEPS = [
  {
    number: '1',
    title: 'Describe what happened',
    detail: 'Send as many messages as you need — text, voice, or both',
  },
  {
    number: '2',
    title: 'Start analysis',
    detail: 'Available once you\u2019ve written enough (~60 words)',
  },
  {
    number: '3',
    title: 'Review & refine',
    detail: 'The AI will ask follow-up questions to complete your entry',
  },
];

export const ChatEmptyState = memo(function ChatEmptyState() {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Feather
          name="message-circle"
          size={48}
          color={colors.textSecondary}
          style={styles.icon}
        />
        <Text style={[styles.title, { color: colors.text }]}>
          What would you like to reflect on?
        </Text>
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          A challenging interaction, a procedure, something you learned — describe any clinical
          experience.
        </Text>
      </View>

      <View
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        {STEPS.map((step, index) => (
          <View key={step.number}>
            <View style={styles.row}>
              <View style={[styles.stepBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.stepNumber}>{step.number}</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={[styles.stepTitle, { color: colors.text }]}>{step.title}</Text>
                <Text style={[styles.stepDetail, { color: colors.textSecondary }]}>
                  {step.detail}
                </Text>
              </View>
            </View>
            {index < STEPS.length - 1 && (
              <View style={styles.dividerInset}>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
              </View>
            )}
          </View>
        ))}
      </View>

      <View style={styles.hint}>
        <Feather name="type" size={16} color={colors.textSecondary} />
        <Text style={[styles.hintText, { color: colors.textSecondary }]}>Type or tap</Text>
        <Feather name="mic" size={16} color={colors.textSecondary} />
        <Text style={[styles.hintText, { color: colors.textSecondary }]}>to start</Text>
      </View>
    </View>
  );
});

const BADGE_SIZE = 24;
const ROW_GAP = 12;
const CARD_PADDING_H = 16;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 28,
  },
  icon: {
    marginBottom: 14,
    opacity: 0.5,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  card: {
    width: '100%',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 4,
    marginBottom: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ROW_GAP,
    paddingVertical: 14,
    paddingHorizontal: CARD_PADDING_H,
  },
  stepBadge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  stepNumber: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  stepContent: {
    flex: 1,
    gap: 2,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  stepDetail: {
    fontSize: 13,
    lineHeight: 18,
  },
  dividerInset: {
    paddingLeft: CARD_PADDING_H + BADGE_SIZE + ROW_GAP,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hintText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
