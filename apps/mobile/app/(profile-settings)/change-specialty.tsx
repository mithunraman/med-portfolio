import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { SpecialtyList } from '@/components';
import { useTheme } from '@/theme';
import type { SpecialtyOption } from '@acme/shared';

export default function ChangeSpecialtyScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const handleSelect = useCallback(
    (option: SpecialtyOption) => {
      router.push({
        pathname: '/(profile-settings)/change-stage',
        params: {
          specialty: option.specialty.toString(),
          specialtyName: option.name,
        },
      });
    },
    [router]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SpecialtyList onSelect={handleSelect} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 16,
  },
});
