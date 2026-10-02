import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { Stack, useRouter } from 'expo-router';
import { Pressable } from 'react-native';

export default function SampleLayout() {
  const { colors } = useTheme();
  const router = useRouter();

  const backButton = () => (
    <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Go back">
      <Feather name="arrow-left" size={24} color={colors.text} />
    </Pressable>
  );

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
        headerLeft: backButton,
      }}
    >
      <Stack.Screen name="entry" options={{ title: 'Sample entry' }} />
      <Stack.Screen name="conversation" options={{ title: 'Sample conversation' }} />
    </Stack>
  );
}
