import { useCallback } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RestoreAccountBanner } from '../components/RestoreAccountBanner';
import { SignupNudgeModal } from '../components/SignupNudgeModal';
import { useAppDispatch, useAppSelector, useAuth } from '../hooks';
import { recordMeaningfulAction } from '../store';
import { useTheme } from '../theme';

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user, isGuest, logout } = useAuth();
  const dispatch = useAppDispatch();

  const accountHint = useAppSelector((state) => state.onboarding.accountHint);
  const shouldShowNudge = useAppSelector((state) => state.nudge.shouldShowNudge);

  // Example: Record meaningful action when user completes something
  const handleMeaningfulAction = useCallback(() => {
    dispatch(recordMeaningfulAction());
  }, [dispatch]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Restore Account Banner (for reinstall users) */}
      {isGuest && accountHint && <RestoreAccountBanner accountHint={accountHint} />}

      {/* Main Content */}
      <View style={[styles.content, { paddingTop: insets.top + 16 }]}>
        <Text style={[styles.title, { color: colors.text }]}>
          Welcome{user?.name ? `, ${user.name}` : ''}!
        </Text>

        {isGuest && (
          <View style={[styles.guestBadge, { backgroundColor: colors.surface }]}>
            <Text style={[styles.guestBadgeText, { color: colors.textSecondary }]}>Guest Mode</Text>
          </View>
        )}

        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {isGuest
            ? 'You are exploring as a guest. Create an account to save your progress.'
            : 'You are signed in. Your data is synced.'}
        </Text>

        {/* Placeholder action button (triggers value moment) */}
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: colors.primary }]}
          onPress={handleMeaningfulAction}
          activeOpacity={0.8}
        >
          <Text style={styles.actionButtonText}>Do Something Meaningful</Text>
        </TouchableOpacity>

        {/* Logout button */}
        <TouchableOpacity
          style={[styles.logoutButton, { borderColor: colors.border }]}
          onPress={logout}
          activeOpacity={0.8}
        >
          <Text style={[styles.logoutButtonText, { color: colors.text }]}>
            {isGuest ? 'Exit Guest Mode' : 'Sign Out'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Signup Nudge Modal (for guest users after meaningful action) */}
      {isGuest && shouldShowNudge && <SignupNudgeModal />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  guestBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 16,
  },
  guestBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  actionButton: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 16,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  logoutButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
  },
  logoutButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
