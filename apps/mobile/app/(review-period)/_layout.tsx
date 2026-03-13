import { useTheme } from '@/theme';
import { Feather } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { Pressable } from 'react-native';

export default function ReviewPeriodLayout() {
  const { colors } = useTheme();
  const router = useRouter();

  const headerLeft = () => (
    <Pressable onPress={() => router.back()} hitSlop={8}>
      <Feather name="arrow-left" size={24} color={colors.text} />
    </Pressable>
  );

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="list"
        options={{ title: 'Review Periods', headerLeft }}
      />
      <Stack.Screen
        name="create"
        options={{ title: 'Create Review Period', headerLeft }}
      />
      <Stack.Screen
        name="[xid]"
        options={{ title: 'Review Period', headerLeft }}
      />
    </Stack>
  );
}
