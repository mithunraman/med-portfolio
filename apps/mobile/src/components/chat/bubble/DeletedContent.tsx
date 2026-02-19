import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../../theme';

export const DeletedContent = memo(function DeletedContent() {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Ionicons name="ban" size={14} color={colors.textSecondary} style={styles.icon} />
      <Text style={[styles.text, { color: colors.textSecondary }]}>This message was deleted</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  icon: {
    marginTop: 1,
  },
  text: {
    fontSize: 14,
    fontStyle: 'italic',
  },
});
