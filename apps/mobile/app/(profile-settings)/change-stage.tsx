import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ErrorBanner, StageList } from '@/components';
import { useAppDispatch, useAuth } from '@/hooks';
import { updateProfile } from '@/store/slices/authSlice';
import { useTheme } from '@/theme';
import type { Specialty } from '@acme/shared';

export default function ChangeStageScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const dispatch = useAppDispatch();
  const { user } = useAuth();

  const { specialty } = useLocalSearchParams<{ specialty: string; specialtyName: string }>();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-select the current year only when editing within the same specialty.
  const initialStage =
    String(user?.specialty?.code) === specialty
      ? user?.specialty?.trainingStage?.code ?? null
      : null;

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
        router.dismissTo('/(profile-settings)/account-settings');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [dispatch, specialty, router]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {error && <ErrorBanner message={error} onRetry={() => setError(null)} />}

      <StageList
        specialty={specialty}
        initialStage={initialStage}
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
    paddingTop: 16,
  },
});
