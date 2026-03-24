import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, ErrorBanner, StepIndicator } from '@/components';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { updateProfile } from '@/store/slices/authSlice';
import { useTheme } from '@/theme';
import type { Specialty, TrainingStageDefinition } from '@acme/shared';

export default function SelectStageScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const dispatch = useAppDispatch();

  const { specialty, specialtyName } = useLocalSearchParams<{
    specialty: string;
    specialtyName: string;
  }>();

  const specialties = useAppSelector((s) => s.auth.specialties);
  const specialtyConfig = specialties.find((s) => s.specialty.toString() === specialty);
  const stages = specialtyConfig?.trainingStages ?? [];

  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Animate the confirm button sliding up when a selection is made
  const buttonAnim = useRef(new Animated.Value(0)).current;

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

  const handleSelect = useCallback((stage: TrainingStageDefinition) => {
    setSelectedCode(stage.code);
    setError(null);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!selectedCode) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await dispatch(
        updateProfile({
          specialty: Number(specialty) as Specialty,
          trainingStage: selectedCode,
        })
      ).unwrap();
      router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [dispatch, specialty, router, selectedCode]);

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
          disabled={isSubmitting}
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
    [colors, handleSelect, isSubmitting, selectedCode]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 16 }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <StepIndicator currentStep={2} totalSteps={2} />
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {specialtyName}
        </Text>
        <Text style={[styles.title, { color: colors.text }]}>What year are you in?</Text>
      </View>

      {error && (
        <ErrorBanner
          message={error}
          onRetry={() => setError(null)}
        />
      )}

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
          onPress={handleConfirm}
          loading={isSubmitting}
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
  header: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  backButton: {
    marginBottom: 12,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '500',
    marginTop: 12,
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  list: {
    paddingHorizontal: 24,
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
