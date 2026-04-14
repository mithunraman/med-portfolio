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
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text } from 'react-native';

interface LoadingState {
  visible: boolean;
  message: string;
  dismissible: boolean;
}

interface ShowLoadingOptions {
  /** Allow dismiss by tapping outside immediately. */
  dismissible?: boolean;
  /** Become dismissible after this many seconds. */
  dismissibleAfterSec?: number;
}

interface LoadingContextValue {
  showLoading: (message: string, options?: ShowLoadingOptions) => void;
  hideLoading: () => void;
}

const LoadingContext = createContext<LoadingContextValue | null>(null);

const INITIAL_STATE: LoadingState = { visible: false, message: '', dismissible: false };

export function LoadingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LoadingState>(INITIAL_STATE);
  const { colors } = useTheme();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const showLoading = useCallback(
    (message: string, options?: ShowLoadingOptions) => {
      clearTimer();
      const dismissible = options?.dismissible ?? false;
      setState({ visible: true, message, dismissible });

      if (!dismissible && options?.dismissibleAfterSec) {
        timerRef.current = setTimeout(() => {
          setState((prev) => (prev.visible ? { ...prev, dismissible: true } : prev));
        }, options.dismissibleAfterSec * 1000);
      }
    },
    [clearTimer]
  );

  const hideLoading = useCallback(() => {
    clearTimer();
    setState((prev) => ({ ...prev, visible: false }));
  }, [clearTimer]);

  // Cleanup timer on unmount
  useEffect(() => clearTimer, [clearTimer]);

  const value = useMemo(() => ({ showLoading, hideLoading }), [showLoading, hideLoading]);

  return (
    <LoadingContext.Provider value={value}>
      {children}
      <Modal
        visible={state.visible}
        transparent
        animationType="fade"
        onRequestClose={state.dismissible ? hideLoading : undefined}
      >
        <Pressable style={styles.backdrop} onPress={state.dismissible ? hideLoading : undefined}>
          <Pressable style={[styles.card, { backgroundColor: colors.surface }]} onPress={() => {}}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.message, { color: colors.text }]}>{state.message}</Text>
          </Pressable>
        </Pressable>
      </Modal>
    </LoadingContext.Provider>
  );
}

export function useLoading(): LoadingContextValue {
  const ctx = useContext(LoadingContext);
  if (!ctx) throw new Error('useLoading must be used within a LoadingProvider');
  return ctx;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  message: {
    fontSize: 15,
    textAlign: 'center',
  },
});
