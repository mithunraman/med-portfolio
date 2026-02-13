import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
  type ListRenderItem,
  type ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Slide {
  id: string;
  title: string;
  description: string;
  icon: string;
}

const SLIDES: Slide[] = [
  {
    id: '1',
    title: 'Welcome',
    description: 'Discover a better way to manage your tasks and stay organized.',
    icon: '1',
  },
  {
    id: '2',
    title: 'Stay Organized',
    description: 'Keep track of everything in one place. Never miss a deadline again.',
    icon: '2',
  },
  {
    id: '3',
    title: 'Collaborate',
    description: 'Work together with your team seamlessly and efficiently.',
    icon: '3',
  },
  {
    id: '4',
    title: 'Get Started',
    description: 'Create a free account or try the app first. Your data will be saved.',
    icon: '4',
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
        <View style={[styles.iconContainer, { backgroundColor: colors.surface }]}>
          <Text style={[styles.iconText, { color: colors.primary }]}>{item.icon}</Text>
        </View>
        <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          {item.description}
        </Text>
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
      {/* Skip button */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
          <Text style={[styles.skipText, { color: colors.textSecondary }]}>Skip</Text>
        </TouchableOpacity>
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
          <Switch
            value={isDark}
            onValueChange={toggleMode}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#fff"
          />
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
  },
  skipText: {
    fontSize: 16,
    fontWeight: '500',
  },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  iconText: {
    fontSize: 48,
    fontWeight: 'bold',
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
