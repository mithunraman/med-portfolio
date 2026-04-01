import { useTheme } from '@/theme';
import { StyleSheet, Text, View } from 'react-native';

interface SettingsSectionProps {
  title: string;
  children: React.ReactNode;
}

export function SettingsSection({ title, children }: SettingsSectionProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: colors.textSecondary }]}>{title}</Text>
      <View style={[styles.content, { backgroundColor: colors.surface }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    paddingHorizontal: 24,
  },
  content: {
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
});
