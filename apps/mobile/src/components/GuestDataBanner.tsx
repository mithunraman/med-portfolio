import { SEVERITY_COLORS } from '@/constants/notices';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { dismissGuestBanner, selectRecentEntriesTotal } from '@/store';
import { useTheme } from '@/theme';
import { NoticeSeverity } from '@acme/shared';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

/**
 * Lean inline Home notice reminding a guest their work isn't tied to an account
 * (MOB-009). A chronic reminder, so it's a quiet one-line text note (not a promo
 * card) that lives in content between the capture CTA and Recent cases - a top
 * system banner would be crowded out by the quota/offline banners.
 *
 * Self-gating: shown only for a guest with >=1 entry (something to lose) who hasn't
 * dismissed it this session. Suppressed at the guest artefact limit, where the more
 * urgent GuestLimitBanner takes over (never two guest notices at once).
 *
 * "See why" routes to the Profile hub (the canonical create-account card), never
 * sign-in: for a guest, login uses a different userId and strands their entries.
 */
export function GuestDataBanner() {
  const isGuest = useAppSelector((s) => s.auth.status === 'guest');
  const hasEntries = useAppSelector((s) => selectRecentEntriesTotal(s) > 0);
  const dismissed = useAppSelector((s) => s.auth.guestBannerDismissed);
  const atLimit = useAppSelector((s) => s.auth.guestArtefactLimitReached);
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const dispatch = useAppDispatch();

  if (!isGuest || !hasEntries || dismissed || atLimit) return null;

  const handleSeeWhy = () => router.push('/(tabs)/profile');

  // Minor attention-seeking wash - a warning (caution) tint at low opacity, bumped
  // slightly in dark mode so it stays perceptible on a dark ground.
  const accent = SEVERITY_COLORS[NoticeSeverity.WARNING];
  const backgroundColor = accent + (isDark ? '2E' : '1F');

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <Text style={[styles.text, { color: colors.text }]}>
        Your data is not being saved.{' '}
        <Text
          style={[styles.link, { color: colors.primary }]}
          onPress={handleSeeWhy}
          accessibilityRole="link"
        >
          See why
        </Text>
      </Text>
      <TouchableOpacity
        onPress={() => dispatch(dismissGuestBanner())}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      >
        <Ionicons name="close" size={16} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  text: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  link: {
    fontWeight: '600',
  },
});
