import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type TextInput as TextInputType,
  type ViewStyle,
} from 'react-native';

// ============================================================================
// CONSTANTS
// ============================================================================

const COLORS = {
  background: '#0b141a',
  inputBackground: '#1f2c34',
  iconDefault: '#8696a0',
  iconActive: '#ffffff',
  accent: '#00a884',
  border: '#222d34',
  placeholder: '#8696a0',
  text: '#ffffff',
  recording: '#ef4444',
} as const;

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
  onStartRecording?: () => void;
  onStopRecording?: () => void;
  isSending?: boolean;
  style?: StyleProp<ViewStyle>;
}

interface IconButtonProps {
  icon: React.ReactNode;
  onPress?: () => void;
  onPressIn?: (e: GestureResponderEvent) => void;
  onPressOut?: (e: GestureResponderEvent) => void;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  isActive?: boolean;
  disabled?: boolean;
}

// ============================================================================
// ICON BUTTON COMPONENT
// ============================================================================

function IconButton({
  icon,
  onPress,
  onPressIn,
  onPressOut,
  accessibilityLabel,
  style,
  isActive = false,
  disabled = false,
}: IconButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(
    (e: GestureResponderEvent) => {
      Animated.spring(scaleAnim, {
        toValue: 0.9,
        useNativeDriver: true,
        friction: 8,
        tension: 100,
      }).start();
      onPressIn?.(e);
    },
    [onPressIn, scaleAnim]
  );

  const handlePressOut = useCallback(
    (e: GestureResponderEvent) => {
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        friction: 8,
        tension: 100,
      }).start();
      onPressOut?.(e);
    },
    [onPressOut, scaleAnim]
  );

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      hitSlop={4}
    >
      <Animated.View
        style={[
          styles.iconButton,
          isActive && styles.iconButtonActive,
          disabled && styles.iconButtonDisabled,
          { transform: [{ scale: scaleAnim }] },
          style,
        ]}
      >
        {icon}
      </Animated.View>
    </Pressable>
  );
}

// ============================================================================
// CHAT COMPOSER COMPONENT
// ============================================================================

export function ChatComposer({
  onSend,
  onOpenAttachments,
  onOpenCamera,
  onToggleStickers,
  onStartRecording,
  onStopRecording,
  isSending = false,
  style,
}: ChatComposerProps) {
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<TextInputType>(null);

  const handleSend = useCallback(() => {
    const trimmedText = text.trim();
    if (trimmedText && !isSending) {
      onSend(trimmedText);
      setText('');
    }
  }, [text, isSending, onSend]);

  const handleMicPressIn = useCallback(() => {
    setIsRecording(true);
    onStartRecording?.();
  }, [onStartRecording]);

  const handleMicPressOut = useCallback(() => {
    setIsRecording(false);
    onStopRecording?.();
  }, [onStopRecording]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
  }, []);

  const hasText = text.trim().length > 0;

  return (
    <View style={[styles.container, style]}>
      {/* Recording indicator */}
      {isRecording && (
        <View style={styles.recordingIndicator}>
          <View style={styles.recordingDot} />
          <Text style={styles.recordingText}>Recording...</Text>
        </View>
      )}

      <View style={styles.toolbar}>
        {/* Attachment button */}
        <IconButton
          icon={<Feather name="plus" size={SPACING.iconSize} color={COLORS.iconDefault} />}
          onPress={onOpenAttachments}
          accessibilityLabel="Open attachments"
          style={styles.attachButton}
        />

        {/* Input pill */}
        <View style={[styles.inputContainer, isFocused && styles.inputContainerFocused]}>
          <TextInput
            ref={inputRef}
            style={styles.textInput}
            value={text}
            onChangeText={setText}
            placeholder="Message"
            placeholderTextColor={COLORS.placeholder}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            onFocus={handleFocus}
            onBlur={handleBlur}
            multiline={false}
            accessibilityLabel="Message input"
            accessibilityHint="Type your message here"
          />

          {/* Sticker/emoji button inside input */}
          <IconButton
            icon={
              <MaterialCommunityIcons
                name="sticker-emoji"
                size={SPACING.iconSize}
                color={COLORS.iconDefault}
              />
            }
            onPress={onToggleStickers}
            accessibilityLabel="Open stickers and emoji"
            style={styles.stickerButton}
          />
        </View>

        {/* Camera or Send button */}
        {hasText ? (
          <IconButton
            icon={
              isSending ? (
                <ActivityIndicator size="small" color={COLORS.iconActive} />
              ) : (
                <Feather name="send" size={20} color={COLORS.iconActive} />
              )
            }
            onPress={handleSend}
            accessibilityLabel="Send message"
            style={styles.sendButton}
            disabled={isSending}
          />
        ) : (
          <>
            <IconButton
              icon={<Feather name="camera" size={SPACING.iconSize} color={COLORS.iconDefault} />}
              onPress={onOpenCamera}
              accessibilityLabel="Open camera"
            />

            {/* Microphone button */}
            <IconButton
              icon={
                <Feather
                  name="mic"
                  size={SPACING.iconSize}
                  color={isRecording ? COLORS.recording : COLORS.iconDefault}
                />
              }
              onPressIn={handleMicPressIn}
              onPressOut={handleMicPressOut}
              accessibilityLabel="Hold to record voice message"
              isActive={isRecording}
              style={isRecording ? styles.micRecording : undefined}
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
    backgroundColor: COLORS.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: SPACING.toolbarPadding,
    paddingVertical: SPACING.toolbarPadding,
    gap: SPACING.gap,
  },
  iconButton: {
    width: SPACING.iconButtonSize,
    height: SPACING.iconButtonSize,
    borderRadius: SPACING.iconButtonSize / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  iconButtonDisabled: {
    opacity: 0.5,
  },
  attachButton: {
    backgroundColor: COLORS.inputBackground,
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.inputBackground,
    borderRadius: SPACING.inputBorderRadius,
    minHeight: SPACING.inputHeight,
    paddingLeft: SPACING.inputPaddingHorizontal,
    paddingRight: 4,
  },
  inputContainerFocused: {
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text,
    paddingVertical: 10,
    maxHeight: 100,
  },
  stickerButton: {
    width: 36,
    height: 36,
  },
  sendButton: {
    backgroundColor: COLORS.accent,
  },
  micRecording: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.recording,
  },
  recordingText: {
    color: COLORS.recording,
    fontSize: 14,
    fontWeight: '500',
  },
});

export default ChatComposer;
