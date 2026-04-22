import { useAppDispatch, useAppSelector } from '@/hooks';
import { dismissRecommendedUpdate, selectRecommendedUpdateBannerVisible } from '@/store';
import type { UpdatePolicy } from '@acme/shared';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RECOMMENDED_UPDATE_BANNER_HEIGHT } from './bannerMetrics';

interface Props {
  updatePolicy: UpdatePolicy;
}

export function RecommendedUpdateBanner({ updatePolicy }: Props) {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const visible = useAppSelector(selectRecommendedUpdateBannerVisible);
  const anim = useRef(new Animated.Value(0)).current;

  const { latestVersion, storeUrl } = updatePolicy;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [visible, anim]);

  const handleDismiss = () => {
    dispatch(dismissRecommendedUpdate(latestVersion));
  };

  const handleUpdate = () => {
    Linking.openURL(storeUrl);
  };

  const totalHeight = insets.top + RECOMMENDED_UPDATE_BANNER_HEIGHT;
  const animatedHeight = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, totalHeight],
  });
  const animatedPaddingTop = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, insets.top],
  });

  return (
    <Animated.View
      style={[
        styles.banner,
        {
          height: animatedHeight,
          paddingTop: animatedPaddingTop,
          backgroundColor: '#1d4ed8',
        },
      ]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Ionicons name="arrow-up-circle-outline" size={14} color="#fff" />
      <TouchableOpacity onPress={handleUpdate} activeOpacity={0.7} style={styles.textContainer}>
        <Text style={styles.text} numberOfLines={1}>
          Update available - v{latestVersion}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={handleDismiss}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel="Dismiss update banner"
      >
        <Ionicons name="close" size={14} color="#fff" />
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
    overflow: 'hidden',
    paddingHorizontal: 16,
  },
  textContainer: {
    flex: 1,
  },
  text: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
