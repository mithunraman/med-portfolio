import { memo, useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../../theme';

interface SelectionCardShellProps {
  heading: string;
  hasSelection: boolean;
  isAnswered: boolean;
  isActive: boolean;
  confirmLabel: string;
  onConfirm: () => void;
  children: ReactNode;
}

export const SelectionCardShell = memo(function SelectionCardShell({
  heading,
  hasSelection,
  isAnswered,
  isActive,
  confirmLabel,
  onConfirm,
  children,
}: SelectionCardShellProps) {
  const { colors } = useTheme();

  const confirmStyle = useMemo(
    () => [
      styles.confirmButton,
      { backgroundColor: hasSelection ? colors.accent : colors.border },
    ],
    [hasSelection, colors.accent, colors.border]
  );

  return (
    <View style={styles.container}>
      <Text style={[styles.heading, { color: colors.textSecondary }]}>{heading}</Text>
      {children}
      {!isAnswered && isActive && (
        <Pressable
          onPress={onConfirm}
          disabled={!hasSelection}
          style={confirmStyle}
          accessibilityLabel="Confirm selection"
        >
          <Text
            style={[
              styles.confirmText,
              { color: hasSelection ? '#ffffff' : colors.textSecondary },
            ]}
          >
            {confirmLabel}
          </Text>
        </Pressable>
      )}
    </View>
  );
});

export const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    gap: 6,
  },
  heading: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  confirmButton: {
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  confirmText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
