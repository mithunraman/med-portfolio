import type { MultiSelectAnswer, MultiSelectQuestion } from '@acme/shared';
import { memo, useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../../theme';
import { MultiSelect, type MultiSelectOption } from '../../MultiSelect';

const ACCENT_COLOR = '#00a884';

interface Props {
  question: MultiSelectQuestion;
  answer: MultiSelectAnswer | null;
  isActive: boolean;
  onAnswer: (value: { selectedKeys: string[] }) => void;
}

export const MultiSelectCard = memo(function MultiSelectCard({
  question,
  answer,
  isActive,
  onAnswer,
}: Props) {
  const { colors } = useTheme();
  const isAnswered = answer !== null;
  const [localKeys, setLocalKeys] = useState<string[]>([]);

  const displayKeys = isAnswered ? answer.selectedKeys : localKeys;

  const handleToggle = useCallback(
    (key: string) => {
      if (isAnswered || !isActive) return;
      setLocalKeys((prev) =>
        prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
      );
    },
    [isAnswered, isActive]
  );

  const handleConfirm = useCallback(() => {
    if (localKeys.length > 0) {
      onAnswer({ selectedKeys: localKeys });
    }
  }, [localKeys, onAnswer]);

  const options: MultiSelectOption[] = question.options.map((o) => ({
    key: o.key,
    label: o.label,
    sublabel: o.confidence != null ? `${Math.round(o.confidence * 100)}% confidence` : undefined,
  }));

  return (
    <View style={styles.container}>
      <Text style={[styles.heading, { color: colors.textSecondary }]}>Select all that apply</Text>
      <MultiSelect
        options={options}
        selectedKeys={displayKeys}
        onToggle={handleToggle}
        disabled={isAnswered || !isActive}
      />
      {!isAnswered && isActive && (
        <Pressable
          onPress={handleConfirm}
          disabled={localKeys.length === 0}
          style={[
            styles.confirmButton,
            {
              backgroundColor: localKeys.length > 0 ? ACCENT_COLOR : colors.border,
            },
          ]}
          accessibilityLabel="Confirm selection"
        >
          <Text
            style={[
              styles.confirmText,
              { color: localKeys.length > 0 ? '#ffffff' : colors.textSecondary },
            ]}
          >
            Confirm ({localKeys.length})
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
