import { SEVERITY_COLORS } from '@/constants/notices';
import { useAppSelector } from '@/hooks';
import { useTheme } from '@/theme';
import { NoticeSeverity } from '@acme/shared';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export function GuestLimitBanner() {
  const reached = useAppSelector((s) => s.auth.guestArtefactLimitReached);
  const { colors } = useTheme();
  const router = useRouter();

  if (!reached) return null;

  const accent = SEVERITY_COLORS[NoticeSeverity.WARNING];

  return (
    <View
      style={[styles.container, { backgroundColor: accent + '18', borderLeftColor: accent }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Ionicons name="lock-closed-outline" size={18} color={accent} style={styles.icon} />
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          Guest limit reached
        </Text>
        <Text style={[styles.body, { color: colors.textSecondary }]} numberOfLines={2}>
          You've created the maximum number of entries for a guest account. Upgrade to keep going.
        </Text>
        <TouchableOpacity
          onPress={() => router.push('/claim-account')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Upgrade account"
        >
          <Text style={[styles.action, { color: accent }]}>Upgrade</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: 20,
    marginBottom: 8,
    padding: 12,
    borderRadius: 10,
    borderLeftWidth: 4,
    gap: 8,
  },
  icon: {
    marginTop: 1,
  },
  content: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
  },
  action: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
});
