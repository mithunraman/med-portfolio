import { StarRating } from '@/components/common/StarRating';
import { useAppDispatch } from '@/hooks';
import { upsertReview } from '@/store';
import { useTheme } from '@/theme';
import { logger } from '@/utils/logger';
import { ARTEFACT_REVIEW_COMMENT_MAX_LENGTH, type Artefact } from '@acme/shared';
import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Show the character counter only as the user approaches the limit, so the
// common short-comment case stays uncluttered.
const COUNTER_VISIBLE_THRESHOLD = 1800;

const reviewLogger = logger.createScope('ReviewSheet');

interface ReviewSheetProps {
  visible: boolean;
  onClose: () => void;
  artefact: Artefact;
  /** Seed rating when opening for a first-time review (from the inline star tap). */
  initialRating?: number;
}

/**
 * Bottom-sheet capture surface for the author's private rating + optional comment.
 * Create and edit share this surface (upsert); the only differences are the seed
 * values and the primary button label. Plain-merge submit — on failure the sheet
 * stays open with the user's input intact rather than rolling back optimistic UI.
 */
export function ReviewSheet({ visible, onClose, artefact, initialRating }: ReviewSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();

  const existing = artefact.review;
  const isEditing = existing !== null;

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed (or re-seed) the draft each time the sheet opens: from the existing
  // review when editing, otherwise from the inline star tap that opened it.
  useEffect(() => {
    if (!visible) return;
    // Existing review wins; initialRating only seeds a first-time (create) rating.
    setRating(existing?.rating ?? initialRating ?? 0);
    setComment(existing?.comment ?? '');
    setError(null);
    setSaving(false);
  }, [visible, existing, initialRating]);

  const handleSubmit = async () => {
    if (rating < 1) return;
    setSaving(true);
    setError(null);
    try {
      await dispatch(
        upsertReview({
          artefactId: artefact.id,
          rating,
          comment: comment.trim() || null,
        })
      ).unwrap();
      onClose();
    } catch (err) {
      reviewLogger.error('Failed to submit review', { error: err });
      setError("Couldn't save your rating. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const showCounter = comment.length >= COUNTER_VISIBLE_THRESHOLD;

  return (
    // This sheet is the review editor (create or edit are both upserts), so we
    // open straight into typing via the TextInput's `autoFocus` prop.
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.overlay} onPress={saving ? undefined : onClose}>
          <Pressable
            style={[
              styles.container,
              { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 24) },
            ]}
          >
            <View style={[styles.handle, { backgroundColor: colors.border }]} />

            {/* Pinned header — stays in view no matter how long the comment grows */}
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.text }]}>
                {isEditing ? 'Edit your rating of the AI' : 'How well did the AI do?'}
              </Text>
              <Pressable onPress={onClose} disabled={saving} style={styles.closeButton} hitSlop={8}>
                <Feather name="x" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            {/* Scrollable body — the comment is the only part that grows; it scrolls
                here (and internally once capped) instead of pushing the sheet off-screen */}
            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={[styles.helper, { color: colors.textSecondary }]}>
                Private to you - it helps us improve.
              </Text>

              <View style={styles.stars}>
                <StarRating
                  value={rating}
                  onChange={setRating}
                  size={30}
                  gap={12}
                  readOnly={saving}
                />
              </View>

              <TextInput
                autoFocus
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                  },
                ]}
                value={comment}
                onChangeText={setComment}
                editable={!saving}
                placeholder="What did the AI get right or miss? (optional)"
                placeholderTextColor={colors.textSecondary}
                multiline
                maxLength={ARTEFACT_REVIEW_COMMENT_MAX_LENGTH}
                textAlignVertical="top"
                accessibilityLabel="Optional review"
              />
            </ScrollView>

            {/* Pinned footer — counter, error and the primary action stay reachable */}
            <View style={styles.footer}>
              {showCounter && (
                <Text style={[styles.counter, { color: colors.textSecondary }]}>
                  {comment.length} / {ARTEFACT_REVIEW_COMMENT_MAX_LENGTH}
                </Text>
              )}

              {error && <Text style={[styles.error, { color: colors.error }]}>{error}</Text>}

              <Pressable
                style={[
                  styles.submit,
                  { backgroundColor: colors.primary, opacity: rating < 1 || saving ? 0.5 : 1 },
                ]}
                onPress={handleSubmit}
                disabled={rating < 1 || saving}
                accessibilityRole="button"
                accessibilityLabel={isEditing ? 'Save rating' : 'Submit rating'}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.submitText}>{isEditing ? 'Save' : 'Submit'}</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    // Never exceed the viewport — the body scrolls instead of the sheet growing
    // past the top of the screen and hiding the header/close button.
    maxHeight: '90%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    flexShrink: 0,
  },
  // flexShrink lets the body give up space (and scroll) when the sheet hits its
  // max height, while the pinned header/footer keep their size.
  body: {
    flexShrink: 1,
  },
  bodyContent: {
    paddingBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  closeButton: {
    padding: 2,
  },
  helper: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 20,
  },
  stars: {
    alignItems: 'center',
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    lineHeight: 21,
    minHeight: 96,
    // Grow with the comment up to a point, then scroll internally rather than
    // letting one field dominate the sheet.
    maxHeight: 180,
  },
  footer: {
    flexShrink: 0,
    paddingTop: 16,
  },
  counter: {
    fontSize: 12,
    textAlign: 'right',
    marginBottom: 8,
  },
  error: {
    fontSize: 13,
    marginBottom: 12,
  },
  submit: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
