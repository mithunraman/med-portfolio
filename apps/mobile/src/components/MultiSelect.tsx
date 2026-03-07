import { Feather } from '@expo/vector-icons';
import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

export interface MultiSelectOption {
  key: string;
  label: string;
  sublabel?: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  selectedKeys: string[];
  onToggle: (key: string) => void;
  disabled?: boolean;
}

export const MultiSelect = memo(function MultiSelect({
  options,
  selectedKeys,
  onToggle,
  disabled = false,
}: MultiSelectProps) {
  const { colors, isDark } = useTheme();

  return (
    <View style={styles.container}>
      {options.map((option) => {
        const isSelected = selectedKeys.includes(option.key);

        return (
          <MultiSelectItem
            key={option.key}
            option={option}
            isSelected={isSelected}
            disabled={disabled}
            onToggle={onToggle}
            colors={colors}
            isDark={isDark}
          />
        );
      })}
    </View>
  );
});

interface ItemProps {
  option: MultiSelectOption;
  isSelected: boolean;
  disabled: boolean;
  onToggle: (key: string) => void;
  colors: ReturnType<typeof useTheme>['colors'];
  isDark: boolean;
}

const MultiSelectItem = memo(function MultiSelectItem({
  option,
  isSelected,
  disabled,
  onToggle,
  colors,
}: ItemProps) {
  const handlePress = useCallback(() => {
    if (!disabled) onToggle(option.key);
  }, [disabled, onToggle, option.key]);

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      style={[
        styles.item,
        { borderColor: isSelected ? colors.primary : colors.border },
        disabled && styles.disabled,
      ]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isSelected, disabled }}
    >
      <View
        style={[
          styles.checkbox,
          {
            borderColor: isSelected ? colors.primary : colors.textSecondary,
            backgroundColor: isSelected ? colors.primary : 'transparent',
          },
        ]}
      >
        {isSelected && <Feather name="check" size={14} color="#ffffff" />}
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
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
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
