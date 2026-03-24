import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = useCallback(
    async (stage: TrainingStageDefinition) => {
      setIsSubmitting(true);
      setError(null);

      try {
        await dispatch(
          updateProfile({
            specialty: Number(specialty) as Specialty,
            trainingStage: stage.code,
          })
        ).unwrap();
        // Navigation happens automatically via the auth guard in _layout.tsx
        // when user.specialty becomes non-null
        router.replace('/(tabs)');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [dispatch, specialty, router]
  );

  const renderItem = useCallback(
    ({ item }: { item: TrainingStageDefinition }) => (
      <TouchableOpacity
        style={[styles.optionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => handleSelect(item)}
        disabled={isSubmitting}
        activeOpacity={0.7}
      >
        <View style={styles.optionContent}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>{item.label}</Text>
          <Text style={[styles.optionDescription, { color: colors.textSecondary }]}>
            {item.description}
          </Text>
        </View>
        {isSubmitting ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        )}
      </TouchableOpacity>
    ),
    [colors, handleSelect, isSubmitting]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 16 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>What year are you in?</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {specialtyName} training stages
        </Text>
      </View>

      {error && (
        <View style={[styles.errorContainer, { backgroundColor: colors.error + '20' }]}>
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
        </View>
      )}

      <FlatList
        data={stages}
        keyExtractor={(item) => item.code}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
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
    marginBottom: 16,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
  },
  errorContainer: {
    marginHorizontal: 24,
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
  },
  list: {
    paddingHorizontal: 24,
    gap: 12,
    paddingBottom: 24,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
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
  optionDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
});
