import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface Props {
  visible: boolean;
  unreadCount?: number;
  onPress: () => void;
}

export const ScrollToBottomFAB = memo(function ScrollToBottomFAB({
  visible,
  unreadCount = 0,
  onPress,
}: Props) {
  if (!visible) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      <Pressable onPress={onPress} style={styles.button} accessibilityLabel="Scroll to bottom">
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
          </View>
        )}
        <Ionicons name="chevron-down" size={22} color="#111b21" />
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 16,
    right: 12,
    alignItems: 'center',
  },
  button: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  badge: {
    position: 'absolute',
    top: -8,
    backgroundColor: '#25D366',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
  },
});
