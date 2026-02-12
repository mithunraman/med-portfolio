import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAppDispatch, useAppSelector } from '../hooks';
import { initializeAuth, loadNudgeState, loadOnboardingState } from '../store';
import { MainNavigator } from './MainNavigator';
import { OnboardingNavigator } from './OnboardingNavigator';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

function LoadingScreen() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" />
    </View>
  );
}

export function RootNavigator() {
  const dispatch = useAppDispatch();

  // Auth state
  const authStatus = useAppSelector((state) => state.auth.status);

  // Onboarding state (for account hint)
  const onboardingInitialized = useAppSelector((state) => state.onboarding.isInitialized);

  // Initialize app state on mount
  useEffect(() => {
    dispatch(initializeAuth());
    dispatch(loadOnboardingState());
    dispatch(loadNudgeState());
  }, [dispatch]);

  // Show loading while initializing
  const isLoading = authStatus === 'idle' || authStatus === 'loading' || !onboardingInitialized;

  if (isLoading) {
    return <LoadingScreen />;
  }

  // Simple logic: logged in → Main, not logged in → Onboarding
  const isLoggedIn = authStatus === 'authenticated' || authStatus === 'guest';

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isLoggedIn ? (
        <Stack.Screen name="Main" component={MainNavigator} />
      ) : (
        <Stack.Screen name="Onboarding" component={OnboardingNavigator} />
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
