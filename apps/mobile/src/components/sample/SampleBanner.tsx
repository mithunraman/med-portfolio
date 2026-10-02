import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface SampleBannerProps {
  /** Optional link under the body, e.g. to the conversation behind the entry. */
  action?: { label: string; onPress: () => void };
}

/**
 * Persistent label on every sample screen, so the worked example can never be
 * mistaken for the trainee's own data. Same card language as the artefact
 * advisory banner (info tone), so it reads as guidance rather than an alert.
 */
export function SampleBanner({ action }: SampleBannerProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: colors.infoBackground, borderColor: colors.infoBorder },
      ]}
    >
      <Ionicons name="eye-outline" size={18} color={colors.info} style={styles.icon} />
      <View style={styles.textContainer}>
        <Text style={[styles.title, { color: colors.info }]}>Sample case</Text>
        <Text style={[styles.body, { color: colors.text }]}>
          A fictional patient, showing what an entry made with Logdit looks like.
        </Text>
        {action && (
          <Pressable
            onPress={action.onPress}
            hitSlop={8}
            accessibilityRole="link"
            style={styles.action}
          >
            <Text style={[styles.actionText, { color: colors.primary }]}>{action.label}</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.primary} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  icon: {
    marginTop: 1,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 8,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
