import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks';
import { useTheme } from '@/theme';

/** Convert a hex colour to rgba with the given alpha (0–1). */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { registerGuest } = useAuth();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTryApp = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await registerGuest();
      // Navigation will happen automatically via RootNavigator when status changes
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [registerGuest]);

  const handleSignIn = useCallback(() => {
    router.push('/(auth)/login');
  }, [router]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Centred content block */}
      <View style={styles.content}>
        {/* Logo — double-ring icon, matching intro screen */}
        <View style={[styles.logoRing, { backgroundColor: hexToRgba(colors.primary, 0.06) }]}>
          <View
            style={[styles.logoContainer, { backgroundColor: hexToRgba(colors.primary, 0.12) }]}
          >
            <Ionicons name="briefcase-outline" size={48} color={colors.primary} />
          </View>
        </View>

        {/* Welcome text */}
        <Text style={[styles.title, { color: colors.text }]}>Your portfolio, simplified</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Speak about your clinical experiences. We'll do the paperwork.
        </Text>

        {/* Error message */}
        {error && (
          <View style={[styles.errorContainer, { backgroundColor: colors.error + '20' }]}>
            <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          </View>
        )}
      </View>

      {/* CTA Buttons */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
        {/* Primary: Try the app */}
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.primary }]}
          onPress={handleTryApp}
          disabled={isLoading}
          activeOpacity={0.8}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Try the app</Text>
          )}
        </TouchableOpacity>

        {/* Secondary: Sign in — text link style */}
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handleSignIn}
          disabled={isLoading}
          activeOpacity={0.8}
        >
          <Text style={[styles.secondaryButtonText, { color: colors.textSecondary }]}>
            Already have an account? <Text style={{ color: colors.primary }}>Sign in</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logoRing: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  logoContainer: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  errorContainer: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    width: '100%',
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 24,
    gap: 16,
  },
  primaryButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
