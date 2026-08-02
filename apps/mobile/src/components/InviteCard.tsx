import { Button } from '@/components/Button';
import { useToast } from '@/components/Toast';
import { useTheme } from '@/theme';
import { shareInvite, type ShareChannel } from '@/utils/shareInvite';
import { Ionicons } from '@expo/vector-icons';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

/**
 * WhatsApp brand green. Hardcoded rather than themed on purpose - it is a brand
 * mark, not a semantic colour, and it has to read the same across all seven
 * themes in light and dark.
 */
const WHATSAPP_GREEN = '#25D366';

/**
 * Profile card offering a one-tap share of the app with a colleague.
 *
 * Deliberately has no success state: neither share path can tell us whether the
 * message was actually sent, so confirming one would be a claim we haven't
 * observed. Only a genuine failure to open anything is surfaced.
 */
export function InviteCard() {
  const { colors } = useTheme();
  const { showToast } = useToast();

  const handleShare = useCallback(
    async (channel: ShareChannel) => {
      const opened = await shareInvite(channel);
      if (!opened) showToast('Could not open sharing');
    },
    [showToast]
  );

  return (
    <View style={styles.wrapper}>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Ionicons name="people-outline" size={24} color={colors.primary} />
        <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
          Know someone who'd find this useful?
        </Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Share LOGDit with a friend or colleague.
        </Text>
        <Button
          label="Share via WhatsApp"
          color={WHATSAPP_GREEN}
          icon={(color) => <Ionicons name="logo-whatsapp" size={18} color={color} />}
          onPress={() => handleShare('whatsapp')}
          accessibilityLabel="Share LOGDit on WhatsApp"
          style={styles.primaryButton}
        />
        <Button
          label="More options"
          variant="ghost"
          color={colors.textSecondary}
          onPress={() => handleShare('system')}
          accessibilityLabel="Share LOGDit using other apps"
          style={styles.secondaryButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  card: {
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  primaryButton: {
    alignSelf: 'stretch',
    marginTop: 8,
  },
  secondaryButton: {
    alignSelf: 'stretch',
    paddingVertical: 8,
  },
});
