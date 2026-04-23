import { SEVERITY_COLORS } from '@/constants/notices';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { useBannerAnimation } from '@/hooks/useBannerAnimation';
import { dismissRecommendedUpdate, selectRecommendedUpdateBannerVisible } from '@/store';
import { NoticeSeverity, type UpdatePolicy } from '@acme/shared';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { Animated, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { RECOMMENDED_UPDATE_BANNER_HEIGHT } from './bannerMetrics';

interface Props {
  updatePolicy: UpdatePolicy;
}

export function RecommendedUpdateBanner({ updatePolicy }: Props) {
  const dispatch = useAppDispatch();
  const visible = useAppSelector(selectRecommendedUpdateBannerVisible);
  const animatedStyle = useBannerAnimation(
    visible,
    RECOMMENDED_UPDATE_BANNER_HEIGHT,
    SEVERITY_COLORS[NoticeSeverity.INFO]
  );

  const { latestVersion, storeUrl } = updatePolicy;

  const handleDismiss = () => {
    dispatch(dismissRecommendedUpdate(latestVersion));
  };

  const handleUpdate = () => {
    Linking.openURL(storeUrl);
  };

  return (
    <Animated.View
      style={[styles.banner, animatedStyle]}
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
