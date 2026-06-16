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

  // Active: full list in server order. Answered: collapse to the selected option only.
  const displayOptions = useMemo(
    () => (isAnswered ? options.filter((o) => o.key === selectedKey) : options),
    [isAnswered, options, selectedKey]
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
        options={displayOptions}
        selectedKey={selectedKey}
        onSelect={handleSelect}
        disabled={isAnswered || !isActive}
        suggestedKey={question.suggestedKey}
        // Mirrors MultiSelectCard: a locked summary never folds. Redundant for
        // single-select (answered = one option) but kept for symmetry.
        collapsible={!isAnswered}
      />
    </SelectionCardShell>
  );
});
