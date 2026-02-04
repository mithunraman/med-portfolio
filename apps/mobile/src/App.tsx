import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './auth';
import { RootNavigator } from './navigation';

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <AuthProvider>
          <RootNavigator />
          <StatusBar style="auto" />
        </AuthProvider>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
