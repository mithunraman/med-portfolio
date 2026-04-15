import { useTheme } from '@/theme';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

const DOT_COUNT = 5;
const DOT_SIZE = 8;
const BOUNCE_HEIGHT = -6;
const DURATION = 300;
const STAGGER_DELAY = 100;

interface WaveDotsProps {
  color?: string;
}

export function WaveDots({ color }: WaveDotsProps) {
  const { colors } = useTheme();
  const dotColor = color ?? colors.primary;
  const animations = useRef(Array.from({ length: DOT_COUNT }, () => new Animated.Value(0))).current;

  useEffect(() => {
    const wave = Animated.loop(
      Animated.stagger(
        STAGGER_DELAY,
        animations.map((anim) =>
          Animated.sequence([
            Animated.timing(anim, {
              toValue: 1,
              duration: DURATION,
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 0,
              duration: DURATION,
              useNativeDriver: true,
            }),
          ])
        )
      )
    );
    wave.start();
    return () => wave.stop();
  }, [animations]);

  return (
    <View style={styles.container}>
      {animations.map((anim, i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            {
              backgroundColor: dotColor,
              transform: [
                {
                  translateY: anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, BOUNCE_HEIGHT],
                  }),
                },
              ],
              opacity: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.4, 1],
              }),
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
});
