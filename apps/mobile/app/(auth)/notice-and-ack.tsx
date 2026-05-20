import { Ionicons } from '@expo/vector-icons';
import type { AcknowledgementId, NoticeDocument } from '@acme/shared';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/api/client';
import { Button, ErrorBanner } from '@/components';
import { NoticeBlocks } from '@/components/notice-blocks';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { acknowledgementSatisfied, selectAcknowledgement } from '@/store';
import { useTheme } from '@/theme';
import { logger } from '@/utils/logger';

const screenLogger = logger.createScope('NoticeAndAck');

export default function NoticeAndAckScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const dispatch = useAppDispatch();
  const acknowledgement = useAppSelector(selectAcknowledgement);

  // Snapshot the document on mount so the form is insulated from later /init
  // refreshes — if a new notice version lands mid-form, the user finishes against
  // the version they started on, and the in-flight POST captures the right
  // version. Route effect (on selectNeedsAcknowledgement) drives navigation.
  const [document] = useState<NoticeDocument | null>(() =>
    acknowledgement && acknowledgement.needs ? acknowledgement.document : null
  );

  const [ackState, setAckState] = useState<Partial<Record<AcknowledgementId, boolean>>>(() => {
    if (!document) return {};
    return Object.fromEntries(
      document.acknowledgements.map((a) => [a.id, false])
    ) as Partial<Record<AcknowledgementId, boolean>>;
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allRequiredTicked = useMemo(() => {
    if (!document) return false;
    return document.acknowledgements.every((a) => !a.required || ackState[a.id] === true);
  }, [document, ackState]);

  if (!document) {
    // Route effect will redirect; render nothing in the meantime.
    return null;
  }

  const toggle = (id: AcknowledgementId) => {
    setAckState((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSubmit = async () => {
    if (!allRequiredTicked || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.acknowledgements.createAcknowledgement({
        noticeVersion: document.version,
        acknowledgements: document.acknowledgements.map((a) => ({
          id: a.id,
          given: ackState[a.id] === true,
        })),
      });
      // POST succeeded → ack is recorded server-side. Flip local state and let
      // the route effect navigate. Avoids re-running /init's other 4 sub-queries
      // (dashboard, quota, updatePolicy, notices) at a latency-critical moment.
      // Intentionally leave `submitting=true` — the screen unmounts on the next
      // render; keeping the button in its loading state avoids a flicker
      // (loading → enabled → gone) during the navigation transition.
      dispatch(acknowledgementSatisfied());
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to record acknowledgement';
      screenLogger.error('POST /acknowledgements failed', { error: message });
      setError(message);
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 16 }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.text }]}>{document.title}</Text>
        {document.subtitle ? (
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{document.subtitle}</Text>
        ) : null}

        <NoticeBlocks blocks={document.body} />

        <View style={styles.checkboxes}>
          {document.acknowledgements.map((a) => {
            const checked = ackState[a.id] === true;
            return (
              <Pressable
                key={a.id}
                onPress={() => toggle(a.id)}
                style={({ pressed }) => [
                  styles.checkboxRow,
                  { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                accessibilityLabel={a.label}
              >
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: checked ? colors.primary : colors.border,
                      backgroundColor: checked ? colors.primary : 'transparent',
                    },
                  ]}
                >
                  {checked ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
                </View>
                <Text style={[styles.checkboxLabel, { color: colors.text }]}>{a.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {error ? (
          <ErrorBanner
            message={error}
            onRetry={handleSubmit}
            style={styles.errorBannerOverride}
          />
        ) : null}

        <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>
          {document.ctaDisclaimer}
        </Text>
      </ScrollView>

      <View style={[styles.ctaContainer, { paddingBottom: insets.bottom + 16 }]}>
        <Button
          label={document.ctaLabel}
          onPress={handleSubmit}
          disabled={!allRequiredTicked}
          loading={submitting}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 22,
  },
  checkboxes: {
    gap: 12,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
  // ErrorBanner bakes in `marginHorizontal: 24` and `marginBottom: 16` for use
  // at the screen edge. Inside this ScrollView (already `paddingHorizontal: 24`
  // + `gap: 16`), those margins double up — override them to zero here.
  errorBannerOverride: {
    marginHorizontal: 0,
    marginBottom: 0,
  },
  disclaimer: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  ctaContainer: {
    paddingHorizontal: 24,
    paddingTop: 12,
  },
});
