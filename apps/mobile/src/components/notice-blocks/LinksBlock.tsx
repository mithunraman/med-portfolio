import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme';
import { openInAppBrowser } from '@/utils/external-link';
import { logger } from '@/utils/logger';

const linksLogger = logger.createScope('LinksBlock');

interface LinkItem {
  label: string;
  url: string;
}

interface Props {
  items: LinkItem[];
}

export function LinksBlock({ items }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      {items.map((item, i) => (
        <Pressable
          key={i}
          style={({ pressed }) => [
            styles.row,
            { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
          ]}
          onPress={() => {
            // Pressable.onPress is sync — catch the rejection so the failure
            // (e.g. tapping a second link while the first browser session is
            // still active) doesn't surface as an unhandled-promise warning.
            openInAppBrowser(item.url).catch((error) => {
              linksLogger.warn('Failed to open in-app browser', { url: item.url, error });
            });
          }}
          accessibilityRole="link"
          accessibilityLabel={item.label}
        >
          <Text style={[styles.label, { color: colors.primary }]}>{item.label}</Text>
          <Ionicons name="open-outline" size={18} color={colors.primary} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
  },
});
