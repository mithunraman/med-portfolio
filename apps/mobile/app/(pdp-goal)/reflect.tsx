import { Button, useToast } from '@/components';
import { PDP_COMPLETION_REVIEW_MAX_LENGTH } from '@acme/shared';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { selectPdpGoalById, updatePdpGoal } from '@/store';
import { useTheme } from '@/theme';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// A single reflective prompt shown as placeholder text — a light scaffold
// ("What did you learn / do differently") to counter blank-page paralysis without
// changing the single-string `completionReview` data model.
const REFLECTION_PROMPT =
  'What did you learn from working toward this goal? What will you do differently in future?';

/**
 * Dedicated PDP-goal reflection screen (MOB-108). Entered right after a goal is
 * marked complete (and re-enterable later from the completed goal), so reflection
 * reads as a first-class, deliberate step rather than a squeezed inline
 * afterthought. Intentionally a lean composer (no celebration header); the
 * completion itself is confirmed by a toast on the mark-complete action, and this
 * screen stays optional via "Maybe later".
 */
export default function PdpGoalReflectScreen() {
  const { goalId } = useLocalSearchParams<{ goalId: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { showToast } = useToast();

  const goal = useAppSelector((state) => selectPdpGoalById(state, goalId ?? ''));
  const mutating = useAppSelector(
    (state) => state.pdpGoals.statusById[goalId ?? ''] === 'updating'
  );

  // Seeded from the store (warm — every entry point comes from the already-fetched
  // goal detail screen), so editing an existing reflection prefills.
  const [text, setText] = useState(goal?.completionReview ?? '');

  // Fail safe if the goal isn't in the store (stale id / cold deep-link) rather
  // than rendering an editor bound to nothing. Route to the goals list (not the
  // goal detail — its id is the stale part), and don't rely on back() since a cold
  // deep-link has no history to pop.
  if (!goal) {
    return (
      <View style={[styles.fallback, { backgroundColor: colors.background }]}>
        <Text style={[styles.fallbackText, { color: colors.textSecondary }]}>
          This goal is no longer available.
        </Text>
        <TouchableOpacity
          onPress={() => router.replace('/(tabs)/pdp')}
          style={styles.skipButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Back to goals"
        >
          <Text style={[styles.skipText, { color: colors.primary }]}>Back to goals</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Exit safely: pop if there's history, otherwise (cold deep-link / notification
  // entry with no prior screen) replace into the goal detail so back() can't strand
  // the user on this screen.
  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace(`/(pdp-goal)/${goalId}`);
  };

  const handleSave = () => {
    if (!goalId) return;
    dispatch(updatePdpGoal({ goalId, data: { completionReview: text.trim() } }))
      .unwrap()
      .then(() => {
        showToast('Reflection saved');
        leave();
      })
      .catch(() => showToast("Couldn't save your reflection. Please try again."));
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={headerHeight}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]}
        keyboardShouldPersistTaps="handled"
      >
        <TextInput
          style={[
            styles.textInput,
            { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
          ]}
          placeholder={REFLECTION_PROMPT}
          placeholderTextColor={colors.textSecondary}
          value={text}
          onChangeText={setText}
          maxLength={PDP_COMPLETION_REVIEW_MAX_LENGTH}
          multiline
        />

        <Button
          label="Save reflection"
          onPress={handleSave}
          loading={mutating}
          disabled={!text.trim()}
        />

        <TouchableOpacity
          onPress={leave}
          style={styles.skipButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Skip reflection for now"
        >
          <Text style={[styles.skipText, { color: colors.textSecondary }]}>Maybe later</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    // flexGrow lets the content fill (and scroll past) the keyboard-shrunk
    // viewport, so the trailing actions are always reachable.
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    gap: 16,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    lineHeight: 21,
    minHeight: 160,
    textAlignVertical: 'top',
  },
  skipButton: {
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  skipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  fallbackText: {
    fontSize: 14,
    textAlign: 'center',
  },
});
