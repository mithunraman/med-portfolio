import { useTheme } from '@/theme';
import { Feather } from '@expo/vector-icons';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

interface EditableTitleProps {
  value: string;
  onChange: (text: string) => void;
  editable: boolean;
}

export function EditableTitle({ value, onChange, editable }: EditableTitleProps) {
  const { colors } = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const handlePress = useCallback(() => {
    if (!editable) return;
    setIsEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [editable]);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
  }, []);

  if (isEditing) {
    return (
      <View style={styles.editContainer}>
        <TextInput
          ref={inputRef}
          style={[
            styles.input,
            {
              color: colors.text,
              borderColor: colors.primary,
              backgroundColor: colors.surface,
            },
          ]}
          value={value}
          onChangeText={onChange}
          onBlur={handleBlur}
          maxLength={200}
          returnKeyType="done"
          onSubmitEditing={handleBlur}
        />
        <Text style={[styles.charCount, { color: colors.textSecondary }]}>
          {value.length}/200
        </Text>
      </View>
    );
  }

  return (
    <Pressable onPress={handlePress} style={styles.displayContainer}>
      <Text style={[styles.title, { color: colors.text }]}>
        {value || 'Untitled entry'}
      </Text>
      {editable && (
        <Feather name="edit-2" size={14} color={colors.textSecondary} style={styles.pencilIcon} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  displayContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    flex: 1,
  },
  pencilIcon: {
    marginTop: 6,
  },
  editContainer: {
    gap: 4,
  },
  input: {
    fontSize: 22,
    fontWeight: '700',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  charCount: {
    fontSize: 12,
    textAlign: 'right',
  },
});
