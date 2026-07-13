import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorBanner, StageList } from '@/components';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { fetchSpecialties, updateProfile } from '@/store/slices/authSlice';
import { useTheme } from '@/theme';
import { Specialty } from '@acme/shared';

export default function SelectStageScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const dispatch = useAppDispatch();

  const specialties = useAppSelector((s) => s.auth.specialties);

  const params = useLocalSearchParams<{ specialty?: string; specialtyName?: string }>();

  // GP is the only active specialty today, so onboarding skips the specialty
  // picker and lands here directly with no params — default to GP. When a
  // specialty step is reintroduced (>1 active) it passes these params, which
  // take precedence, and this screen keeps working unchanged.
  const cameFromSpecialtyPicker = params.specialty != null;
  const specialty = params.specialty ?? String(Specialty.GP);
  const specialtyName =
    params.specialtyName ??
    specialties.find((s) => s.specialty === Specialty.GP)?.name ??
    'General Practice';

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Explicit load state for the specialties fetch. Modelled directly rather than
  // inferred from `specialties.length === 0`, so a transient fetch failure shows
  // a retryable error instead of an unrecoverable spinner (this screen is the
  // sole fetcher on the GP-only path — the specialty picker never mounts).
  const [loadState, setLoadState] = useState<'loading' | 'error' | 'ready'>(
    specialties.length > 0 ? 'ready' : 'loading'
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  // StageList reads its training stages from the specialties in the store. When
  // reached via the (skipped) specialty picker these were already loaded; when
  // reached directly (the GP-only path) we must load them ourselves.
  const loadSpecialties = useCallback(async () => {
    setLoadState('loading');
    setLoadError(null);
    try {
      await dispatch(fetchSpecialties()).unwrap();
      setLoadState('ready');
    } catch (err) {
      setLoadState('error');
      setLoadError(typeof err === 'string' ? err : 'Failed to load. Please try again.');
    }
  }, [dispatch]);

  // Fetch only when the store is empty. On the warm path we skip the dispatch:
  // the thunk's `condition` would abort it and `.unwrap()` would reject, which
  // we'd otherwise misread as a load failure.
  useEffect(() => {
    if (specialties.length === 0) {
      loadSpecialties();
    }
  }, []);

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
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: insets.top + 16 },
      ]}
    >
      <View style={styles.header}>
        {/* Back button only when a specialty step precedes this one. In the
            GP-only flow this is the first onboarding step, so it's hidden. */}
        {cameFromSpecialtyPicker ? (
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
        ) : null}
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{specialtyName}</Text>
        <Text style={[styles.title, { color: colors.text }]}>What year are you in?</Text>
      </View>

      {error && <ErrorBanner message={error} onRetry={() => setError(null)} />}

      {loadState === 'error' ? (
        <ErrorBanner
          message={loadError ?? 'Failed to load. Please try again.'}
          onRetry={loadSpecialties}
        />
      ) : loadState === 'loading' ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <StageList
          specialty={specialty}
          submitting={isSubmitting}
          onConfirm={handleConfirm}
          onSelectionChange={() => setError(null)}
        />
      )}
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
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
