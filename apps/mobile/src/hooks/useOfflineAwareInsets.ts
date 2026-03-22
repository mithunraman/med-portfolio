import { selectIsOffline } from '@/store/slices/networkSlice';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppSelector } from './useAppSelector';

/**
 * Returns safe area insets with `top` adjusted for the offline banner.
 *
 * When the banner is visible it sits in the root layout *above* the Stack and
 * already covers insets.top + 36px. Screens below the Stack should not add
 * insets.top again, so this hook returns top: 0 when the banner is showing.
 * When hidden, returns normal insets.top.
 */
export function useOfflineAwareInsets() {
  const insets = useSafeAreaInsets();
  const isOffline = useAppSelector(selectIsOffline);

  return {
    ...insets,
    top: isOffline ? 0 : insets.top,
  };
}
