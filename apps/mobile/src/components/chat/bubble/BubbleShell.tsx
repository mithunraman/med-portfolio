import { MessageProcessingStatus, MessageRole, PROCESSING_STATUS_LABELS, type Message } from '@acme/shared';
import { Ionicons } from '@expo/vector-icons';
import { memo, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../../theme';

// WhatsApp exact bubble colors
const BUBBLE_COLORS = {
  sent: { light: '#dcf8c6', dark: '#005c4b' },
  received: { light: '#ffffff', dark: '#1f2c34' },
} as const;

const TERMINAL = new Set([MessageProcessingStatus.COMPLETE, MessageProcessingStatus.FAILED]);

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
  children: React.ReactNode;
}

export const BubbleShell = memo(function BubbleShell({
  message,
  isLastInGroup,
  isFirstInGroup,
  children,
}: Props) {
  const { isDark } = useTheme();

  const isUser = message.role === MessageRole.USER;
  const mode = isDark ? 'dark' : 'light';
  const bubbleColor = isUser ? BUBBLE_COLORS.sent[mode] : BUBBLE_COLORS.received[mode];

  const isProcessing = !TERMINAL.has(message.processingStatus);
  const statusLabel = isProcessing ? PROCESSING_STATUS_LABELS[message.processingStatus] : null;

  const metaColor = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)';

  // Status tick for user messages
  const tick = (() => {
    if (!isUser) return null;
    if (message.processingStatus === MessageProcessingStatus.FAILED) {
      return <Ionicons name="close" size={12} color="#ef4444" />;
    }
    if (TERMINAL.has(message.processingStatus)) {
      return <Ionicons name="checkmark-done" size={12} color="#53bdeb" />;
    }
    return <Ionicons name="checkmark" size={12} color="#8696a0" />;
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
        {statusLabel ? <ProcessingLabel label={statusLabel} color={metaColor} /> : null}
        <View style={styles.footerRight}>
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
    // shadow for received bubbles (light mode)
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
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
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginLeft: 'auto',
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
