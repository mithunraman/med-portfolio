import { Redirect } from 'expo-router';
import { useAppSelector } from '@/hooks';

export default function Index() {
  const authStatus = useAppSelector((state) => state.auth.status);
  const isLoggedIn = authStatus === 'authenticated' || authStatus === 'guest';

  if (isLoggedIn) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/(auth)/intro" />;
}
