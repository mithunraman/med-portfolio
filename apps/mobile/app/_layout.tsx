import { ErrorBoundary } from '@/components';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { initializeAuth, loadNudgeState, loadOnboardingState, store } from '@/store';
import { ThemeProvider, useTheme } from '@/theme';
import * as Linking from 'expo-linking';
import { Slot, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider as ReduxProvider } from 'react-redux';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

function LoadingScreen() {
  const { colors } = useTheme();
  return (
    <View style={[styles.loading, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

function RootLayoutNav() {
  const router = useRouter();
  const segments = useSegments();
  const dispatch = useAppDispatch();
  const { colors, isDark } = useTheme();

  const authStatus = useAppSelector((state) => state.auth.status);
  const onboardingInitialized = useAppSelector((state) => state.onboarding.isInitialized);

  // Initialize app state on mount
  useEffect(() => {
    dispatch(initializeAuth());
    dispatch(loadOnboardingState());
    dispatch(loadNudgeState());
  }, [dispatch]);

  const isLoading = authStatus === 'idle' || authStatus === 'loading' || !onboardingInitialized;
  const isLoggedIn = authStatus === 'authenticated' || authStatus === 'guest';

  // Handle deep linking
  useEffect(() => {
    // Handle initial URL when app is opened via deep link
    const handleInitialURL = async () => {
      const initialURL = await Linking.getInitialURL();
      if (initialURL) {
        handleDeepLink(initialURL);
      }
    };

    // Handle URL when app is already open
    const subscription = Linking.addEventListener('url', (event) => {
      handleDeepLink(event.url);
    });

    handleInitialURL();

    return () => {
      subscription.remove();
    };
  }, [isLoggedIn, isLoading]);

  const handleDeepLink = (url: string) => {
    if (isLoading) return;

    const parsed = Linking.parse(url);
    // Example: mobile2://dashboard/123 -> navigate to dashboard item
    // Example: mobile2://settings -> navigate to settings

    if (parsed.path) {
      // Only navigate to protected routes if logged in
      if (isLoggedIn) {
        if (parsed.path.startsWith('dashboard')) {
          const itemId = parsed.path.split('/')[1];
          if (itemId) {
            router.push(`/(tabs)/dashboard/${itemId}`);
          } else {
            router.push('/(tabs)/dashboard');
          }
        } else if (parsed.path === 'settings') {
          router.push('/(tabs)/settings');
        } else if (parsed.path === 'home') {
          router.push('/(tabs)');
        }
      } else {
        // For unauthenticated users, only allow auth routes
        if (parsed.path === 'login') {
          router.push('/(auth)/login');
        } else if (parsed.path === 'register') {
          router.push('/(auth)/register');
        }
      }
    }
  };

  // Hide splash screen once loading is complete
  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync();
    }
  }, [isLoading]);

  // Handle auth-based routing
  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (isLoggedIn && inAuthGroup) {
      // Redirect to tabs if logged in but on auth screens
      router.replace('/(tabs)');
    } else if (!isLoggedIn && !inAuthGroup) {
      // Redirect to auth if not logged in and not on auth screens
      router.replace('/(auth)/intro');
    }
  }, [isLoggedIn, segments, isLoading, router]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Slot />
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </View>
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <ReduxProvider store={store}>
        <SafeAreaProvider>
          <KeyboardProvider>
            <ThemeProvider>
              <RootLayoutNav />
            </ThemeProvider>
          </KeyboardProvider>
        </SafeAreaProvider>
      </ReduxProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
