import { useTheme } from '@/theme';
import { hexToRgba } from '@/utils/color';
import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

type IoniconName = keyof typeof Ionicons.glyphMap;

/** Severity of the dialog. Drives the accent colour and default icon. */
export type DialogTone = 'error' | 'warning' | 'info' | 'success';

export interface DialogButton {
  label: string;
  onPress: () => void;
  /** primary = filled accent (default); secondary = plain text; destructive = red text. */
  variant?: 'primary' | 'secondary' | 'destructive';
}

interface AppDialogProps {
  visible: boolean;
  /** Severity accent + default icon. Defaults to `info`. */
  tone?: DialogTone;
  /**
   * Icon override. Omit to use the tone's default icon; pass `null` to render no
   * icon (e.g. a plain confirmation dialog where a severity glyph would be odd).
   */
  icon?: IoniconName | null;
  title: string;
  message?: string;
  /**
   * Actions (typically 1–3), rendered as a vertical stack. Defaults to a single
   * primary "OK" that calls `onRequestClose`.
   */
  buttons?: DialogButton[];
  /** Backdrop tap / Android hardware back. */
  onRequestClose: () => void;
}

const TONE_ICON: Record<DialogTone, IoniconName> = {
  error: 'alert-circle',
  warning: 'warning',
  info: 'information-circle',
  success: 'checkmark-circle',
};

/**
 * Reusable, theme-aware confirmation/alert dialog. Controlled: the parent owns
 * `visible`. Tone maps to a semantic theme colour (adapts light/dark), and the
 * icon reinforces meaning so severity isn't conveyed by colour alone (WCAG 1.4.1).
 *
 * House pattern mirrors `NoticeModal` (Modal + backdrop + accent + CTA). For
 * ephemeral alerts/confirmations, RN `Modal` is the recommended tool over a
 * route-based modal (Expo Router's own guidance).
 */
export function AppDialog({
  visible,
  tone = 'info',
  icon,
  title,
  message,
  buttons,
  onRequestClose,
}: AppDialogProps) {
  const { colors } = useTheme();

  const accent =
    tone === 'error'
      ? colors.error
      : tone === 'warning'
        ? colors.warning
        : tone === 'success'
          ? colors.success
          : colors.info;

  // `undefined` → tone default; `null` → no icon.
  const resolvedIcon = icon === null ? null : (icon ?? TONE_ICON[tone]);

  const resolvedButtons: DialogButton[] =
    buttons && buttons.length > 0
      ? buttons
      : [{ label: 'OK', onPress: onRequestClose, variant: 'primary' }];

  // Layout: ≤2 buttons side-by-side, 3+ stacked (matches iOS/Material defaults).
  // Horizontal convention is dismissive-left / affirmative-right; callers pass the
  // affirmative action first, so reverse for the row (a no-op for a single button).
  // TODO: make this fully adaptive later - auto-stack even 2 buttons when their
  // labels are too long to fit on one line (Material measures text and reverses
  // order when it stacks), and expose a `layout?: 'auto' | 'stacked' | 'horizontal'`
  // override for borderline cases. Count-based is enough for today's dialogs.
  const horizontal = resolvedButtons.length <= 2;
  const orderedButtons = horizontal ? [...resolvedButtons].reverse() : resolvedButtons;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onRequestClose}
    >
      <Pressable style={styles.backdrop} onPress={onRequestClose}>
        {/* Stop taps inside the card from dismissing. */}
        <Pressable
          style={[styles.card, { backgroundColor: colors.background }]}
          onPress={(e) => e.stopPropagation()}
          accessibilityViewIsModal
        >
          {resolvedIcon && (
            <View style={[styles.iconCircle, { backgroundColor: hexToRgba(accent, 0.12) }]}>
              <Ionicons name={resolvedIcon} size={28} color={accent} />
            </View>
          )}

          <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
            {title}
          </Text>
          {message && (
            <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
          )}

          <View style={[styles.buttons, horizontal && styles.buttonsRow]}>
            {orderedButtons.map((button, index) => {
              const variant = button.variant ?? 'primary';
              const isPrimary = variant === 'primary';
              return (
                <Pressable
                  key={index}
                  onPress={button.onPress}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.button,
                    horizontal && styles.buttonFlex,
                    isPrimary
                      ? { backgroundColor: accent }
                      : { backgroundColor: 'transparent' },
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.buttonLabel,
                      isPrimary
                        ? styles.buttonLabelPrimary
                        : {
                            color: variant === 'destructive' ? colors.error : colors.textSecondary,
                          },
                    ]}
                  >
                    {button.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 10,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  buttons: {
    alignSelf: 'stretch',
    marginTop: 14,
    gap: 8,
  },
  buttonsRow: {
    flexDirection: 'row',
  },
  button: {
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonFlex: {
    flex: 1,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  buttonLabelPrimary: {
    color: '#ffffff',
  },
});
