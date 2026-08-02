import { Button } from '@/components/Button';
import { useTheme } from '@/theme';
import { ArtefactStatus } from '@acme/shared';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type CommitAction = 'saveForLater' | 'markAsDone' | 'save';

interface EntryActionBarProps {
  status: ArtefactStatus;
  /** Whether there are unsaved edits - gates the completed-state "Save". */
  hasChanges: boolean;
  /** A save/finalise is in flight - disables and spins the buttons. */
  busy?: boolean;
  /** Persist edits, keep "Needs review", return to the dashboard. */
  onSaveForLater: () => void;
  /** Persist edits, mark "Completed", return to the dashboard. */
  onMarkAsDone: () => void;
  /** Persist edits to an already-completed entry and stay in place. */
  onSaveCompleted: () => void;
}

/**
 * Status-driven commit bar (MOB-086/087/089).
 *
 * The single save affordance for the entry - it replaces both the old
 * "Complete entry" CTA and the sticky "Save changes" bar, so there is never
 * more than one save pattern on screen at a time:
 *   • IN_REVIEW  → two persistent commits: Save for later (keep) / Mark as done.
 *   • COMPLETED  → a single "Save", shown only while there are unsaved edits
 *                  (a completed entry's default is a read view).
 * Any other status (in-conversation, archived) renders nothing.
 */
export function EntryActionBar({
  status,
  hasChanges,
  busy = false,
  onSaveForLater,
  onMarkAsDone,
  onSaveCompleted,
}: EntryActionBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  // Both review buttons share one `busy` flag, so track which one the user
  // tapped and show the spinner only there - the sibling just disables. Cleared
  // whenever the request settles.
  const [active, setActive] = useState<CommitAction | null>(null);
  useEffect(() => {
    if (!busy) setActive(null);
  }, [busy]);

  const runAction = (action: CommitAction, handler: () => void) => {
    setActive(action);
    handler();
  };

  const isReview = status === ArtefactStatus.IN_REVIEW;
  const isCompletedWithEdits = status === ArtefactStatus.COMPLETED && hasChanges;

  if (!isReview && !isCompletedWithEdits) return null;

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingBottom: insets.bottom + 8,
        },
      ]}
    >
      {isReview ? (
        <>
          <View style={styles.flex}>
            <Button
              label="Save for later"
              variant="outline"
              onPress={() => runAction('saveForLater', onSaveForLater)}
              disabled={busy}
              loading={busy && active === 'saveForLater'}
              icon={(color) => <Ionicons name="time-outline" size={18} color={color} />}
            />
          </View>
          <View style={styles.flex}>
            <Button
              label="Mark as done"
              onPress={() => runAction('markAsDone', onMarkAsDone)}
              disabled={busy}
              loading={busy && active === 'markAsDone'}
              icon={(color) => <Ionicons name="checkmark-circle" size={20} color={color} />}
            />
          </View>
        </>
      ) : (
        <View style={styles.flex}>
          <Button
            label="Save"
            onPress={() => runAction('save', onSaveCompleted)}
            disabled={busy}
            loading={busy && active === 'save'}
            icon={(color) => <Feather name="save" size={18} color={color} />}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  flex: {
    flex: 1,
  },
});
