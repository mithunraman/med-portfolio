import { useCanCreateArtefact } from '@/hooks';
import { useTheme } from '@/theme';
import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../Button';

interface RecordOwnCaseButtonProps {
  /** Entry type of the sample — the new conversation starts as the same type. */
  entryType: string;
}

/**
 * Pinned footer on the sample screens: starts a real entry of the sample's type.
 * The sample screens are dismissed first, so Back from the new conversation lands
 * on Home rather than returning into the sample. Guarded like Home's CTA — a guest
 * at the entry limit is routed to claim-account instead.
 */
export function RecordOwnCaseButton({ entryType }: RecordOwnCaseButtonProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { guard } = useCanCreateArtefact();

  const handlePress = useCallback(() => {
    if (!guard()) return;
    router.dismissTo('/(tabs)');
    router.push(`/(messages)/${randomUUID()}?isNew=true&entryType=${entryType}`);
  }, [guard, router, entryType]);

  return (
    <View
      style={[
        styles.footer,
        {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          paddingBottom: insets.bottom + 12,
        },
      ]}
    >
      <Button label="Record your own case" onPress={handlePress} />
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
