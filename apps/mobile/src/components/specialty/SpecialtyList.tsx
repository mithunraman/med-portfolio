import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { fetchSpecialties } from '@/store/slices/authSlice';
import { useTheme } from '@/theme';
import type { SpecialtyOption } from '@acme/shared';
import { EmptyState } from '../EmptyState';

type LoadState = 'idle' | 'loading' | 'success' | 'error';

export interface SpecialtyListProps {
  /** Called when the user taps a specialty. */
  onSelect: (option: SpecialtyOption) => void;
}

/**
 * Presentational + data-loading list of specialties. Shared by the onboarding
 * `select-specialty` screen and the settings `change-specialty` screen - the
 * two flows differ only in their surrounding chrome and what `onSelect` does.
 */
export function SpecialtyList({ onSelect }: SpecialtyListProps) {
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

  const renderItem = useCallback(
    ({ item }: { item: SpecialtyOption }) => (
      <TouchableOpacity
        style={[styles.optionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => onSelect(item)}
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
    [colors, onSelect]
  );

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
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: 24,
    paddingTop: 8,
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
