import type { ViewStyle } from 'react-native';

// Shared visual tokens for chat bubbles — the single source of truth for both
// BubbleShell (real messages) and IntroBubbles (client-only tips), so their look
// can't drift when the palette is retuned.
// TODO(MOB-071): promote these to semantic light/dark theme tokens.
export const BUBBLE_COLORS = {
  sent: { light: '#dcf8c6', dark: '#005c4b' },
  received: { light: '#f5f3f0', dark: '#1f2c34' },
} as const;

export const BUBBLE_SHADOW: ViewStyle = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.06,
  shadowRadius: 2,
  elevation: 1,
};
