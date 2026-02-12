import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  type NavigationState,
} from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider as ReduxProvider } from 'react-redux';
import { RootNavigator } from './navigation';
import { store } from './store';
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
        <RootNavigator />
        <StatusBar style={isDark ? 'light' : 'dark'} />
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
    <ReduxProvider store={store}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ThemedApp
            onNavigationReady={onNavigationReady}
            onNavigationStateChange={onNavigationStateChange}
          />
        </ThemeProvider>
      </SafeAreaProvider>
    </ReduxProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
