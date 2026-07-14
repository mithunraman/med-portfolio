import {
  MessageStatus,
  MessageRole,
  MESSAGE_STATUS_LABELS,
  isTerminalMessageStatus,
  type Message,
} from '@acme/shared';
import type { DeliveryStatus } from '../../../store/slices/messages/slice';
import { Ionicons } from '@expo/vector-icons';
import { memo, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../../theme';
import { BUBBLE_COLORS, BUBBLE_SHADOW } from './bubbleTokens';

function ProcessingLabel({ label, color }: { label: string; color: string }) {
  const [dots, setDots] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setDots(d => (d + 1) % 6), 500);
    return () => clearInterval(id);
  }, []);

  return (
    <Text style={[styles.processingLabel, { color }]}>
      {label}{'·'.repeat(dots)}
    </Text>
  );
}

function formatTimestamp(dateStr: string): string {
  const d = new Date(dateStr);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m} ${ampm}`;
}

interface Props {
  message: Message;
  isLastInGroup: boolean;
  isFirstInGroup: boolean;
  deliveryStatus?: DeliveryStatus;
  children: React.ReactNode;
}

export const BubbleShell = memo(function BubbleShell({
  message,
  isLastInGroup,
  isFirstInGroup,
  deliveryStatus,
  children,
}: Props) {
  const { isDark } = useTheme();

  const isUser = message.role === MessageRole.USER;
  const mode = isDark ? 'dark' : 'light';
  const bubbleColor = isUser ? BUBBLE_COLORS.sent[mode] : BUBBLE_COLORS.received[mode];

  const isProcessing = !isTerminalMessageStatus(message.status);
  const statusLabel = isProcessing ? MESSAGE_STATUS_LABELS[message.status] : null;
  // Terminal "not added" caption for a message flagged as prompt injection. Shown
  // statically (no animated dots) beneath the trainee's own words.
  const rejectedLabel =
    message.status === MessageStatus.REJECTED
      ? MESSAGE_STATUS_LABELS[MessageStatus.REJECTED]
      : null;

  const metaColor = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)';

  // Status tick for user messages — delivery status takes precedence over processing status
  const tick = (() => {
    if (!isUser) return null;

    // Optimistic message: clock icon while sending, error icon if failed
    if (deliveryStatus === 'sending') {
      return <Ionicons name="time-outline" size={12} color="#8696a0" />;
    }
    if (deliveryStatus === 'failed') {
      return <Ionicons name="alert-circle" size={12} color="#ef4444" />;
    }

    // Server message — existing logic
    if (message.status === MessageStatus.FAILED) {
      return <Ionicons name="close" size={12} color="#ef4444" />;
    }
    if (message.status === MessageStatus.REJECTED) {
      // Not delivered to the entry — a neutral marker, not the delivered double-tick.
      return <Ionicons name="information-circle-outline" size={12} color="#8696a0" />;
    }
    // Fully AI-processed — blue double tick (like "read").
    if (isTerminalMessageStatus(message.status)) {
      return <Ionicons name="checkmark-done" size={12} color="#53bdeb" />;
    }
    // On the server but still processing (PENDING…DEIDENTIFYING) — grey double
    // tick ("delivered"). A single tick here reads as "not delivered" (MOB-035).
    return <Ionicons name="checkmark-done" size={12} color="#8696a0" />;
  })();

  const bubbleRadius = {
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomLeftRadius: isUser ? 12 : isLastInGroup ? 4 : 12,
    borderBottomRightRadius: isUser ? (isLastInGroup ? 4 : 12) : 12,
  };

  return (
    <View style={[styles.bubble, { backgroundColor: bubbleColor }, bubbleRadius]}>
      {children}

      {/* Timestamp + ticks row */}
      <View style={styles.footer}>
        {deliveryStatus === 'failed' ? (
          <Text style={styles.failedLabel}>Failed to send · Tap to retry</Text>
        ) : rejectedLabel ? (
          <Text style={[styles.rejectedLabel, { color: metaColor }]}>{rejectedLabel}</Text>
        ) : statusLabel ? (
          <ProcessingLabel label={statusLabel} color={metaColor} />
        ) : null}
        <View style={styles.footerRight}>
          {message.editedAt ? (
            <Text style={[styles.editedLabel, { color: metaColor }]}>Edited</Text>
          ) : null}
          <Text style={[styles.timestamp, { color: metaColor }]}>{formatTimestamp(message.createdAt)}</Text>
          {tick}
        </View>
      </View>

      {/* Tail — only on last message in group */}
      {isLastInGroup &&
        (isUser ? (
          <View style={[styles.tailBase, styles.tailRight, { borderTopColor: bubbleColor }]} />
        ) : (
          <View style={[styles.tailBase, styles.tailLeft, { borderTopColor: bubbleColor }]} />
        ))}
    </View>
  );
});

const styles = StyleSheet.create({
  bubble: {
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 4,
    ...BUBBLE_SHADOW,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
    marginTop: 2,
  },
  processingLabel: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  failedLabel: {
    fontSize: 12,
    color: '#ef4444',
    fontStyle: 'italic',
  },
  rejectedLabel: {
    fontSize: 12,
    fontStyle: 'italic',
    flexShrink: 1,
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
  },
  editedLabel: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  timestamp: {
    fontSize: 13,
  },
  // CSS triangle tail
  tailBase: {
    position: 'absolute',
    bottom: 0,
    width: 0,
    height: 0,
  },
  tailRight: {
    right: -8,
    borderTopWidth: 10,
    borderLeftWidth: 8,
    borderLeftColor: 'transparent',
  },
  tailLeft: {
    left: -8,
    borderTopWidth: 10,
    borderRightWidth: 8,
    borderRightColor: 'transparent',
  },
});
