import { useAppSelector } from '@/hooks';
import type { QuotaWindow } from '@acme/shared';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BANNER_HEIGHT = 36;
const WARNING_THRESHOLD = 0.8;

function formatResetTime(resetsAt: string | null): string {
  if (!resetsAt) return 'soon';
  const diff = new Date(resetsAt).getTime() - Date.now();
  if (diff <= 0) return 'soon';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function getUrgentWindow(
  shortWindow: QuotaWindow,
  weeklyWindow: QuotaWindow
): { window: QuotaWindow; percent: number } | null {
  const shortPercent = shortWindow.limit > 0 ? shortWindow.used / shortWindow.limit : 0;
  const weeklyPercent = weeklyWindow.limit > 0 ? weeklyWindow.used / weeklyWindow.limit : 0;

  // Return the window that's closer to or over the limit
  if (shortPercent >= WARNING_THRESHOLD || weeklyPercent >= WARNING_THRESHOLD) {
    return shortPercent >= weeklyPercent
      ? { window: shortWindow, percent: shortPercent }
      : { window: weeklyWindow, percent: weeklyPercent };
  }

  return null;
}

export function QuotaWarningBanner() {
  const quota = useAppSelector((s) => s.auth.quota);
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  const [, setTick] = useState(0);

  // Update every minute for countdown
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const urgent = quota ? getUrgentWindow(quota.shortWindow, quota.weeklyWindow) : null;
  const visible = !!urgent;
  const isExceeded = urgent ? urgent.percent >= 1 : false;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [visible, anim]);

  const totalHeight = insets.top + BANNER_HEIGHT;

  const animatedHeight = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, totalHeight],
  });

  const animatedPaddingTop = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, insets.top],
  });

  const backgroundColor = isExceeded ? '#d93025' : '#b45309';
  const remaining = urgent ? Math.max(0, urgent.window.limit - urgent.window.used) : 0;
  const resetTime = urgent ? formatResetTime(urgent.window.resetsAt) : '';

  const label = isExceeded
    ? `Limit reached. Resets in ${resetTime}.`
    : `Running low: ${remaining} remaining. Resets in ${resetTime}.`;

  return (
    <Animated.View
      style={[
        styles.banner,
        {
          height: animatedHeight,
          paddingTop: animatedPaddingTop,
          backgroundColor: visible ? backgroundColor : 'transparent',
        },
      ]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Ionicons
        name={isExceeded ? 'alert-circle' : 'alert-circle-outline'}
        size={14}
        color="#fff"
      />
      <Text style={styles.text} numberOfLines={1}>
        {label}
      </Text>
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
    paddingHorizontal: 16,
  },
  text: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
