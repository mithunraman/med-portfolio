import { setOnQuotaUpdate, setOnUnauthorized } from '@/api/client';
import { Button, ErrorBoundary, LoadingProvider } from '@/components';
import { ActiveBanner } from '@/components/ActiveBanner';
import { ForceUpdateScreen } from '@/components/ForceUpdateScreen';
import { NoticeModal } from '@/components/NoticeModal';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { useBackgroundStaleTimer } from '@/hooks/useBackgroundStaleTimer';
import { useNetworkListener } from '@/hooks/useNetworkListener';
import {
  fetchInit,
  initializeAuth,
  loadDismissedUpdateVersion,
  loadOnboardingState,
  selectHasMandatoryUpdate,
  selectInitError,
  selectInitLoaded,
  selectInitLoading,
  selectNeedsAcknowledgement,
  selectUpdatePolicy,
  setUnauthenticated,
  store,
  updateQuota,
} from '@/store';
import { ThemeProvider, useTheme } from '@/theme';
import { decideOnboardingRoute } from '@/utils/routing/decide-onboarding-route';
import { ActionSheetProvider } from '@expo/react-native-action-sheet';
import * as Sentry from '@sentry/react-native';
import * as Linking from 'expo-linking';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider as ReduxProvider } from 'react-redux';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: __DEV__ ? 'development' : 'production',

  // Explicit (default is also false); matches the API config and our published privacy notice.
  sendDefaultPii: false,

  // Sample 10% of transactions in production, 100% in dev
  tracesSampleRate: __DEV__ ? 1.0 : 1,

  // Track crash-free session rate
  enableAutoSessionTracking: true,

  // Disabled in dev to avoid noise during local testing
  enabled: !__DEV__,
});

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

function InitErrorScreen({ onRetry, errorDetail }: { onRetry: () => void; errorDetail?: string | null }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.errorScreen, { backgroundColor: colors.background }]}>
      <Text style={[styles.errorTitle, { color: colors.text }]}>Couldn't load your data</Text>
      <Text style={[styles.errorBody, { color: colors.textSecondary }]}>
        Check your connection and try again.
      </Text>
      {__DEV__ && errorDetail ? (
        <Text style={[styles.errorDetail, { color: colors.textSecondary }]}>{errorDetail}</Text>
      ) : null}
      <Button label="Retry" onPress={onRetry} style={styles.retryButton} />
    </View>
  );
}

