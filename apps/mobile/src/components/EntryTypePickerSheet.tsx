import { useAppDispatch, useAppSelector, useEntryTypes } from '@/hooks';
import { fetchSpecialties } from '@/store/slices/authSlice';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState } from './EmptyState';

type LoadState = 'idle' | 'loading' | 'success' | 'error';

/**
 * Delay before flashing the scroll indicator, in ms. The Modal's slide-in takes
 * ~300ms; flashing during it is invisible, which would defeat the point.
 */
const SHEET_SETTLE_MS = 350;

interface EntryTypePickerSheetProps {
  visible: boolean;
  /** Fired with the chosen entry-type code. The host owns what happens next. */
  onSelect: (entryType: string) => void;
  onDismiss: () => void;
}

/**
 * Entry-type picker shown before a new entry is started.
 *
 * The chosen type fixes the template for the whole analysis run, so it is asked
 * up front rather than inferred — there is no classification step in the graph.
 *
 * Options come from the user's specialty config via the cached `/specialties`
 * response already held in the auth slice (the same source as the onboarding
 * stage picker), so there is no hardcoded list here. If that response has not
 * loaded yet — a cold start straight into "new entry" — it is fetched on open,
 * following the explicit `LoadState` pattern used by `SpecialtyList`.
 */
export function EntryTypePickerSheet({ visible, onSelect, onDismiss }: EntryTypePickerSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();

  const specialties = useAppSelector((s) => s.auth.specialties);

  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<ScrollView>(null);

  // The store is the source of truth for whether we have data; `loadState` only
  // records what happened to OUR fetch attempt. Keeping those separate means a
  // response that arrived from somewhere else (onboarding, another screen) is
  // rendered normally instead of being second-guessed by a stale local flag.
  const hasSpecialties = specialties.length > 0;
  const entryTypes = useEntryTypes();

  const loadEntryTypes = useCallback(async () => {
    setLoadState('loading');
    setError(null);
    try {
      await dispatch(fetchSpecialties()).unwrap();
      setLoadState('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : ((err as string) ?? 'Something went wrong.'));
      setLoadState('error');
    }
  }, [dispatch]);

  // Cold start: the sheet can be the first surface that needs specialty config.
  //
  // `loadState` is a one-way transition per attempt (idle → loading → success |
  // error), and only the `idle` branch dispatches — so a failed fetch cannot
  // re-arm the effect and retry in a loop. The reset below runs only while the
  // sheet is hidden, where the fetch branch is unreachable, so the two branches
  // cannot trigger each other either. Net effect: at most one fetch per open,
  // and reopening retries (connectivity may have returned meanwhile).
  useEffect(() => {
    if (!visible) {
      if (loadState === 'error') setLoadState('idle');
      return;
    }
    if (hasSpecialties || loadState !== 'idle') return;
    loadEntryTypes();
  }, [visible, hasSpecialties, loadState, loadEntryTypes]);

  // Flash the scroll indicator once the sheet has settled and the list has content.
  //
  // The list is the first in the app long enough to overflow: with nine GP entry types
  // today only about half fit above the fold, and on a larger phone the fold can land far
  // enough into a card that it still reads as a complete one — so the list looks
  // finished when it is not. A flash is the one affordance that fires while the
  // trainee is deciding, since indicators are transient on both platforms and would
  // otherwise only appear after they had already discovered scrolling.
  //
  // Keyed on the item count, not just `visible`, so a cold start that opens the sheet
  // before `/specialties` resolves still flashes when the list arrives. Safe to call
  // unconditionally: on a list that does not overflow there is no indicator to show.
  useEffect(() => {
    if (!visible || entryTypes.length === 0) return;
    const timer = setTimeout(() => listRef.current?.flashScrollIndicators(), SHEET_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [visible, entryTypes.length]);

  const handleSelect = useCallback(
    (code: string) => {
      onSelect(code);
      onDismiss();
    },
    [onSelect, onDismiss]
  );

  function renderBody() {
    if (!hasSpecialties && loadState === 'error') {
      return (
        <EmptyState
          icon="cloud-offline-outline"
          title="Couldn't load entry types"
          description={error ?? 'Something went wrong. Please try again.'}
          actionLabel="Try Again"
          onAction={loadEntryTypes}
        />
      );
    }

    if (!hasSpecialties) {
      return (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      );
    }

    // Loaded, but nothing to offer — the user's specialty isn't in the response
    // (e.g. it is not yet active) or their profile has no specialty set. Distinct
    // from the failure above: retrying will not change it.
    if (entryTypes.length === 0) {
      return (
        <EmptyState
          icon="folder-open-outline"
          title="No entry types available"
          description="We couldn't find any entry types for your specialty. Check your specialty in Settings, or contact support."
        />
      );
    }

    return (
      <ScrollView
        ref={listRef}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        // Deliberately ON here, against the convention used by the other lists in the
        // app (SpecialtyList, StageList, the tab screens). Those hold 1–3 items and
        // never overflow; this one does, so hiding the indicator hides the fact that
        // there is more below.
        showsVerticalScrollIndicator
      >
        {entryTypes.map((option) => (
          <Pressable
            key={option.code}
            onPress={() => handleSelect(option.code)}
            accessibilityRole="button"
            // Label only, matching what is rendered. `option.description` is
            // deliberately not read out either — it is hidden because the copy is not
            // final, not to save space, so surfacing it to screen-reader users would
            // ship the very text we are holding back.
            accessibilityLabel={option.label}
            style={[
              styles.option,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}
          >
            <View style={styles.optionText}>
              {/* Descriptions are hidden until the final copy lands. The API still
                  sends `option.description`; only the render is suppressed, so
                  restoring it is a one-line change here. */}
              <Text style={[styles.optionLabel, { color: colors.text }]}>{option.label}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </Pressable>
        ))}
      </ScrollView>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.sheetOverlay} onPress={onDismiss}>
        <Pressable
          style={[
            styles.sheet,
            { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.sheetHandle} />

          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>What are you logging?</Text>
            {/* States the total up front, so a trainee who can see only the first few
                options knows how many there are. Hidden below two, where there is
                nothing to discover and the line would only add noise. */}
            {entryTypes.length > 1 && (
              <Text style={[styles.sheetSubtitle, { color: colors.textSecondary }]}>
                Choose from {entryTypes.length} types
              </Text>
            )}
          </View>

          {renderBody()}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 16,
    maxHeight: '80%',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(150,150,150,0.4)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetHeader: {
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  sheetSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  loading: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    gap: 10,
    paddingBottom: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  optionText: {
    flex: 1,
    gap: 3,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  /** Unused while descriptions are hidden — kept so restoring them needs no re-tuning. */
  optionDescription: {
    fontSize: 12,
    lineHeight: 17,
  },
});

export default EntryTypePickerSheet;
