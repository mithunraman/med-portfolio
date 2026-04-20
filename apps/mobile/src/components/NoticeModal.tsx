import { useAppSelector } from '@/hooks';
import { useNoticeDismiss } from '@/hooks/useNoticeDismiss';
import { selectModalNotice } from '@/store';
import { SEVERITY_COLORS } from '@/constants/notices';
import { useTheme } from '@/theme';
import type { AppNotice } from '@acme/shared';
import { NoticeSeverity } from '@acme/shared';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export function NoticeModal() {
  const notice = useAppSelector(selectModalNotice);

  if (!notice) return null;

  return <NoticeModalContent key={notice.id} notice={notice} />;
}

function NoticeModalContent({ notice }: { notice: AppNotice }) {
  const { colors } = useTheme();
  const { dismiss } = useNoticeDismiss(notice.id);

  const accentColor = SEVERITY_COLORS[notice.severity] ?? SEVERITY_COLORS[NoticeSeverity.INFO];

  const handleCta = () => {
    if (notice.actionUrl) {
      Linking.openURL(notice.actionUrl);
    }
    dismiss();
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.background }]}>
          {notice.dismissible && (
            <TouchableOpacity
              style={styles.closeButton}
              onPress={dismiss}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Dismiss notice"
            >
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
          <View style={[styles.severityBar, { backgroundColor: accentColor }]} />
          <View style={styles.content}>
            <Text style={[styles.title, { color: colors.text }]}>{notice.title}</Text>
            {notice.body && (
              <Text style={[styles.body, { color: colors.textSecondary }]}>{notice.body}</Text>
            )}
          </View>
          <TouchableOpacity
            style={[styles.ctaButton, { backgroundColor: accentColor }]}
            onPress={handleCta}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            <Text style={styles.ctaText}>{notice.actionLabel || 'Got it'}</Text>
          </TouchableOpacity>
        </View>
      </View>
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
    borderRadius: 16,
    overflow: 'hidden',
  },
  severityBar: {
    height: 4,
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 1,
  },
  content: {
    padding: 24,
    paddingTop: 20,
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
    paddingRight: 24,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
  ctaButton: {
    marginHorizontal: 24,
    marginBottom: 24,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  ctaText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
