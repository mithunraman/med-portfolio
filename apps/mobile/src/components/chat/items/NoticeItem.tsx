import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface Props {
  text: string;
}

export const NoticeItem = memo(function NoticeItem({ text }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.pill}>
        <Text style={styles.text}>{text}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  pill: {
    backgroundColor: '#fef9c3',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxWidth: '100%',
  },
  text: {
    color: '#713f12',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
  },
});
