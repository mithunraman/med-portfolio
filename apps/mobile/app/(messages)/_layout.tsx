import { useTheme } from '@/theme';
import { Stack } from 'expo-router';

export default function MessagesLayout() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Messages',
        }}
      />
      <Stack.Screen
        name="[conversationId]"
        options={{
          title: 'Chat',
        }}
      />
    </Stack>
  );
}
