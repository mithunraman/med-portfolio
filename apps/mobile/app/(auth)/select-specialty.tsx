import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SpecialtyList, StepIndicator } from '@/components';
import { useTheme } from '@/theme';
import type { SpecialtyOption } from '@acme/shared';

export default function SelectSpecialtyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

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

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 16 }]}>
      <View style={styles.header}>
        <StepIndicator currentStep={1} totalSteps={2} />
        <Text style={[styles.title, { color: colors.text }]}>What are you training in?</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          This helps us tailor your portfolio experience to your curriculum.
        </Text>
      </View>

      <SpecialtyList onSelect={handleSelect} />
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
});
