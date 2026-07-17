import { useTheme } from '@/theme';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ToastContextValue {
  /** Show a transient, non-blocking confirmation. Replaces any visible toast. */
  showToast: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VISIBLE_MS = 2200;
const ANIM_MS = 200;

/**
 * Minimal app-wide toast: one message at a time, auto-dismissing, non-blocking.
 *
 * Deliberately tiny — no variants, no queue, no action buttons. It exists to
 * confirm success ("Saved", "Marked as done") without the interruption of a
 * modal `Alert`. Mounted once at the root, above the navigator so it overlays
 * every screen; `pointerEvents="none"` keeps it from swallowing taps.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState<string | null>(null);
  // Lazy init so the Animated.Value is constructed once, not rebuilt-and-discarded
  // on every render (the setter is never called — these are stable drivers).
  const [opacity] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(12));
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const showToast = useCallback(
    (nextMessage: string) => {
      clearTimer();
      setMessage(nextMessage);
      // Announce imperatively on both platforms: `accessibilityLiveRegion` is
      // Android-only (no-op on iOS VoiceOver) and unreliable here anyway since
      // the toast view mounts fresh each time rather than updating in place.
      // A no-op when no screen reader is active, so it's safe to always call.
      AccessibilityInfo.announceForAccessibility(nextMessage);
      opacity.setValue(0);
      translateY.setValue(12);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: ANIM_MS, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: ANIM_MS, useNativeDriver: true }),
      ]).start();

      hideTimer.current = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: ANIM_MS, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 12, duration: ANIM_MS, useNativeDriver: true }),
        ]).start(({ finished }) => {
          if (finished) setMessage(null);
        });
      }, VISIBLE_MS);
    },
    [clearTimer, opacity, translateY]
  );

  useEffect(() => clearTimer, [clearTimer]);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {message !== null && (
        <View
          pointerEvents="none"
          style={[styles.container, { bottom: insets.bottom + 24 }]}
        >
          <Animated.View
            style={[
              styles.toast,
              { backgroundColor: colors.text, opacity, transform: [{ translateY }] },
            ]}
          >
            <Text style={[styles.label, { color: colors.background }]} numberOfLines={2}>
              {message}
            </Text>
          </Animated.View>
        </View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  toast: {
    maxWidth: 420,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
