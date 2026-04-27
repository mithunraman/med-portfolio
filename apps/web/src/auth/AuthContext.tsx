import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import type { AuthUser } from '@acme/shared';
import { api, webTokenProvider, setOnUnauthorized } from '@/api/client';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  otpSend: (email: string) => Promise<{ isNewUser: boolean; devOtp?: string }>;
  otpVerify: (email: string, code: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      // Ignore errors during logout
    } finally {
      await webTokenProvider.clearTokens();
      setUser(null);
    }
  }, []);

  const otpSend = useCallback(async (email: string) => {
    const response = await api.auth.otpSend({ email });
    return { isNewUser: response.isNewUser, devOtp: response.devOtp };
  }, []);

  const otpVerify = useCallback(async (email: string, code: string, name?: string) => {
    const response = await api.auth.otpVerify({ email, code, name });
    await webTokenProvider.setTokens({
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
    });
    setUser(response.user);
  }, []);

  // Check for existing token on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = await webTokenProvider.getAccessToken();
      if (token) {
        try {
          const currentUser = await api.auth.me();
          setUser(currentUser);
        } catch {
          await webTokenProvider.clearTokens();
        }
      }
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  useEffect(() => {
    setOnUnauthorized(() => {
      logout();
    });
    return () => setOnUnauthorized(null);
  }, [logout]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      otpSend,
      otpVerify,
      logout,
    }),
    [user, isLoading, otpSend, otpVerify, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
