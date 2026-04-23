import { useAppDispatch, useAppSelector } from '@/hooks';
import { useBannerAnimation } from '@/hooks/useBannerAnimation';
import { selectIsOffline, setBannerVisible } from '@/store/slices/networkSlice';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { OFFLINE_BANNER_HEIGHT } from './bannerMetrics';

const BACK_ONLINE_DURATION_MS = 2000;

export function OfflineBanner() {
  const dispatch = useAppDispatch();
  const isOffline = useAppSelector(selectIsOffline);
  const [showBackOnline, setShowBackOnline] = useState(false);
  const wasOffline = useRef(false);

  const visible = isOffline || showBackOnline;
  const backgroundColor = isOffline ? '#d93025' : '#16a34a';
  const animatedStyle = useBannerAnimation(visible, OFFLINE_BANNER_HEIGHT, backgroundColor);

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

  // Keep Redux in sync with actual banner visibility
  useEffect(() => {
    dispatch(setBannerVisible(visible));
  }, [visible, dispatch]);

  const label = isOffline ? 'No internet connection' : 'Back online';
  const iconName = isOffline ? 'cloud-offline-outline' : 'checkmark-circle-outline';

  return (
    <Animated.View
      style={[styles.banner, animatedStyle]}
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
  },
  text: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
