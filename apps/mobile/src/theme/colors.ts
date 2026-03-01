export interface ThemeColors {
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  primary: string;
  border: string;
  error: string;
}

export type ThemeName = 'gmail' | 'linear' | 'spotify' | 'notion' | 'stripe' | 'forest' | 'sunset';

const themes: Record<ThemeName, Record<'light' | 'dark', ThemeColors>> = {
  gmail: {
    light: {
      background: '#ffffff',
      surface: '#f6f8fc',
      text: '#202124',
      textSecondary: '#5f6368',
      primary: '#c5221f',
      border: '#dadce0',
      error: '#d93025',
    },
    dark: {
      background: '#202124',
      surface: '#292a2d',
      text: '#e8eaed',
      textSecondary: '#9aa0a6',
      primary: '#f28b82',
      border: '#3c4043',
      error: '#f28b82',
    },
  },

  linear: {
    light: {
      background: '#ffffff',
      surface: '#f9f9fb',
      text: '#171717',
      textSecondary: '#6b6b6b',
      primary: '#5e6ad2',
      border: '#e6e6e6',
      error: '#eb5757',
    },
    dark: {
      background: '#0d0d0d',
      surface: '#1a1a1a',
      text: '#eeeeee',
      textSecondary: '#8a8a8a',
      primary: '#8b8fea',
      border: '#2a2a2a',
      error: '#f27878',
    },
  },

  spotify: {
    light: {
      background: '#ffffff',
      surface: '#f4f4f4',
      text: '#191414',
      textSecondary: '#535353',
      primary: '#1db954',
      border: '#e1e1e1',
      error: '#e22134',
    },
    dark: {
      background: '#121212',
      surface: '#181818',
      text: '#ffffff',
      textSecondary: '#b3b3b3',
      primary: '#1ed760',
      border: '#282828',
      error: '#f15e6c',
    },
  },

  notion: {
    light: {
      background: '#ffffff',
      surface: '#fbfbfa',
      text: '#37352f',
      textSecondary: '#787774',
      primary: '#2eaadc',
      border: '#e9e9e7',
      error: '#e03e3e',
    },
    dark: {
      background: '#191919',
      surface: '#202020',
      text: '#e6e6e4',
      textSecondary: '#9b9a97',
      primary: '#529cca',
      border: '#2f2f2f',
      error: '#ff7369',
    },
  },

  stripe: {
    light: {
      background: '#ffffff',
      surface: '#f6f9fc',
      text: '#1a1a1a',
      textSecondary: '#697386',
      primary: '#635bff',
      border: '#e3e8ee',
      error: '#df1b41',
    },
    dark: {
      background: '#0a2540',
      surface: '#0f3354',
      text: '#ffffff',
      textSecondary: '#9ca3af',
      primary: '#7a73ff',
      border: '#1a4971',
      error: '#fe87a1',
    },
  },

  forest: {
    light: {
      background: '#fefdfb',
      surface: '#f5f3ef',
      text: '#2d3a2d',
      textSecondary: '#5c6b5c',
      primary: '#2d6a4f',
      border: '#dde3da',
      error: '#c1403d',
    },
    dark: {
      background: '#1a1d1a',
      surface: '#242824',
      text: '#e5e8e5',
      textSecondary: '#98a398',
      primary: '#52b788',
      border: '#3a423a',
      error: '#e87c79',
    },
  },

  sunset: {
    light: {
      background: '#ffffff',
      surface: '#faf8f7',
      text: '#1c1917',
      textSecondary: '#78716c',
      primary: '#f97316',
      border: '#e7e5e4',
      error: '#dc2626',
    },
    dark: {
      background: '#1c1917',
      surface: '#292524',
      text: '#fafaf9',
      textSecondary: '#a8a29e',
      primary: '#fb923c',
      border: '#3d3836',
      error: '#f87171',
    },
  },
};

// 'gmail' | 'linear' | 'spotify' | 'notion' | 'stripe' | 'forest' | 'sunset';

// ✨ Change this line to switch themes
const ACTIVE_THEME: ThemeName = 'forest';

export const colors = themes[ACTIVE_THEME];
export { themes };
