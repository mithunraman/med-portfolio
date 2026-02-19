import { logger } from '@/utils/logger';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInput as TextInputType,
  type ViewStyle,
} from 'react-native';
import type { AudioRecordingResult } from '../hooks/useAudioRecorder';
import { useTheme } from '../theme';
import { IconButton } from './IconButton';
import { VoiceNoteRecorderBar } from './VoiceNoteRecorderBar';

const _logger = logger.createScope('ChatComposer');

// ============================================================================
// CONSTANTS
// ============================================================================

// Fixed accent color (consistent across themes)
const ACCENT_COLOR = '#00a884';

const SPACING = {
  toolbarPadding: 8,
  iconButtonSize: 44,
  iconSize: 24,
  inputHeight: 44,
  inputBorderRadius: 22,
  inputPaddingHorizontal: 12,
  gap: 6,
} as const;

// ============================================================================
// TYPES
// ============================================================================

interface ChatComposerProps {
  onSend: (text: string) => void;
  onOpenAttachments?: () => void;
  onOpenCamera?: () => void;
  onToggleStickers?: () => void;
  /** Called when a voice note is sent with the recording result */
  onSendVoiceNote?: (result: AudioRecordingResult) => void;
  isSending?: boolean;
  /** Bottom safe area inset for voice recorder */
  safeAreaBottomInset?: number;
  style?: StyleProp<ViewStyle>;
}

// ============================================================================
// CHAT COMPOSER COMPONENT
// ============================================================================

export function ChatComposer({
  onSend,
  onOpenAttachments,
  onOpenCamera,
  onToggleStickers,
  onSendVoiceNote,
  isSending = false,
  safeAreaBottomInset = 0,
  style,
}: ChatComposerProps) {
  const { colors, isDark } = useTheme();
  const [text, setText] = useState('');
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<TextInputType>(null);

  const handleSend = useCallback(() => {
    const trimmedText = text.trim();
    if (trimmedText && !isSending) {
      onSend(trimmedText);
      setText('');
    }
  }, [text, isSending, onSend]);

  // Voice recorder handlers
  const handleMicPress = useCallback(() => {
    setShowVoiceRecorder(true);
  }, []);

  const handleVoiceRecorderDiscard = useCallback(() => {
    setShowVoiceRecorder(false);
  }, []);

  const handleVoiceRecorderSend = useCallback(
    (result: AudioRecordingResult) => {
      setShowVoiceRecorder(false);
      _logger.info('Voice recorder send', result);
      onSendVoiceNote?.(result);
    },
    [onSendVoiceNote]
  );

  const handleFocus = useCallback(() => {
    setIsFocused(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
  }, []);

  const hasText = useMemo(() => text.trim().length > 0, [text]);

  // Memoized icons with theme colors
  const attachIcon = useMemo(
    () => <Feather name="plus" size={SPACING.iconSize} color={colors.textSecondary} />,
    [colors.textSecondary]
  );
  const stickerIcon = useMemo(
    () => (
      <MaterialCommunityIcons
        name="sticker-emoji"
        size={SPACING.iconSize}
        color={colors.textSecondary}
      />
    ),
    [colors.textSecondary]
  );
  const cameraIcon = useMemo(
    () => <Feather name="camera" size={SPACING.iconSize} color={colors.textSecondary} />,
    [colors.textSecondary]
  );
  const sendButtonIcon = useMemo(
    () =>
      isSending ? (
        <ActivityIndicator size="small" color="#ffffff" />
      ) : (
        <Feather name="send" size={20} color="#ffffff" />
      ),
    [isSending]
  );
  const micIcon = useMemo(
    () => <Feather name="mic" size={SPACING.iconSize} color={colors.textSecondary} />,
    [colors.textSecondary]
  );

  // Dynamic styles based on theme
  const containerStyle = useMemo(
    () => [
      styles.container,
      {
        backgroundColor: isDark ? colors.surface : colors.background,
        borderTopColor: colors.border,
      },
      style,
    ],
    [isDark, colors.surface, colors.background, colors.border, style]
  );

  const inputContainerStyle = useMemo(
    () => [
      styles.inputContainer,
      {
        backgroundColor: isDark ? colors.background : colors.surface,
      },
      isFocused && { borderWidth: 1, borderColor: colors.primary },
    ],
    [isDark, colors.background, colors.surface, colors.primary, isFocused]
  );

  const attachButtonStyle = useMemo(
    () => [styles.attachButton, { backgroundColor: isDark ? colors.background : colors.surface }],
    [isDark, colors.background, colors.surface]
  );

  const textInputStyle = useMemo(() => [styles.textInput, { color: colors.text }], [colors.text]);

  // If voice recorder is visible, show it instead of the regular toolbar
  if (showVoiceRecorder) {
    return (
      <VoiceNoteRecorderBar
        visible={showVoiceRecorder}
        safeAreaBottomInset={safeAreaBottomInset}
        onDiscard={handleVoiceRecorderDiscard}
        onSend={handleVoiceRecorderSend}
        testIDPrefix="voice-recorder"
      />
    );
  }

  return (
    <View style={containerStyle}>
      <View style={styles.toolbar}>
        {/* Attachment button */}
        <IconButton
          icon={attachIcon}
          onPress={onOpenAttachments}
          accessibilityLabel="Open attachments"
          style={attachButtonStyle}
        />

        {/* Input pill */}
        <View style={inputContainerStyle}>
          <TextInput
            ref={inputRef}
            style={textInputStyle}
            value={text}
            onChangeText={setText}
            placeholder="Message"
            placeholderTextColor={colors.textSecondary}
            onFocus={handleFocus}
            onBlur={handleBlur}
            multiline={true}
            numberOfLines={5}
            textAlignVertical="center"
            accessibilityLabel="Message input"
            accessibilityHint="Type your message here"
          />

          {/* Sticker/emoji button inside input */}
          <IconButton
            icon={stickerIcon}
            onPress={onToggleStickers}
            accessibilityLabel="Open stickers and emoji"
            style={styles.stickerButton}
          />
        </View>

        {/* Camera or Send button */}
        {hasText ? (
          <IconButton
            icon={sendButtonIcon}
            onPress={handleSend}
            accessibilityLabel="Send message"
            style={styles.sendButton}
            disabled={isSending}
          />
        ) : (
          <>
            <IconButton icon={cameraIcon} onPress={onOpenCamera} accessibilityLabel="Open camera" />

            {/* Microphone button */}
            <IconButton
              icon={micIcon}
              onPress={handleMicPress}
              accessibilityLabel="Record voice message"
            />
          </>
        )}
      </View>
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: SPACING.toolbarPadding,
    paddingVertical: SPACING.toolbarPadding,
    gap: SPACING.gap,
  },
  attachButton: {
    borderRadius: SPACING.iconButtonSize / 2,
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: SPACING.inputBorderRadius,
    minHeight: SPACING.inputHeight,
    paddingLeft: SPACING.inputPaddingHorizontal,
    paddingRight: 4,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 10,
    maxHeight: 120,
  },
  stickerButton: {
    width: 36,
    height: 36,
  },
  sendButton: {
    backgroundColor: ACCENT_COLOR,
  },
});

export default ChatComposer;
