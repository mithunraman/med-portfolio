import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppSelector } from '@/hooks';
import { useTheme } from '@/theme';
import type { TrainingStageDefinition } from '@acme/shared';
import { Button } from '../Button';

export interface StageListProps {
  /** Stringified specialty id; used to look the stage list up from the store. */
  specialty: string;
  /** Pre-selected stage code (e.g. when editing an existing specialty). */
  initialStage?: string | null;
  /** True while the host is persisting the selection. */
  submitting: boolean;
  /** Fired when the user confirms a stage. */
  onConfirm: (stageCode: string) => void;
  /** Fired whenever the selection changes (e.g. so the host can clear an error). */
  onSelectionChange?: () => void;
}

/**
 * Presentational stage picker with an animated sticky confirm button. Shared by
 * the onboarding `select-stage` screen and the settings `change-stage` screen.
 * Persistence and post-confirm navigation are owned by the host via `onConfirm`.
 */
export function StageList({
  specialty,
  initialStage = null,
  submitting,
  onConfirm,
  onSelectionChange,
}: StageListProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const specialties = useAppSelector((s) => s.auth.specialties);
  const specialtyConfig = specialties.find((s) => s.specialty.toString() === specialty);
  const stages = specialtyConfig?.trainingStages ?? [];

  const [selectedCode, setSelectedCode] = useState<string | null>(initialStage);

  // Animate the confirm button sliding up when a selection is made
  const buttonAnim = useRef(new Animated.Value(initialStage ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(buttonAnim, {
      toValue: selectedCode ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [buttonAnim, selectedCode]);

  const buttonTranslateY = buttonAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [80, 0],
  });

  const buttonOpacity = buttonAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const handleSelect = useCallback(
    (stage: TrainingStageDefinition) => {
      setSelectedCode(stage.code);
      onSelectionChange?.();
    },
    [onSelectionChange]
  );

  const renderItem = useCallback(
    ({ item }: { item: TrainingStageDefinition }) => {
      const isSelected = selectedCode === item.code;

      return (
        <TouchableOpacity
          style={[
            styles.optionCard,
            {
              backgroundColor: isSelected ? colors.primary + '0F' : colors.surface,
              borderColor: isSelected ? colors.primary : colors.border,
              borderWidth: isSelected ? 1.5 : 1,
            },
          ]}
          onPress={() => handleSelect(item)}
          disabled={submitting}
          activeOpacity={0.7}
          accessibilityRole="radio"
          accessibilityState={{ selected: isSelected }}
          accessibilityLabel={`${item.label}. ${item.description}`}
        >
          <View style={styles.optionContent}>
            <Text style={[styles.optionLabel, { color: colors.text }]}>{item.label}</Text>
          </View>
          {isSelected ? (
            <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
          ) : (
            <View style={[styles.radioOuter, { borderColor: colors.border }]} />
          )}
        </TouchableOpacity>
      );
    },
    [colors, handleSelect, submitting, selectedCode]
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={stages}
        keyExtractor={(item) => item.code}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, { paddingBottom: selectedCode ? 120 : 24 }]}
        showsVerticalScrollIndicator={false}
      />

      {/* Sticky confirm button */}
      <Animated.View
        style={[
          styles.footer,
          {
            paddingBottom: insets.bottom + 24,
            backgroundColor: colors.background,
            transform: [{ translateY: buttonTranslateY }],
            opacity: buttonOpacity,
          },
        ]}
        pointerEvents={selectedCode ? 'auto' : 'none'}
      >
        <Button
          label="Continue"
          onPress={() => selectedCode && onConfirm(selectedCode)}
          loading={submitting}
          disabled={!selectedCode}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    paddingHorizontal: 24,
    paddingTop: 8,
    gap: 12,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 12,
  },
  optionContent: {
    flex: 1,
    marginRight: 12,
  },
  optionLabel: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 6,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
});
