import { useTheme } from '@/theme';
import { Stack } from 'expo-router';

export default function ProfileLayout() {
  const { colors } = useTheme();

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
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="account-settings" options={{ title: 'Account Settings' }} />
      <Stack.Screen name="privacy-support" options={{ title: 'Privacy & Support' }} />
    </Stack>
  );
}
