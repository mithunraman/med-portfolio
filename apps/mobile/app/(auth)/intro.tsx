import { AppSwitch } from '@/components';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ImageSourcePropType,
  type ListRenderItem,
  type ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Slide {
  id: string;
  title: string;
  description?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  image?: ImageSourcePropType;
}

const SLIDES: Slide[] = [
  {
    id: '1',
    image: require('../../assets/images/splash-icon.png'),
    title: 'Building your portfolio, simplified',
  },
  {
    id: '2',
    title: 'Talk it through',
    description: 'Your words become a structured portfolio entry - in minutes.',
    icon: 'mic-outline',
  },
  {
    id: '3',
    title: 'Stay ARCP-ready',
    description: 'Track which capabilities you\u2019ve evidenced before your ARCP.',
    icon: 'analytics-outline',
  },
];

export default function IntroScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark, toggleMode } = useTheme();

  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList<Slide>>(null);

  const isLastSlide = currentIndex === SLIDES.length - 1;

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        setCurrentIndex(viewableItems[0].index);
      }
    },
    []
  );

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const handleSkip = useCallback(() => {
    router.push('/(auth)/welcome');
  }, [router]);

  const handleNext = useCallback(() => {
    if (isLastSlide) {
      router.push('/(auth)/welcome');
    } else {
      flatListRef.current?.scrollToIndex({
        index: currentIndex + 1,
        animated: true,
      });
    }
  }, [currentIndex, isLastSlide, router]);

  const renderSlide: ListRenderItem<Slide> = useCallback(
    ({ item }) => (
      <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
        {/* Visual zone - upper half; decorative only, never interactive */}
        <View style={styles.iconZone} importantForAccessibility="no-hide-descendants">
          {item.image ? (
            <Image source={item.image} style={styles.logoImage} resizeMode="contain" />
          ) : item.icon ? (
            <Ionicons name={item.icon} size={72} color={colors.primary} />
          ) : null}
        </View>

        {/* Text zone - lower half */}
        <View style={styles.textZone}>
          <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>
          {item.description ? (
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              {item.description}
            </Text>
          ) : null}
        </View>
      </View>
    ),
    [colors]
  );

  const renderPaginationDots = useCallback(() => {
    return (
      <View style={styles.pagination}>
        {SLIDES.map((_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              {
                backgroundColor: index === currentIndex ? colors.primary : colors.border,
                width: index === currentIndex ? 24 : 8,
              },
            ]}
          />
        ))}
      </View>
    );
  }, [colors, currentIndex]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Skip - hidden on the last slide, where the primary CTA completes onboarding.
          A same-size spacer keeps the header height stable so slides don't shift. */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        {isLastSlide ? (
          <View style={styles.skipButton} />
        ) : (
          <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
            <Text style={[styles.skipText, { color: colors.textSecondary }]}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Carousel */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        bounces={false}
      />

      {/* Pagination & CTA */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
        {renderPaginationDots()}

        <TouchableOpacity
          style={[styles.ctaButton, { backgroundColor: colors.primary }]}
          onPress={handleNext}
          activeOpacity={0.8}
        >
          <Text style={styles.ctaText}>{isLastSlide ? "Let's Go" : 'Next'}</Text>
        </TouchableOpacity>

        {/* Dark mode toggle */}
        <View style={styles.themeToggle}>
          <Text style={[styles.themeToggleText, { color: colors.textSecondary }]}>Dark Mode</Text>
          <AppSwitch value={isDark} onValueChange={toggleMode} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  skipButton: {
    padding: 8,
    minHeight: 36,
    justifyContent: 'center',
  },
  skipText: {
    fontSize: 16,
    fontWeight: '500',
  },
  slide: {
    flex: 1,
    width: SCREEN_WIDTH,
  },
  iconZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 40,
    pointerEvents: 'none',
  },
  logoImage: {
    width: 200,
    height: 50,
  },
  textZone: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  footer: {
    paddingHorizontal: 24,
    gap: 24,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  ctaButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  themeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  themeToggleText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
