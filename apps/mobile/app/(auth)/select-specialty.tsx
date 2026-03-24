import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState, StepIndicator } from '@/components';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { fetchSpecialties } from '@/store/slices/authSlice';
import { useTheme } from '@/theme';
import type { SpecialtyOption } from '@acme/shared';

type LoadState = 'idle' | 'loading' | 'success' | 'error';

export default function SelectSpecialtyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const dispatch = useAppDispatch();
  const specialties = useAppSelector((s) => s.auth.specialties);

  const [loadState, setLoadState] = useState<LoadState>(specialties.length > 0 ? 'success' : 'idle');
  const [error, setError] = useState<string | null>(null);

  const loadSpecialties = useCallback(async () => {
    setLoadState('loading');
    setError(null);
    try {
      await dispatch(fetchSpecialties()).unwrap();
      setLoadState('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : (err as string) ?? 'Failed to load specialties');
      setLoadState('error');
    }
  }, [dispatch]);

  useEffect(() => {
    if (specialties.length === 0) {
      loadSpecialties();
    }
  }, []);

  const handleSelect = useCallback(
    (option: SpecialtyOption) => {
      router.push({
        pathname: '/(auth)/select-stage',
        params: {
          specialty: option.specialty.toString(),
          specialtyName: option.name,
        },
      });
    },
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: SpecialtyOption }) => (
      <TouchableOpacity
        style={[styles.optionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => handleSelect(item)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}. Double tap to select.`}
      >
        <View style={styles.optionContent}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>{item.name}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
      </TouchableOpacity>
    ),
    [colors, handleSelect]
  );

  const renderContent = () => {
    if (loadState === 'loading' || loadState === 'idle') {
      return (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }

    if (loadState === 'error') {
      return (
        <View style={styles.loading}>
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn't load specialties"
            description={error ?? 'Something went wrong. Please try again.'}
            actionLabel="Try Again"
            onAction={loadSpecialties}
          />
        </View>
      );
    }

    return (
      <FlatList
        data={specialties}
        keyExtractor={(item) => item.specialty.toString()}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 16 }]}>
      <View style={styles.header}>
        <StepIndicator currentStep={1} totalSteps={2} />
        <Text style={[styles.title, { color: colors.text }]}>What are you training in?</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          This helps us tailor your portfolio experience to your curriculum.
        </Text>
      </View>

      {renderContent()}
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
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 8,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  },
  optionLabel: {
    fontSize: 18,
    fontWeight: '600',
  },
});
