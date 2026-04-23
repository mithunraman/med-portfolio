import { useAppSelector } from '@/hooks';
import { useBannerAnimation } from '@/hooks/useBannerAnimation';
import { getUrgentQuotaWindow } from '@/utils/quotaThreshold';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { QUOTA_BANNER_HEIGHT } from './bannerMetrics';

function formatResetTime(resetsAt: string | null): string {
  if (!resetsAt) return 'soon';
  const diff = new Date(resetsAt).getTime() - Date.now();
  if (diff <= 0) return 'soon';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function QuotaWarningBanner() {
  const quota = useAppSelector((s) => s.auth.quota);
  const [, setTick] = useState(0);

  // Update every minute for countdown
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const urgent = getUrgentQuotaWindow(quota);
  const visible = !!urgent;
  const isExceeded = urgent ? urgent.percent >= 1 : false;
  const backgroundColor = isExceeded ? '#d93025' : '#b45309';

  const animatedStyle = useBannerAnimation(visible, QUOTA_BANNER_HEIGHT, backgroundColor);

  const remaining = urgent ? Math.max(0, urgent.window.limit - urgent.window.used) : 0;
  const resetTime = urgent ? formatResetTime(urgent.window.resetsAt) : '';

  const label = isExceeded
    ? `Limit reached. Resets in ${resetTime}.`
    : `Running low: ${remaining} remaining. Resets in ${resetTime}.`;

  return (
    <Animated.View
      style={[styles.banner, animatedStyle]}
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
    paddingHorizontal: 16,
  },
  text: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
