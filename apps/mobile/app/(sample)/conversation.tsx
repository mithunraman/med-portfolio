import { MessageList } from '@/components';
import { RecordOwnCaseButton, SampleBanner, SampleCaseGate } from '@/components/sample';
import { useTheme } from '@/theme';
import { toSampleMessages } from '@/utils/sampleMessages';
import type { Message, SampleCaseResponse } from '@acme/shared';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useMemo } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

/**
 * The conversation behind the sample entry, rendered with the same `MessageList`
 * as the real read-only conversation view (`(entry)/conversation/[conversationId]`).
 * Like that view it wires only Copy — with no artefact status, edit and delete are
 * never offered, and with no active question nothing is answerable.
 */
export default function SampleConversationScreen() {
  return <SampleCaseGate>{(sample) => <SampleConversation sample={sample} />}</SampleCaseGate>;
}

function SampleConversation({ sample }: { sample: SampleCaseResponse }) {
  const { colors } = useTheme();
  const messages = useMemo(() => toSampleMessages(sample.conversation), [sample.conversation]);

  const handleCopy = useCallback((message: Message) => {
    if (!message.content) return;
    Clipboard.setStringAsync(message.content);
    Alert.alert('Copied', 'Message copied to clipboard.');
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SampleBanner />
      <View style={styles.list}>
        <MessageList messages={messages} currentUserId="" onCopy={handleCopy} />
      </View>
      <RecordOwnCaseButton entryType={sample.entryType} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
});
