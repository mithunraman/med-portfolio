import { useTheme } from '@/theme';
import { Switch, type SwitchProps } from 'react-native';

/**
 * Themed wrapper around RN's `Switch` that guarantees a visible off-state.
 *
 * The default `Switch` off-track is nearly invisible in light mode when driven
 * by the `border` token (light gray on a white surface). This bakes in the
 * `switchTrackOff` token plus `ios_backgroundColor` (which iOS renders behind
 * the track) and an explicit white thumb, so the control reads clearly in both
 * themes. Track/thumb colors are owned here - callers only supply behavior.
 */
type AppSwitchProps = Omit<SwitchProps, 'trackColor' | 'thumbColor' | 'ios_backgroundColor'>;

export function AppSwitch(props: AppSwitchProps) {
  const { colors } = useTheme();

  return (
    <Switch
      trackColor={{ false: colors.switchTrackOff, true: colors.primary }}
      thumbColor="#ffffff"
      ios_backgroundColor={colors.switchTrackOff}
      {...props}
    />
  );
}
