export interface ThemeColors {
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  primary: string;
  border: string;
  error: string;
}

export const colors: Record<'light' | 'dark', ThemeColors> = {
  light: {
    background: '#ffffff',
    surface: '#f5f5f5',
    text: '#000000',
    textSecondary: '#666666',
    primary: '#228be6',
    border: '#eeeeee',
    error: '#dc3545',
  },
  dark: {
    background: '#121212',
    surface: '#1e1e1e',
    text: '#ffffff',
    textSecondary: '#a0a0a0',
    primary: '#4dabf7',
    border: '#333333',
    error: '#ff6b6b',
  },
};
