import { useAuth } from '@/hooks';
import { useTheme } from '@/theme';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
        {/* Logo — app icon */}
        <Image
          source={require('../../assets/images/splash-icon.png')}
          style={styles.logoImage}
          resizeMode="contain"
        />

        {/* Welcome text */}
        <Text style={[styles.title, { color: colors.text }]}>Your portfolio, simplified</Text>

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
  logoImage: {
    width: 200,
    height: 100,
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
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
