import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { Stack, useRouter } from 'expo-router';
import { Pressable } from 'react-native';

export default function PdpGoalLayout() {
  const { colors } = useTheme();
  const router = useRouter();

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
        name="[goalId]"
        options={{
          title: 'PDP Goal',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Feather name="arrow-left" size={24} color={colors.text} />
            </Pressable>
          ),
        }}
      />
    </Stack>
  );
}
