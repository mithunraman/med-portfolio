import { Feather } from '@expo/vector-icons';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

const ANIMATION_DURATION = 250;

export interface MultiSelectOption {
  key: string;
  label: string;
  confidence?: number;
  reasoning?: string;
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
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const handleToggleExpand = useCallback((key: string) => {
    setExpandedKey((prev) => (prev === key ? null : key));
  }, []);

  return (
    <View style={styles.container}>
      {options.map((option) => {
        const isSelected = selectedKeys.includes(option.key);

        return (
          <MultiSelectItem
            key={option.key}
            option={option}
            isSelected={isSelected}
            isExpanded={expandedKey === option.key}
            disabled={disabled}
            onToggle={onToggle}
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
  option: MultiSelectOption;
  isSelected: boolean;
  isExpanded: boolean;
  disabled: boolean;
  onToggle: (key: string) => void;
  onToggleExpand: (key: string) => void;
  colors: ReturnType<typeof useTheme>['colors'];
  isDark: boolean;
}

const MultiSelectItem = memo(function MultiSelectItem({
  option,
  isSelected,
  isExpanded,
  disabled,
  onToggle,
  onToggleExpand,
  colors,
  isDark,
}: ItemProps) {
  const handlePress = useCallback(() => {
    if (!disabled) onToggle(option.key);
  }, [disabled, onToggle, option.key]);

  const handleChevronPress = useCallback(() => {
    onToggleExpand(option.key);
  }, [onToggleExpand, option.key]);

  const hasDetails = option.confidence != null || !!option.reasoning;

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
      <View style={styles.topRow}>
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
      {option.reasoning && (
        <CollapsibleReasoning isExpanded={isExpanded} color={colors.textSecondary}>
          {option.reasoning}
        </CollapsibleReasoning>
      )}
    </Pressable>
  );
});

interface CollapsibleReasoningProps {
  isExpanded: boolean;
  color: string;
  children: string;
}

const CollapsibleReasoning = memo(function CollapsibleReasoning({
  isExpanded,
  color,
  children,
}: CollapsibleReasoningProps) {
  const animValue = useRef(new Animated.Value(0)).current;
  const contentHeight = useRef(0);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    animRef.current?.stop();
    animRef.current = Animated.timing(animValue, {
      toValue: isExpanded ? 1 : 0,
      duration: ANIMATION_DURATION,
      useNativeDriver: false,
    });
    animRef.current.start(() => {
      animRef.current = null;
    });
    return () => {
      animRef.current?.stop();
    };
  }, [isExpanded, animValue]);

  const height = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, contentHeight.current || 200],
    extrapolate: 'clamp',
  });

  const containerStyle = useMemo(
    () => [styles.collapsibleContainer, { height, opacity: animValue }],
    [height, animValue],
  );

  const handleLayout = useCallback((e: { nativeEvent: { layout: { height: number } } }) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) {
      contentHeight.current = h;
    }
  }, []);

  return (
    <Animated.View style={containerStyle}>
      <View onLayout={handleLayout} style={styles.reasoningInner}>
        <Text style={[styles.reasoning, { color }]}>{children}</Text>
      </View>
    </Animated.View>
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
  collapsibleContainer: {
    overflow: 'hidden' as const,
  },
  reasoningInner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  reasoning: {
    fontSize: 13,
    lineHeight: 18,
    marginLeft: 30,
  },
});
