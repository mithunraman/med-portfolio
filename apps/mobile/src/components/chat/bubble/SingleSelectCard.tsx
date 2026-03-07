import type { SingleSelectAnswer, SingleSelectQuestion } from '@acme/shared';
import { memo, useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../../theme';
import { SingleSelect, type SingleSelectOption } from '../../SingleSelect';

const ACCENT_COLOR = '#00a884';

interface Props {
  question: SingleSelectQuestion;
  answer: SingleSelectAnswer | null;
  isActive: boolean;
  onAnswer: (value: { selectedKey: string }) => void;
}

export const SingleSelectCard = memo(function SingleSelectCard({
  question,
  answer,
  isActive,
  onAnswer,
}: Props) {
  const { colors } = useTheme();
  const [localKey, setLocalKey] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const isAnswered = answer !== null || confirmed;
  const selectedKey = answer?.selectedKey ?? localKey;

  const handleSelect = useCallback(
    (key: string) => {
      if (!isAnswered && isActive) {
        setLocalKey(key);
      }
    },
    [isAnswered, isActive]
  );

  const handleConfirm = useCallback(() => {
    if (localKey) {
      setConfirmed(true);
      onAnswer({ selectedKey: localKey });
    }
  }, [localKey, onAnswer]);

  const options: SingleSelectOption[] = question.options.map((o) => ({
    key: o.key,
    label: o.label,
    sublabel:
      [o.confidence != null ? `${Math.round(o.confidence * 100)}% confidence` : null, o.reasoning]
        .filter(Boolean)
        .join(' - ') || undefined,
  }));

  return (
    <View style={styles.container}>
      <Text style={[styles.heading, { color: colors.textSecondary }]}>Select one</Text>
      <SingleSelect
        options={options}
        selectedKey={selectedKey}
        onSelect={handleSelect}
        disabled={isAnswered || !isActive}
        suggestedKey={question.suggestedKey}
      />
      {!isAnswered && isActive && (
        <Pressable
          onPress={handleConfirm}
          disabled={!localKey}
          style={[
            styles.confirmButton,
            {
              backgroundColor: localKey ? ACCENT_COLOR : colors.border,
            },
          ]}
          accessibilityLabel="Confirm selection"
        >
          <Text
            style={[styles.confirmText, { color: localKey ? '#ffffff' : colors.textSecondary }]}
          >
            Confirm
          </Text>
        </Pressable>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    gap: 6,
  },
  heading: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  confirmButton: {
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  confirmText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
