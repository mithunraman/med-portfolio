import { Feather } from '@expo/vector-icons';
import { memo, useCallback, useState } from 'react';
import { LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View } from 'react-native';
import { useTheme } from '../theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface SingleSelectOption {
  key: string;
  label: string;
  confidence?: number;
  reasoning?: string;
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
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const handleToggleExpand = useCallback((key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedKey((prev) => (prev === key ? null : key));
  }, []);

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
            isExpanded={expandedKey === option.key}
            disabled={disabled}
            onSelect={onSelect}
            onToggleExpand={handleToggleExpand}
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
  isExpanded: boolean;
  disabled: boolean;
  onSelect: (key: string) => void;
  onToggleExpand: (key: string) => void;
  colors: ReturnType<typeof useTheme>['colors'];
  isDark: boolean;
}

const SingleSelectItem = memo(function SingleSelectItem({
  option,
  isSelected,
  isSuggested,
  isExpanded,
  disabled,
  onSelect,
  onToggleExpand,
  colors,
  isDark,
}: ItemProps) {
  const handlePress = useCallback(() => {
    if (!disabled) onSelect(option.key);
  }, [disabled, onSelect, option.key]);

  const handleChevronPress = useCallback(() => {
    onToggleExpand(option.key);
  }, [onToggleExpand, option.key]);

  const itemBg = isSuggested
    ? isDark
      ? 'rgba(255,255,255,0.06)'
      : 'rgba(0,0,0,0.03)'
    : 'transparent';

  const hasDetails = option.confidence != null || !!option.reasoning;

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
      <View style={styles.topRow}>
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
        </View>
        {hasDetails && option.reasoning && (
          <Pressable
            onPress={handleChevronPress}
            onStartShouldSetResponder={() => true}
            style={[styles.detailsTap, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)' }]}
            accessibilityLabel={isExpanded ? 'Hide reasoning' : 'Show reasoning'}
          >
            {option.confidence != null && (
              <Text style={[styles.badgeText, { color: colors.textSecondary }]}>
                {Math.round(option.confidence * 100)}%
              </Text>
            )}
            <Feather
              name={isExpanded ? 'chevron-down' : 'chevron-right'}
              size={14}
              color={colors.textSecondary}
            />
          </Pressable>
        )}
        {!option.reasoning && option.confidence != null && (
          <View style={[styles.badgeOnly, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)' }]}>
            <Text style={[styles.badgeText, { color: colors.textSecondary }]}>
              {Math.round(option.confidence * 100)}%
            </Text>
          </View>
        )}
      </View>
      {isExpanded && option.reasoning && (
        <Text style={[styles.reasoning, { color: colors.textSecondary }]}>
          {option.reasoning}
        </Text>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  item: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  disabled: {
    opacity: 0.7,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  detailsTap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeOnly: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  reasoning: {
    fontSize: 13,
    lineHeight: 18,
    marginLeft: 30,
  },
});
