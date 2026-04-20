import { useAppSelector } from '@/hooks';
import { useNoticeDismiss } from '@/hooks/useNoticeDismiss';
import { selectBannerNotice } from '@/store';
import { SEVERITY_COLORS } from '@/constants/notices';
import { useTheme } from '@/theme';
import type { AppNotice } from '@acme/shared';
import { NoticeSeverity } from '@acme/shared';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export function NoticeBanner() {
  const notice = useAppSelector(selectBannerNotice);

  if (!notice) return null;

  return <NoticeBannerContent key={notice.id} notice={notice} />;
}

function NoticeBannerContent({ notice }: { notice: AppNotice }) {
  const { colors } = useTheme();
  const { dismiss } = useNoticeDismiss(notice.id);

  const accentColor = SEVERITY_COLORS[notice.severity] ?? SEVERITY_COLORS[NoticeSeverity.INFO];

  // Non-dismissible notices can only be removed by acting on them
  const dismissOnAction = !notice.dismissible;

  const handleAction = () => {
    if (notice.actionUrl) {
      Linking.openURL(notice.actionUrl);
    }
    if (dismissOnAction) {
      dismiss();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: accentColor + '18', borderLeftColor: accentColor }]}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {notice.title}
        </Text>
        {notice.body && (
          <Text style={[styles.body, { color: colors.textSecondary }]} numberOfLines={2}>
            {notice.body}
          </Text>
        )}
        {notice.actionLabel && (
          <TouchableOpacity onPress={handleAction} activeOpacity={0.7}>
            <Text style={[styles.action, { color: accentColor }]}>{notice.actionLabel}</Text>
          </TouchableOpacity>
        )}
      </View>
      {notice.dismissible && (
        <TouchableOpacity
          onPress={dismiss}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Dismiss notice"
        >
          <Ionicons name="close" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: 20,
    marginBottom: 8,
    padding: 12,
    borderRadius: 10,
    borderLeftWidth: 4,
    gap: 8,
  },
  content: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
  },
  action: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
});
