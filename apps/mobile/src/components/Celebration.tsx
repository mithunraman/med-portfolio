import LottieView from 'lottie-react-native';
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

// Pool of celebration animations. One is chosen per celebration - deterministically
// from `seed` when provided (so a given entry always gets the same one), otherwise
// at random. Mixed aspect ratios here, so the overlay uses resizeMode="contain".
const ANIMATIONS = [
  require('../../assets/animations/confetti.json'), // 609x812 portrait confetti
  require('../../assets/animations/trophy.json'), // 500x500 trophy
  require('../../assets/animations/success-tick.json'), // 1920x1920 checkmark
];

// Safety-net sizing: how long past the animation's natural run time to wait before
// force-clearing the overlay, and a floor in case the metadata is missing.
const FALLBACK_BUFFER_MS = 1500;
const FALLBACK_MIN_MS = 4000;

// djb2 string hash -> unsigned 32-bit. Small, dependency-free, and stable across
// runs, so the same seed always maps to the same animation.
function hashString(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return hash >>> 0;
}

// Pick an animation index from the seed (deterministic) or at random (no seed).
function selectAnimation(seed?: string) {
  const index =
    seed !== undefined
      ? hashString(seed) % ANIMATIONS.length
      : Math.floor(Math.random() * ANIMATIONS.length);
  return ANIMATIONS[index];
}

// Expected play time (ms) from the Lottie metadata: (outPoint - inPoint) / fps.
// Used only to size the safety timeout, so a missing field just falls back to 0.
function expectedDurationMs(source: { ip?: number; op?: number; fr?: number }): number {
  const frames = (source.op ?? 0) - (source.ip ?? 0);
  const fps = source.fr ?? 0;
  return frames > 0 && fps > 0 ? (frames / fps) * 1000 : 0;
}

interface CelebrationProps {
  // Controlled by the parent: mount and play only while true.
  visible: boolean;
  // Fired when the (non-looping) animation completes, so the parent can reset.
  onDone: () => void;
  // Stable key (e.g. the entry id) hashed to deterministically choose which
  // animation plays. Omit for a random pick.
  seed?: string;
}

// Full-screen, non-interactive celebration overlay. Presentational: the parent
// owns when it plays (`visible`) and what happens after (`onDone`). `pointerEvents
// ="none"` + absoluteFill let touches pass straight through to the screen beneath,
// so the celebration never blocks interaction (same overlay pattern as Toast).
//
// It carries one bit of lifecycle logic - a safety timeout that clears the overlay
// if Lottie's onAnimationFinish never fires (render failure, or the native callback
// being dropped on some platforms / the New Architecture). The timer is scoped to
// the visible window and cleared on hide/unmount, so it can neither fire late nor
// leak (see the effect below).
export function Celebration({ visible, onDone, seed }: CelebrationProps) {
  // Resolve once per seed so the choice can't flip on an unrelated re-render
  // mid-animation (matters for the random, seedless case).
  const source = useMemo(() => selectAnimation(seed), [seed]);

  // Hold the latest onDone in a ref so the timeout effect doesn't depend on it.
  // The parent passes an inline callback whose identity changes every render;
  // depending on it directly would restart (or leak) the timer on each re-render.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const fallbackMs = useMemo(
    () => Math.max(FALLBACK_MIN_MS, expectedDurationMs(source) + FALLBACK_BUFFER_MS),
    [source]
  );

  // Safety net for a missed onAnimationFinish. Scoped to `[visible]`: the timer
  // exists only while the overlay is up, and the cleanup clears it on hide, on
  // unmount, and before any re-run - so no dangling timer, no state update on an
  // unmounted parent, no double-fire when the normal finish path also clears.
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => onDoneRef.current(), fallbackMs);
    return () => clearTimeout(timer);
  }, [visible, fallbackMs]);

  if (!visible) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LottieView
        source={source}
        autoPlay
        loop={false}
        resizeMode="contain"
        onAnimationFinish={onDone}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
