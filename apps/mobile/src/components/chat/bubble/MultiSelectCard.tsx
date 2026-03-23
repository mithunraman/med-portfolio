import type { MultiSelectAnswer, MultiSelectQuestion } from '@acme/shared';
import { memo, useCallback, useMemo, useState } from 'react';
import { MultiSelect, type MultiSelectOption } from '../../MultiSelect';
import { SelectionCardShell } from './SelectionCardShell';

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
  const [localKeys, setLocalKeys] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const isAnswered = answer !== null || confirmed;
  const displayKeys = answer?.selectedKeys ?? localKeys;

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
      setConfirmed(true);
      onAnswer({ selectedKeys: localKeys });
    }
  }, [localKeys, onAnswer]);

  const options: MultiSelectOption[] = useMemo(
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
      heading="Select all that apply"
      hasSelection={localKeys.length > 0}
      isAnswered={isAnswered}
      isActive={isActive}
      confirmLabel={`Confirm (${localKeys.length})`}
      onConfirm={handleConfirm}
    >
      <MultiSelect
        options={options}
        selectedKeys={displayKeys}
        onToggle={handleToggle}
        disabled={isAnswered || !isActive}
      />
    </SelectionCardShell>
  );
});
