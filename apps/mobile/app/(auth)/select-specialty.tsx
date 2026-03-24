import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect } from 'react';
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
import { fetchSpecialties } from '@/store/slices/authSlice';
import { useTheme } from '@/theme';
import type { SpecialtyOption } from '@acme/shared';

export default function SelectSpecialtyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const dispatch = useAppDispatch();
  const specialties = useAppSelector((s) => s.auth.specialties);

  useEffect(() => {
    if (specialties.length === 0) {
      dispatch(fetchSpecialties());
    }
  }, [dispatch, specialties.length]);

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
      >
        <View style={styles.optionContent}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>{item.name}</Text>
          <Text style={[styles.optionMeta, { color: colors.textSecondary }]}>
            {item.trainingStages.length} training stages
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
      </TouchableOpacity>
    ),
    [colors, handleSelect]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 16 }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>What are you training in?</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          This helps us tailor your portfolio experience to your curriculum.
        </Text>
      </View>

      {specialties.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={specialties}
          keyExtractor={(item) => item.specialty.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
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
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
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
    marginBottom: 4,
  },
  optionMeta: {
    fontSize: 14,
  },
});
