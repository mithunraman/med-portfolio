import { selectIsOffline } from '@/store/slices/networkSlice';
import { useAppSelector } from '@/hooks';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const OFFLINE_BANNER_HEIGHT = 36;
const BACK_ONLINE_DURATION_MS = 2000;

export function OfflineBanner() {
  const isOffline = useAppSelector(selectIsOffline);
  const insets = useSafeAreaInsets();
  const [showBackOnline, setShowBackOnline] = useState(false);
  const wasOffline = useRef(false);
  const anim = useRef(new Animated.Value(0)).current;

  const visible = isOffline || showBackOnline;

  // Track offline → online transitions for "Back online" message
  useEffect(() => {
    if (isOffline) {
      wasOffline.current = true;
    } else if (wasOffline.current) {
      wasOffline.current = false;
      setShowBackOnline(true);
      const timer = setTimeout(() => setShowBackOnline(false), BACK_ONLINE_DURATION_MS);
      return () => clearTimeout(timer);
    }
  }, [isOffline]);

  // Animate 0 → 1 (visible) or 1 → 0 (hidden)
  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [visible, anim]);

  // Total height includes safe area so the colored background fills behind the status bar
  const totalHeight = insets.top + OFFLINE_BANNER_HEIGHT;

  const animatedHeight = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, totalHeight],
  });

  const animatedPaddingTop = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, insets.top],
  });

  const backgroundColor = isOffline ? '#d93025' : '#16a34a';
  const label = isOffline ? 'No internet connection' : 'Back online';
  const iconName = isOffline ? 'cloud-offline-outline' : 'checkmark-circle-outline';

  return (
    <Animated.View
      style={[
        styles.banner,
        {
          backgroundColor: visible ? backgroundColor : 'transparent',
          height: animatedHeight,
          paddingTop: animatedPaddingTop,
        },
      ]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Ionicons name={iconName} size={16} color="#fff" />
      <Text style={styles.text}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    overflow: 'hidden',
  },
  text: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
