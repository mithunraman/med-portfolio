import type { Question, SingleSelectAnswer, SingleSelectQuestion } from '@acme/shared';
import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../../theme';
import { DraftStatusPill } from '../../readiness/DraftStatusPill';
import { ReadinessBar } from '../../readiness/ReadinessBar';

// Option keys the backend uses for the present_draft sign-off question.
// Shared between the discriminator and the button mapping so they can't drift.
export const SIGN_OFF_SUBMIT_KEY = 'submit';
export const SIGN_OFF_DRAFT_KEY = 'draft';

/**
 * Detect the sign-off question (present_draft) — a single_select whose options
 * are exactly { submit, draft }. Lets QuestionContent route it to the bespoke
 * review card instead of the generic selector.
 */
export function isSignOffQuestion(question: Question): question is SingleSelectQuestion {
  if (question.questionType !== 'single_select') return false;
  const keys = question.options.map((o) => o.key);
  return (
    keys.length === 2 &&
    keys.includes(SIGN_OFF_SUBMIT_KEY) &&
    keys.includes(SIGN_OFF_DRAFT_KEY)
  );
}

interface Props {
  question: SingleSelectQuestion;
  answer: SingleSelectAnswer | null;
  isActive: boolean;
  onAnswer: (value: { selectedKey: string }) => void;
}

/**
 * Final sign-off card for the present_draft interrupt.
 *
 * Shows the composed document (the trainee's own words, read-only) alongside
 * the readiness verdict, then asks for an explicit decision: submit the entry
 * or save it as a draft. No silent finalisation.
 */
export const DraftSignOffCard = memo(function DraftSignOffCard({
  question,
  answer,
  isActive,
  onAnswer,
}: Props) {
  const { colors } = useTheme();
  const [confirmedKey, setConfirmedKey] = useState<string | null>(null);
  const selectedKey = answer?.selectedKey ?? confirmedKey;
  const isAnswered = selectedKey !== null;

  const readiness = question.readiness;
  const document = readiness?.document ?? [];

  const handlePress = (key: string) => {
    if (isAnswered || !isActive) return;
    setConfirmedKey(key);
    onAnswer({ selectedKey: key });
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.heading, { color: colors.textSecondary }]}>Your entry</Text>

      {readiness && (
        <View style={styles.statusRow}>
          <DraftStatusPill status={readiness.draftStatus} />
          <View style={styles.barWrap}>
            <ReadinessBar score={readiness.score} />
          </View>
        </View>
      )}

      {document.length > 0 && (
        <View style={[styles.document, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {document.map((field, index) => (
            <View key={field.sectionId} style={index > 0 ? styles.fieldSpaced : undefined}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                {field.label}
              </Text>
              <Text style={[styles.fieldText, { color: colors.text }]}>{field.text}</Text>
            </View>
          ))}
        </View>
      )}

      {!isAnswered && isActive ? (
        <View style={styles.actions}>
          <Pressable
            onPress={() => handlePress(SIGN_OFF_SUBMIT_KEY)}
            style={[styles.button, { backgroundColor: colors.accent }]}
            accessibilityLabel="Submit entry"
          >
            <Text style={[styles.buttonText, { color: '#ffffff' }]}>Submit entry</Text>
          </Pressable>
          <Pressable
            onPress={() => handlePress(SIGN_OFF_DRAFT_KEY)}
            style={[styles.button, styles.secondaryButton, { borderColor: colors.border }]}
            accessibilityLabel="Save as draft"
          >
            <Text style={[styles.buttonText, { color: colors.text }]}>Save as draft</Text>
          </Pressable>
        </View>
      ) : (
        isAnswered && (
          <Text style={[styles.answeredText, { color: colors.textSecondary }]}>
            {selectedKey === SIGN_OFF_SUBMIT_KEY ? 'Entry submitted' : 'Saved as draft'}
          </Text>
        )
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    gap: 10,
  },
  heading: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  barWrap: {
    flex: 1,
  },
  document: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 12,
  },
  fieldSpaced: {
    marginTop: 12,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  fieldText: {
    fontSize: 15,
    lineHeight: 22,
  },
  actions: {
    gap: 8,
    marginTop: 2,
  },
  button: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  answeredText: {
    fontSize: 14,
    fontWeight: '600',
    fontStyle: 'italic',
  },
});
