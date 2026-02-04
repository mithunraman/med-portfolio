import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { AuthUser, LoginRequest, RegisterRequest } from '@acme/shared';
import { api, mobileTokenProvider, setOnUnauthorized } from '../api/client';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
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
      await mobileTokenProvider.clearAccessToken();
      setUser(null);
    }
  }, []);

  const login = useCallback(async (credentials: LoginRequest) => {
    const response = await api.auth.login(credentials);
    await mobileTokenProvider.setAccessToken(response.accessToken);
    setUser(response.user);
  }, []);

  const register = useCallback(async (data: RegisterRequest) => {
    const response = await api.auth.register(data);
    await mobileTokenProvider.setAccessToken(response.accessToken);
    setUser(response.user);
  }, []);

  // Check for existing token on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = await mobileTokenProvider.getAccessToken();
      if (token) {
        try {
          const currentUser = await api.auth.me();
          setUser(currentUser);
        } catch {
          await mobileTokenProvider.clearAccessToken();
        }
      }
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  // Set up unauthorized callback
  useEffect(() => {
    setOnUnauthorized(() => {
      logout();
    });
  }, [logout]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
