import type {
  FreeTextQuestion,
  Message,
  MultiSelectAnswer,
  MultiSelectQuestion,
  SingleSelectAnswer,
  SingleSelectQuestion,
} from '@acme/shared';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../../theme';
import { FreeTextPrompts } from './FreeTextPrompts';
import { MultiSelectCard } from './MultiSelectCard';
import { SingleSelectCard } from './SingleSelectCard';

interface Props {
  message: Message;
  isActiveQuestion: boolean;
  onAnswer: (messageId: string, value: Record<string, unknown>) => void;
}

export const QuestionContent = memo(function QuestionContent({
  message,
  isActiveQuestion,
  onAnswer,
}: Props) {
  const { colors } = useTheme();
  const question = message.question;
  if (!question) return null;

  const handleAnswer = (value: Record<string, unknown>) => {
    onAnswer(message.id, value);
  };

  return (
    <View style={styles.container}>
      {message.content && (
        <Text style={[styles.text, { color: colors.text }]}>{message.content}</Text>
      )}

      {question.questionType === 'single_select' && (
        <SingleSelectCard
          question={question as SingleSelectQuestion}
          answer={(message.answer as SingleSelectAnswer) ?? null}
          isActive={isActiveQuestion}
          onAnswer={handleAnswer}
        />
      )}

      {question.questionType === 'multi_select' && (
        <MultiSelectCard
          question={question as MultiSelectQuestion}
          answer={(message.answer as MultiSelectAnswer) ?? null}
          isActive={isActiveQuestion}
          onAnswer={handleAnswer}
        />
      )}

      {question.questionType === 'free_text' && (
        <FreeTextPrompts
          question={question as FreeTextQuestion}
          isActive={isActiveQuestion}
        />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  text: {
    fontSize: 16,
    lineHeight: 20,
  },
});
