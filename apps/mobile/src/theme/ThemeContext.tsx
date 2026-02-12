import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppStorage } from '../services/AppStorage';
import { colors, type ThemeColors } from './colors';

type ThemeMode = 'light' | 'dark';

interface ThemeContextValue {
  mode: ThemeMode;
  colors: ThemeColors;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: ReactNode;
  defaultMode?: ThemeMode;
}

export function ThemeProvider({ children, defaultMode = 'light' }: ThemeProviderProps) {
  const [mode, setModeState] = useState<ThemeMode>(defaultMode);
  const [isLoading, setIsLoading] = useState(true);

  // Load persisted theme on mount
  useEffect(() => {
    async function loadTheme() {
      const preferences = await AppStorage.get('preferences');
      if (preferences?.themeMode) {
        setModeState(preferences.themeMode);
      }
      setIsLoading(false);
    }
    loadTheme();
  }, []);

  // Persist theme changes
  const setMode = useCallback(async (newMode: ThemeMode) => {
    setModeState(newMode);
    await AppStorage.set('preferences', { themeMode: newMode });
  }, []);

  const toggleMode = useCallback(() => {
    setMode(mode === 'light' ? 'dark' : 'light');
  }, [mode, setMode]);

  const value = useMemo(
    () => ({
      mode,
      colors: colors[mode],
      isDark: mode === 'dark',
      setMode,
      toggleMode,
      isLoading,
    }),
    [mode, setMode, toggleMode, isLoading]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
