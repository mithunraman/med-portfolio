import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorBanner, StageList, StepIndicator } from '@/components';
import { useAppDispatch } from '@/hooks';
import { updateProfile } from '@/store/slices/authSlice';
import { useTheme } from '@/theme';
import type { Specialty } from '@acme/shared';

export default function SelectStageScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const dispatch = useAppDispatch();

  const { specialty, specialtyName } = useLocalSearchParams<{
    specialty: string;
    specialtyName: string;
  }>();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = useCallback(
    async (stageCode: string) => {
      setIsSubmitting(true);
      setError(null);
      try {
        await dispatch(
          updateProfile({
            specialty: Number(specialty) as Specialty,
            trainingStage: stageCode,
          })
        ).unwrap();
        router.replace('/(tabs)');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [dispatch, specialty, router]
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
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{specialtyName}</Text>
        <Text style={[styles.title, { color: colors.text }]}>What year are you in?</Text>
      </View>

      {error && <ErrorBanner message={error} onRetry={() => setError(null)} />}

      <StageList
        specialty={specialty}
        submitting={isSubmitting}
        onConfirm={handleConfirm}
        onSelectionChange={() => setError(null)}
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
});
