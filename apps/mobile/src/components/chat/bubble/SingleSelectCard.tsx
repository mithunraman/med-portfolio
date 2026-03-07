import type { SingleSelectAnswer, SingleSelectQuestion } from '@acme/shared';
import { memo, useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../../theme';
import { SingleSelect, type SingleSelectOption } from '../../SingleSelect';

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
  const isAnswered = answer !== null || localKey !== null;
  const selectedKey = answer?.selectedKey ?? localKey;

  const handleSelect = useCallback(
    (key: string) => {
      if (!isAnswered && isActive) {
        setLocalKey(key);
        onAnswer({ selectedKey: key });
      }
    },
    [isAnswered, isActive, onAnswer]
  );

  const options: SingleSelectOption[] = question.options.map((o) => ({
    key: o.key,
    label: o.label,
    sublabel: o.confidence != null ? `${Math.round(o.confidence * 100)}% confidence` : undefined,
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
});