function RootLayoutNav() {
  const router = useRouter();
  const segments = useSegments();
  const dispatch = useAppDispatch();
  const { colors, isDark } = useTheme();

  const authStatus = useAppSelector((state) => state.auth.status);
  const user = useAppSelector((state) => state.auth.user);
  const onboardingInitialized = useAppSelector((state) => state.onboarding.isInitialized);
  const updatePolicy = useAppSelector(selectUpdatePolicy);
  const hasMandatoryUpdate = useAppSelector(selectHasMandatoryUpdate);
  const initLoaded = useAppSelector(selectInitLoaded);
  const initLoading = useAppSelector(selectInitLoading);
  const initError = useAppSelector(selectInitError);
  const needsAck = useAppSelector(selectNeedsAcknowledgement);

  // Subscribe to network state changes
  useNetworkListener();

  // Mark data stale when app returns from background after 15+ minutes
  useBackgroundStaleTimer();

  // Initialize app state on mount
  useEffect(() => {
    dispatch(initializeAuth());
    dispatch(loadOnboardingState());
    dispatch(loadDismissedUpdateVersion());

    // On 401, clear auth state so user is redirected to login
    setOnUnauthorized(() => {
      dispatch(setUnauthenticated());
    });

    // On quota header update, sync Redux state
    setOnQuotaUpdate((headers) => {
      dispatch(
        updateQuota({
          shortWindow: {
            used: headers.shortUsed,
            limit: headers.shortLimit,
            resetsAt: headers.shortReset,
            windowType: 'rolling',
          },
          weeklyWindow: {
            used: headers.weeklyUsed,
            limit: headers.weeklyLimit,
            resetsAt: headers.weeklyReset,
            windowType: 'fixed',
          },
        })
      );
    });
  }, [dispatch]);

  const isLoading = authStatus === 'idle' || authStatus === 'loading' || !onboardingInitialized;
  const isLoggedIn = authStatus === 'authenticated' || authStatus === 'guest';

  // Hoist /init dispatch into the root layout so the auth flow can read it
  // before any post-login screen mounts. Auth thunks no longer fetch init
  // themselves — see authSlice docs.
  useEffect(() => {
    if (isLoggedIn && !initLoaded && !initLoading && !initError) {
      dispatch(fetchInit());
    }
  }, [isLoggedIn, initLoaded, initLoading, initError, dispatch]);

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

    if (parsed.path) {
      if (isLoggedIn) {
        if (parsed.path === 'entries') {
          router.push('/(tabs)/entries');
        } else if (parsed.path === 'pdp') {
          router.push('/(tabs)/pdp');
        } else if (parsed.path === 'profile') {
          router.push('/(tabs)/profile');
        } else if (parsed.path === 'home') {
          router.push('/(tabs)');
        }
      } else {
        if (parsed.path === 'login') {
          router.push('/(auth)/login');
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

  // Onboarding is a sequence of ordered gates over real data, not a state
  // machine over a progress field. Routing logic lives in decideOnboardingRoute
  // — pure function, unit-testable, each gate tests one condition. Screens
  // update state and refresh /init — they do not navigate forward themselves.
  useEffect(() => {
    if (isLoading) return;
    if (isLoggedIn && !initLoaded) return;

    const decision = decideOnboardingRoute({
      isLoggedIn,
      needsAck,
      hasSpecialty: user != null && user.specialty != null,
      segments: segments as unknown as string[],
    });
    if (decision.kind === 'redirect') {
      router.replace(decision.to);
    }
  }, [isLoading, isLoggedIn, initLoaded, needsAck, user, segments, router]);

  if (isLoading || (isLoggedIn && !initLoaded && !initError)) {
    return <LoadingScreen />;
  }

  // /init failed and the user has no way to recover from the loading state
  // without an explicit retry. Bypasses the effect's `!initError` guard;
  // `fetchInit.pending` resets `error=null`/`status='loading'`, restoring
  // the normal flow.
  if (isLoggedIn && initError) {
    return <InitErrorScreen onRetry={() => dispatch(fetchInit())} errorDetail={initError} />;
  }

  if (hasMandatoryUpdate && updatePolicy) {
    return <ForceUpdateScreen updatePolicy={updatePolicy} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActiveBanner />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(messages)" options={{ presentation: 'card' }} />
        <Stack.Screen name="(entry)" options={{ presentation: 'card' }} />
        <Stack.Screen name="(pdp-goal)" options={{ presentation: 'card' }} />
        <Stack.Screen name="(review-period)" options={{ presentation: 'card' }} />
        <Stack.Screen name="(profile-settings)" options={{ presentation: 'card' }} />
        <Stack.Screen name="credits-info" options={{ presentation: 'card' }} />
        <Stack.Screen name="claim-account" options={{ presentation: 'modal' }} />
      </Stack>
      <NoticeModal />
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </View>
  );
}

function RootLayout() {
  return (
    <ErrorBoundary>
      <ReduxProvider store={store}>
        <SafeAreaProvider>
          <KeyboardProvider>
            <ThemeProvider>
              <ActionSheetProvider>
                <LoadingProvider>
                  <RootLayoutNav />
                </LoadingProvider>
              </ActionSheetProvider>
            </ThemeProvider>
          </KeyboardProvider>
        </SafeAreaProvider>
      </ReduxProvider>
    </ErrorBoundary>
  );
}

export default Sentry.wrap(RootLayout);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  errorBody: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorDetail: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
    opacity: 0.7,
  },
  retryButton: {
    marginTop: 24,
    paddingHorizontal: 32,
  },
});
