import { Feather } from '@expo/vector-icons';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { ShowMoreRow } from './ShowMoreRow';
import { useCollapsibleOptions } from './useCollapsibleOptions';

const ANIMATION_DURATION = 250;

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
  /** Fold long lists behind a one-way "Show more" affordance. */
  collapsible?: boolean;
}

export const SingleSelect = memo(function SingleSelect({
  options,
  selectedKey,
  onSelect,
  disabled = false,
  suggestedKey,
  collapsible = false,
}: SingleSelectProps) {
  const { colors, isDark } = useTheme();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const { visible, hiddenCount, collapsed, expand } = useCollapsibleOptions(options, {
    enabled: collapsible,
  });

  const handleToggleExpand = useCallback((key: string) => {
    setExpandedKey((prev) => (prev === key ? null : key));
  }, []);

  return (
    <View style={styles.container}>
      {visible.map((option) => {
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
      {collapsed && <ShowMoreRow hiddenCount={hiddenCount} onPress={expand} />}
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

  return (
    <View
      style={[
        styles.item,
        { borderColor: isSelected ? colors.primary : colors.border, backgroundColor: itemBg },
        disabled && styles.disabled,
      ]}
    >
      <View style={styles.topRow}>
        {/* Selection is confined to the radio + label. Tapping the reasoning
            disclosure or anywhere else in the card must not toggle the choice. */}
        <Pressable
          onPress={handlePress}
          disabled={disabled}
          style={styles.selectTarget}
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
          </View>
        </Pressable>
        {/* Reasoning disclosure sits where the confidence badge used to be — an
            accent underlined link so it clearly reads as tappable. */}
        {option.reasoning && (
          <Pressable
            onPress={handleChevronPress}
            style={({ pressed }) => [styles.whyToggle, pressed && styles.pressed]}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityState={{ expanded: isExpanded }}
            accessibilityLabel={isExpanded ? 'Hide reasoning' : 'Show reasoning'}
          >
            <Text style={[styles.whyText, { color: colors.primary }]}>Why?</Text>
            <Feather
              name={isExpanded ? 'chevron-down' : 'chevron-right'}
              size={16}
              color={colors.primary}
            />
          </Pressable>
        )}
      </View>
      {option.reasoning && (
        <CollapsibleReasoning isExpanded={isExpanded} color={colors.textSecondary}>
          {option.reasoning}
        </CollapsibleReasoning>
      )}
    </View>
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
  // Tap area for selecting the option — radio + label only, takes the row's
  // free width so the confidence box stays pinned to the right.
  selectTarget: {
    flex: 1,
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
  // Reasoning disclosure control: an accent, underlined link on the right of the
  // row (where the confidence badge was). hitSlop gives it a 44pt touch target.
  whyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingVertical: 6,
  },
  whyText: {
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  pressed: {
    opacity: 0.6,
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
