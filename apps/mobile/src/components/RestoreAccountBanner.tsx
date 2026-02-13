import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppDispatch } from '../hooks';
import type { AccountHint } from '../services';
import { dismissAccountHint } from '../store';
import { useTheme } from '../theme';

interface RestoreAccountBannerProps {
  accountHint: AccountHint;
}

export function RestoreAccountBanner({ accountHint }: RestoreAccountBannerProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const dispatch = useAppDispatch();

  const handleRestore = useCallback(() => {
    router.push('/(auth)/login');
  }, [router]);

  const handleDismiss = useCallback(() => {
    dispatch(dismissAccountHint());
  }, [dispatch]);

  // Mask email for privacy (show first 2 chars and domain)
  const maskedEmail = accountHint.email.replace(/^(.{2})(.*)(@.*)$/, '$1***$3');

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>Welcome back!</Text>
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          We found a previous account ({maskedEmail}). Would you like to sign in?
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.restoreButton, { backgroundColor: colors.primary }]}
          onPress={handleRestore}
          activeOpacity={0.8}
        >
          <Text style={styles.restoreButtonText}>Sign In</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.dismissButton} onPress={handleDismiss} activeOpacity={0.8}>
          <Text style={[styles.dismissButtonText, { color: colors.textSecondary }]}>
            Continue as guest
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  content: {
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  restoreButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  restoreButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  dismissButton: {
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  dismissButtonText: {
    fontSize: 14,
  },
});
