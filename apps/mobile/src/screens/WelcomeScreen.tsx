import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme';
import { useAuth } from '../hooks';
import type { OnboardingStackScreenProps } from '../navigation/types';

type NavigationProp = OnboardingStackScreenProps<'Welcome'>['navigation'];

export function WelcomeScreen() {
  const navigation = useNavigation<NavigationProp>();
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
    navigation.navigate('Login');
  }, [navigation]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.content, { paddingTop: insets.top + 60 }]}>
        {/* Logo / Icon */}
        <View style={[styles.logoContainer, { backgroundColor: colors.surface }]}>
          <Text style={[styles.logoText, { color: colors.primary }]}>App</Text>
        </View>

        {/* Welcome Text */}
        <Text style={[styles.title, { color: colors.text }]}>Ready to get started?</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Create an account to save your progress, or explore the app first.
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

        {/* Helper text */}
        <Text style={[styles.helperText, { color: colors.textSecondary }]}>
          You can explore first without creating an account
        </Text>

        {/* Secondary: Sign in */}
        <TouchableOpacity
          style={[styles.secondaryButton, { borderColor: colors.border }]}
          onPress={handleSignIn}
          disabled={isLoading}
          activeOpacity={0.8}
        >
          <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Sign in</Text>
        </TouchableOpacity>

        {/* Create account link */}
        <View style={styles.createAccountRow}>
          <Text style={[styles.createAccountText, { color: colors.textSecondary }]}>
            New here?{' '}
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Register')}>
            <Text style={[styles.createAccountLink, { color: colors.primary }]}>
              Create an account
            </Text>
          </TouchableOpacity>
        </View>
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
    paddingHorizontal: 24,
  },
  logoContainer: {
    width: 100,
    height: 100,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  logoText: {
    fontSize: 32,
    fontWeight: 'bold',
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
    gap: 12,
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
  helperText: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  secondaryButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontSize: 18,
    fontWeight: '600',
  },
  createAccountRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
  },
  createAccountText: {
    fontSize: 14,
  },
  createAccountLink: {
    fontSize: 14,
    fontWeight: '600',
  },
});
