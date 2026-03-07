import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

export interface SingleSelectOption {
  key: string;
  label: string;
  sublabel?: string;
}

interface SingleSelectProps {
  options: SingleSelectOption[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  disabled?: boolean;
  suggestedKey?: string;
}

export const SingleSelect = memo(function SingleSelect({
  options,
  selectedKey,
  onSelect,
  disabled = false,
  suggestedKey,
}: SingleSelectProps) {
  const { colors, isDark } = useTheme();

  return (
    <View style={styles.container}>
      {options.map((option) => {
        const isSelected = option.key === selectedKey;
        const isSuggested = option.key === suggestedKey && !selectedKey;

        return (
          <SingleSelectItem
            key={option.key}
            option={option}
            isSelected={isSelected}
            isSuggested={isSuggested}
            disabled={disabled}
            onSelect={onSelect}
            colors={colors}
            isDark={isDark}
          />
        );
      })}
    </View>
  );
});

interface ItemProps {
  option: SingleSelectOption;
  isSelected: boolean;
  isSuggested: boolean;
  disabled: boolean;
  onSelect: (key: string) => void;
  colors: ReturnType<typeof useTheme>['colors'];
  isDark: boolean;
}

const SingleSelectItem = memo(function SingleSelectItem({
  option,
  isSelected,
  isSuggested,
  disabled,
  onSelect,
  colors,
  isDark,
}: ItemProps) {
  const handlePress = useCallback(() => {
    if (!disabled) onSelect(option.key);
  }, [disabled, onSelect, option.key]);

  const itemBg = isSuggested
    ? isDark
      ? 'rgba(255,255,255,0.06)'
      : 'rgba(0,0,0,0.03)'
    : 'transparent';

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      style={[
        styles.item,
        { borderColor: isSelected ? colors.primary : colors.border, backgroundColor: itemBg },
        disabled && styles.disabled,
      ]}
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected, disabled }}
    >
      <View
        style={[
          styles.radio,
          { borderColor: isSelected ? colors.primary : colors.textSecondary },
        ]}
      >
        {isSelected && (
          <View style={[styles.radioFill, { backgroundColor: colors.primary }]} />
        )}
      </View>
      <View style={styles.labelContainer}>
        <Text style={[styles.label, { color: colors.text }]}>{option.label}</Text>
        {option.sublabel && (
          <Text style={[styles.sublabel, { color: colors.textSecondary }]}>
            {option.sublabel}
          </Text>
        )}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
  },
  disabled: {
    opacity: 0.7,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioFill: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  labelContainer: {
    flex: 1,
  },
  label: {
    fontSize: 15,
    fontWeight: '500',
  },
  sublabel: {
    fontSize: 13,
    marginTop: 2,
  },
});
