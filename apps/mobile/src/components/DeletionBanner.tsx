import { useAppDispatch, useAppSelector } from '@/hooks';
import { useBannerAnimation } from '@/hooks/useBannerAnimation';
import { cancelDeletion } from '@/store/slices/authSlice';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Animated, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { DELETION_BANNER_HEIGHT } from './bannerMetrics';

export function DeletionBanner() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const [cancelling, setCancelling] = useState(false);

  const visible = !!user?.deletionScheduledFor;
  const animatedStyle = useBannerAnimation(visible, DELETION_BANNER_HEIGHT, '#b45309');

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await dispatch(cancelDeletion()).unwrap();
    } catch {
      // Error handled by thunk — banner stays visible for retry
    } finally {
      setCancelling(false);
    }
  };

  const scheduledDate = user?.deletionScheduledFor
    ? new Date(user.deletionScheduledFor).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '';

  return (
    <Animated.View
      style={[styles.banner, animatedStyle]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Ionicons name="time-outline" size={14} color="#fff" />
      <Text style={styles.text} numberOfLines={1}>
        Deletion scheduled {scheduledDate}
      </Text>
      <TouchableOpacity
        onPress={handleCancel}
        disabled={cancelling}
        style={styles.cancelButton}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Cancel account deletion"
      >
        {cancelling ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.cancelText}>Cancel</Text>
        )}
      </TouchableOpacity>
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
    flex: 1,
  },
  cancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  cancelText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});
