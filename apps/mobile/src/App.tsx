import { useCallback, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme, type NavigationState } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './auth';
import { RootNavigator } from './navigation';
import { ThemeProvider, useTheme } from './theme';
import { logger } from './utils/logger';

const navLogger = logger.createScope('Navigation');

function getActiveRouteName(state: NavigationState | undefined): string | undefined {
  if (!state) return undefined;
  const route = state.routes[state.index];
  if (route.state) {
    return getActiveRouteName(route.state as NavigationState);
  }
  return route.name;
}

interface ThemedAppProps {
  onNavigationReady: () => void;
  onNavigationStateChange: (state: NavigationState | undefined) => void;
}

function ThemedApp({ onNavigationReady, onNavigationStateChange }: ThemedAppProps) {
  const { colors, isDark } = useTheme();

  const navigationTheme = isDark
    ? {
        ...DarkTheme,
        colors: { ...DarkTheme.colors, background: colors.background, card: colors.surface },
      }
    : {
        ...DefaultTheme,
        colors: { ...DefaultTheme.colors, background: colors.background, card: colors.surface },
      };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <NavigationContainer
        theme={navigationTheme}
        onReady={onNavigationReady}
        onStateChange={onNavigationStateChange}
      >
        <AuthProvider>
          <RootNavigator />
          <StatusBar style={isDark ? 'light' : 'dark'} />
        </AuthProvider>
      </NavigationContainer>
    </View>
  );
}

export default function App() {
  const routeNameRef = useRef<string | undefined>(undefined);

  const onNavigationReady = useCallback(() => {
    navLogger.info('App initialized');
  }, []);

  const onNavigationStateChange = useCallback((state: NavigationState | undefined) => {
    const currentRouteName = getActiveRouteName(state);
    const previousRouteName = routeNameRef.current;

    if (previousRouteName !== currentRouteName && currentRouteName) {
      navLogger.debug('Screen changed', { screen: currentRouteName });
    }

    routeNameRef.current = currentRouteName;
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ThemedApp
          onNavigationReady={onNavigationReady}
          onNavigationStateChange={onNavigationStateChange}
        />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
