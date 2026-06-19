import { useTheme } from '@/theme';
import { Feather } from '@expo/vector-icons';
import { MAX_MESSAGE_CONTENT_LENGTH } from '@acme/shared';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface MessageEditorModalProps {
  visible: boolean;
  /** Current message text to pre-fill the editor with. */
  initialText: string;
  /**
   * Persist the edit. Must reject on failure — the modal stays open (preserving
   * the user's draft) and closes only when this resolves.
   */
  onSave: (text: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Full-screen editor for a single chat message. Content-only — unlike the
 * artefact section editor, a message has no title. Save is disabled when the
 * text is empty or unchanged.
 */
export function MessageEditorModal({
  visible,
  initialText,
  onSave,
  onClose,
}: MessageEditorModalProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState(initialText);
  const [saving, setSaving] = useState(false);

  // Sync local state when the modal opens with a new message
  useEffect(() => {
    if (visible) setText(initialText);
  }, [visible, initialText]);

  const trimmed = text.trim();
  const canSave = trimmed.length > 0 && trimmed !== initialText.trim();
  const doneEnabled = canSave && !saving;
  // maxLength hard-caps input, so surface a counter as the user nears the limit
  // — otherwise a pasted overflow would be silently truncated with no feedback.
  const showCounter = text.length > MAX_MESSAGE_CONTENT_LENGTH * 0.9;

  const handleDone = useCallback(async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await onSave(trimmed);
      onClose(); // close only after a successful save
    } catch {
      // Save failed — keep the modal open so the user's draft is preserved.
    } finally {
      setSaving(false);
    }
  }, [canSave, saving, trimmed, onSave, onClose]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={[styles.header, { borderBottomColor: colors.border, paddingTop: insets.top + 8 }]}
        >
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Edit Message</Text>
          <Pressable
            onPress={handleDone}
            style={styles.doneButton}
            hitSlop={8}
            disabled={!doneEnabled}
            accessibilityLabel="Save message"
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Feather
                name="check"
                size={20}
                color={doneEnabled ? colors.primary : colors.textSecondary}
              />
            )}
            <Text style={[styles.doneText, { color: doneEnabled ? colors.primary : colors.textSecondary }]}>
              {saving ? 'Saving…' : 'Done'}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          keyboardShouldPersistTaps="handled"
        >
          <TextInput
            style={[
              styles.textInput,
              { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            value={text}
            onChangeText={setText}
            multiline
            autoFocus
            maxLength={MAX_MESSAGE_CONTENT_LENGTH}
            textAlignVertical="top"
            placeholder="Message"
            placeholderTextColor={colors.textSecondary}
          />
          {showCounter && (
            <Text style={[styles.counter, { color: colors.textSecondary }]}>
              {text.length}/{MAX_MESSAGE_CONTENT_LENGTH}
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  cancelText: {
    fontSize: 16,
  },
  doneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  doneText: {
    fontSize: 16,
    fontWeight: '600',
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  textInput: {
    fontSize: 15,
    lineHeight: 22,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 200,
  },
  counter: {
    fontSize: 12,
    textAlign: 'right',
    marginTop: 6,
  },
});
