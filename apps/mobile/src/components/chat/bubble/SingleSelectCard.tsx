import type { SingleSelectAnswer, SingleSelectQuestion } from '@acme/shared';
import { memo, useCallback, useMemo, useState } from 'react';
import { SingleSelect, type SingleSelectOption } from '../../SingleSelect';
import { SelectionCardShell } from './SelectionCardShell';

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

  const options: SingleSelectOption[] = useMemo(
    () =>
      question.options.map((o) => ({
        key: o.key,
        label: o.label,
        confidence: o.confidence,
        reasoning: o.reasoning,
      })),
    [question.options]
  );

  return (
    <SelectionCardShell
      heading="Select one"
      hasSelection={localKey !== null}
      isAnswered={isAnswered}
      isActive={isActive}
      confirmLabel="Confirm"
      onConfirm={handleConfirm}
    >
      <SingleSelect
        options={options}
        selectedKey={selectedKey}
        onSelect={handleSelect}
        disabled={isAnswered || !isActive}
        suggestedKey={question.suggestedKey}
      />
    </SelectionCardShell>
  );
});
