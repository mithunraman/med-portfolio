import type { GoalSelectionState, LocalNote } from '@/components';
import {
  AppDialog,
  ArtefactAdvisoryBanner,
  EditableReflectionSection,
  EditableTitle,
  EntryActionBar,
  ExportSheet,
  FullScreenSectionEditor,
  initGoalSelections,
  noteKey,
  NotesSection,
  PdpGoalSelector,
  ReviewSheet,
  StarRating,
  StatusPill,
  useToast,
} from '@/components';
import { useAppDispatch, useAppSelector } from '@/hooks';
import {
  deleteArtefact,
  duplicateToReview,
  editArtefact,
  fetchArtefact,
  finaliseArtefact,
  replaceNotes,
  selectArtefactById,
  updateArtefactStatus,
} from '@/store';
import { useTheme } from '@/theme';
import { getArtefactStatusMeta } from '@/utils/artefactStatus';
import { formatTimeAgo } from '@/utils/formatTimeAgo';
import { getPdpGoalStatusDisplay } from '@/utils/pdpGoalStatus';
import type {
  Capability,
  ComposedDocumentField,
  EditArtefactRequest,
  PdpGoalSelection,
} from '@acme/shared';
import { ArtefactStatus, PdpGoalStatus } from '@acme/shared';
import { useActionSheet } from '@expo/react-native-action-sheet';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const AI_REASONING_COLOR = '#8B5CF6';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Compact date for the header metadata line, e.g. "12 Jul".
function formatShortDate(isoDate: string): string {
  const date = new Date(isoDate);
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

// Toggle a value's membership in a Set immutably (returns a new Set). Shared by
// the section (keyed by index) and capability (keyed by code) expand toggles.
function toggleInSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

// Notes display newest-first. Unsaved drafts (no createdAt yet) sort to the top
// so a freshly added note is immediately visible.
function sortNotesNewestFirst(notes: LocalNote[]): LocalNote[] {
  return [...notes].sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : Infinity;
    const tb = b.createdAt ? Date.parse(b.createdAt) : Infinity;
    return tb - ta;
  });
}

// True when the local notes are identical to the persisted set — used to collapse
// the edit buffer back to null (e.g. after adding then cancelling a blank draft)
// so the sticky save bar doesn't appear for a no-op change.
function notesMatchServer(local: LocalNote[], server: LocalNote[]): boolean {
  if (local.length !== server.length) return false;
  const serverByXid = new Map(server.map((n) => [n.xid, n.text]));
  return local.every((n) => n.xid !== undefined && serverByXid.get(n.xid) === n.text);
}

function formatGoalDate(isoDate: string): string {
  const date = new Date(isoDate);
  const day = date.getDate().toString().padStart(2, '0');
  const month = MONTHS[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

export default function EntryDetailScreen() {
  const { artefactId } = useLocalSearchParams<{ artefactId: string }>();
  const dispatch = useAppDispatch();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const router = useRouter();
  const { showToast } = useToast();
  const { showActionSheetWithOptions } = useActionSheet();

  const artefact = useAppSelector((state) => selectArtefactById(state, artefactId ?? ''));
  const entityStatus = useAppSelector((state) => state.artefacts.statusById[artefactId ?? '']);
  const updatingStatus = entityStatus === 'updating';
  const saving = entityStatus === 'saving';

  useEffect(() => {
    if (artefactId) {
      dispatch(fetchArtefact({ artefactId }));
    }
  }, [artefactId, dispatch]);

  // ── Edit State ──

  const [editedTitle, setEditedTitle] = useState<string | null>(null);
  const [editedDocument, setEditedDocument] = useState<ComposedDocumentField[] | null>(null);
  const [editedCapabilities, setEditedCapabilities] = useState<Capability[] | null>(null);
  // Notes edit buffer (null = no unsaved note changes). Held in display order.
  const [editedNotes, setEditedNotes] = useState<LocalNote[] | null>(null);
  // The note currently open in the editor, addressed by its stable key
  // (xid for saved notes, clientId for drafts) — never by list position.
  const [editingNoteKey, setEditingNoteKey] = useState<string | null>(null);
  // Monotonic source of client-side draft ids for the current screen session.
  const draftSeq = useRef(0);
  // Set immediately before a programmatic leave (Save for later / Mark as done /
  // Delete) so the beforeRemove guard lets that navigation through. Without it,
  // router.back() runs before React has flushed the buffer-clearing re-render and
  // unsubscribed the guard, so the just-saved user would see a spurious
  // "Unsaved changes" prompt (passive-effect cleanup is deferred).
  const bypassUnsavedPrompt = useRef(false);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set([0]));
  // Capability edit/expand state is keyed by capability code (the API's natural
  // key), not list position — so a future display-time sort/filter can't misalign
  // an in-flight edit onto the wrong capability.
  const [expandedCapabilities, setExpandedCapabilities] = useState<Set<string>>(new Set());
  const [goalSelections, setGoalSelections] = useState<Map<string, GoalSelectionState>>(new Map());
  const [editingSectionIndex, setEditingSectionIndex] = useState<number | null>(null);
  const [editingCapabilityCode, setEditingCapabilityCode] = useState<string | null>(null);
  const [exportSheetVisible, setExportSheetVisible] = useState(false);
  const [reviewSheetVisible, setReviewSheetVisible] = useState(false);
  // MOB-097: shown when finalising with a selected PDP goal missing a review date.
  const [reviewDateErrorVisible, setReviewDateErrorVisible] = useState(false);
  const [finaliseConfirmVisible, setFinaliseConfirmVisible] = useState(false);
  const [archiveDialogVisible, setArchiveDialogVisible] = useState(false);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  // Seeds a first-time (create) review from the inline star tap. Ignored on the edit
  // path, where the sheet seeds from the existing review.
  const [reviewSeedRating, setReviewSeedRating] = useState<number | undefined>(undefined);
  // Editable in review AND completed — completion is a filter, not a lock
  // (MOB-087). Archived / in-conversation stay read-only.
  const isEditable =
    artefact?.status === ArtefactStatus.IN_REVIEW || artefact?.status === ArtefactStatus.COMPLETED;
  const canExport =
    artefact?.status === ArtefactStatus.IN_REVIEW || artefact?.status === ArtefactStatus.COMPLETED;

  const hasChanges =
    editedTitle !== null ||
    editedDocument !== null ||
    editedCapabilities !== null ||
    editedNotes !== null;

  // Current displayed values (edited or server). The composed document is the
  // single source of truth for the entry body — shown and edited in place.
  const displayTitle = editedTitle ?? artefact?.title ?? '';
  const displayDocument = editedDocument ?? artefact?.composedDocument ?? [];
  const displayCapabilities = editedCapabilities ?? artefact?.capabilities ?? [];
  const editingCapability =
    editingCapabilityCode !== null
      ? displayCapabilities.find((c) => c.code === editingCapabilityCode)
      : undefined;

  // Notes — visible from review onward; editable in any non-archived state
  // (notes are post-creation addenda, unlike the body which locks at completion).
  const serverNotes = useMemo(() => sortNotesNewestFirst(artefact?.notes ?? []), [artefact?.notes]);
  const displayNotes = editedNotes ?? serverNotes;
  const showNotes = !!artefact && artefact.status !== ArtefactStatus.IN_CONVERSATION;
  const notesEditable =
    artefact?.status !== undefined &&
    artefact.status !== ArtefactStatus.IN_CONVERSATION &&
    artefact.status !== ArtefactStatus.ARCHIVED;
  const editingNote =
    editingNoteKey !== null ? displayNotes.find((n) => noteKey(n) === editingNoteKey) : undefined;

  // ── Edit Handlers ──

  const handleTitleChange = useCallback((text: string) => {
    setEditedTitle(text);
  }, []);

  const handleSectionSave = useCallback(
    (_title: string, text: string) => {
      if (editingSectionIndex === null) return;
      setEditedDocument((prev) => {
        const sections = [...(prev ?? artefact?.composedDocument ?? [])];
        const current = sections[editingSectionIndex];
        if (current) sections[editingSectionIndex] = { ...current, text };
        return sections;
      });
    },
    [editingSectionIndex, artefact?.composedDocument]
  );

  // Mirrors handleSectionSave: overwrite only the edited capability's justification,
  // matched by code; name and evidence stay untouched.
  const handleCapabilitySave = useCallback(
    (_title: string, text: string) => {
      if (editingCapabilityCode === null) return;
      setEditedCapabilities((prev) =>
        (prev ?? artefact?.capabilities ?? []).map((c) =>
          c.code === editingCapabilityCode ? { ...c, justification: text } : c
        )
      );
    },
    [editingCapabilityCode, artefact?.capabilities]
  );

  // ── Notes Handlers ──

  // Collapse the edit buffer back to null when it matches the persisted set, so a
  // no-op (e.g. add-then-cancel a blank draft) doesn't trip the sticky save bar.
  const collapseNotes = useCallback(
    (notes: LocalNote[]) => (notesMatchServer(notes, serverNotes) ? null : notes),
    [serverNotes]
  );

  // All note mutators use functional setEditedNotes(prev => …) updates so they
  // COMPOSE within a single event. The editor's Done fires onSave then onClose
  // synchronously; a functional close updater sees the post-save value (not the
  // pre-render closure) and correctly no-ops on a non-blank note instead of
  // clobbering the save with null.
  const handleAddNote = useCallback(() => {
    // Prepend an empty draft (newest-first) with a stable client id and open the
    // editor on it — addressed by key, so a later sibling draft can't shift it.
    const clientId = `draft-${(draftSeq.current += 1)}`;
    setEditedNotes((prev) => [{ text: '', clientId }, ...(prev ?? serverNotes)]);
    setEditingNoteKey(clientId);
  }, [serverNotes]);

  const handleEditNote = useCallback((key: string) => {
    setEditingNoteKey(key);
  }, []);

  // Single deletion path — used by both the trash icon and the "edited to blank"
  // case below, so removing a note always goes through the same confirmation.
  const confirmDeleteNote = useCallback(
    (key: string) => {
      Alert.alert('Delete note?', 'This note will be removed when you save.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            setEditedNotes((prev) =>
              collapseNotes((prev ?? serverNotes).filter((n) => noteKey(n) !== key))
            ),
        },
      ]);
    },
    [serverNotes, collapseNotes]
  );

  const handleNoteSave = useCallback(
    (_title: string, text: string) => {
      if (editingNoteKey === null) return;
      const key = editingNoteKey;

      // A note can't be saved empty (DTO requires min length 1). Emptying an
      // existing note is a delete request, not an edit — route it through the
      // same confirmation as the trash icon rather than silently dropping it.
      // The blank text is NOT applied, so the note is untouched unless confirmed.
      const target = displayNotes.find((n) => noteKey(n) === key);
      if (text.trim().length === 0 && target?.xid !== undefined) {
        confirmDeleteNote(key);
        return;
      }

      setEditedNotes((prev) =>
        collapseNotes((prev ?? serverNotes).map((n) => (noteKey(n) === key ? { ...n, text } : n)))
      );
    },
    [editingNoteKey, displayNotes, serverNotes, collapseNotes, confirmDeleteNote]
  );

  // On close, drop a never-saved DRAFT left blank (added but never typed). An
  // existing note can't reach a blank state here — emptying one is handled above
  // via confirmation — so the xid guard keeps deletion of saved notes confirmed.
  // Functional update reads the post-onSave value, so a real note survives Done.
  const handleNoteEditorClose = useCallback(() => {
    const key = editingNoteKey;
    setEditedNotes((prev) => {
      if (prev === null || key === null) return prev;
      const note = prev.find((n) => noteKey(n) === key);
      if (note && note.xid === undefined && note.text.trim().length === 0) {
        return collapseNotes(prev.filter((n) => noteKey(n) !== key));
      }
      return prev;
    });
    setEditingNoteKey(null);
  }, [editingNoteKey, serverNotes, collapseNotes]);

  const handleDeleteNote = confirmDeleteNote;

  // ── Save Changes ──

  // Reset every edit buffer back to the server state. Shared by the commit
  // handlers (after a successful save) and the exit-time discard prompt.
  const clearEditBuffers = useCallback(() => {
    setEditedTitle(null);
    setEditedDocument(null);
    setEditedCapabilities(null);
    setEditedNotes(null);
    setEditingNoteKey(null);
  }, []);

  // Navigate back without re-triggering the unsaved-changes prompt for edits a
  // commit handler has already dealt with. The bypass is scoped to this single
  // navigation: beforeRemove fires synchronously inside back(), so the microtask
  // reset lands after the guard has been honored on the success path (screen
  // unmounts anyway) and re-arms the guard if back() is ever a no-op.
  const leaveWithoutPrompt = useCallback(() => {
    bypassUnsavedPrompt.current = true;
    router.back();
    queueMicrotask(() => {
      bypassUnsavedPrompt.current = false;
    });
  }, [router]);

  // Single save routine reused by every commit action (Save for later / Mark as
  // done / completed Save). Persists body then notes sequentially; returns true
  // on success and false (surfacing an error) otherwise. It does NOT navigate,
  // toast, or change status — callers decide what happens after a clean save.
  const persistEdits = useCallback(async (): Promise<boolean> => {
    if (!artefactId) return false;

    const bodyChanged =
      editedTitle !== null || editedDocument !== null || editedCapabilities !== null;

    // Body and notes are independent sub-resources of the same artefact, saved
    // sequentially: body first, then notes. On body failure we short-circuit so
    // nothing is half-applied; each slice clears on its own success, so a retry
    // re-sends only what's still pending.
    if (bodyChanged) {
      const payload: { artefactId: string } & EditArtefactRequest = { artefactId };
      if (editedTitle !== null) payload.title = editedTitle;
      if (editedDocument !== null) {
        payload.composedDocument = editedDocument.map((s) => ({
          sectionId: s.sectionId,
          text: s.text,
        }));
      }
      if (editedCapabilities !== null) {
        payload.capabilities = editedCapabilities.map((c) => ({
          code: c.code,
          justification: c.justification ?? '',
        }));
      }

      const result = await dispatch(editArtefact(payload));
      if (!editArtefact.fulfilled.match(result)) {
        Alert.alert('Error', 'Failed to save changes. Please try again.');
        return false;
      }
      setEditedTitle(null);
      setEditedDocument(null);
      setEditedCapabilities(null);
    }

    if (editedNotes !== null) {
      const notes = editedNotes
        .filter((n) => n.text.trim().length > 0)
        .map((n) => ({ xid: n.xid, text: n.text }));

      const result = await dispatch(replaceNotes({ artefactId, notes }));
      if (!replaceNotes.fulfilled.match(result)) {
        Alert.alert(
          'Error',
          bodyChanged
            ? "Your entry was saved, but your notes couldn't be saved. Please try again."
            : "Your notes couldn't be saved. Please try again."
        );
        return false;
      }
      setEditedNotes(null);
    }

    return true;
  }, [artefactId, editedTitle, editedDocument, editedCapabilities, editedNotes, dispatch]);

  // ── Unsaved-changes prompt on navigate away ──

  // Leaving with unsaved edits is the single discard decision point (there's no
  // standing discard control). Offer the full three-way choice — save and leave,
  // drop the edits and leave, or stay — mirroring the canonical iOS unsaved-
  // changes dialog. The save label matches the entry's commit vocabulary:
  // "Save for later" in review, plain "Save" once completed.
  useEffect(() => {
    if (!hasChanges) return;

    const saveLabel = artefact?.status === ArtefactStatus.COMPLETED ? 'Save' : 'Save for later';

    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      // A commit handler is navigating away deliberately after saving — let it
      // through instead of re-prompting for edits it has already persisted.
      if (bypassUnsavedPrompt.current) return;
      e.preventDefault();
      Alert.alert('Unsaved changes', 'Keep your edits before leaving?', [
        {
          text: saveLabel,
          onPress: async () => {
            const ok = await persistEdits();
            if (ok) navigation.dispatch(e.data.action);
          },
        },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            clearEditBuffers();
            navigation.dispatch(e.data.action);
          },
        },
        { text: 'Keep editing', style: 'cancel' },
      ]);
    });

    return unsubscribe;
  }, [hasChanges, navigation, artefact?.status, persistEdits, clearEditBuffers]);

  // ── Existing handlers ──

  const toggleCapability = useCallback((code: string) => {
    setExpandedCapabilities((prev) => toggleInSet(prev, code));
  }, []);

  const toggleSection = useCallback((index: number) => {
    setExpandedSections((prev) => toggleInSet(prev, index));
  }, []);

  // Initialise goal selections when artefact loads in IN_REVIEW status
  useEffect(() => {
    if (artefact?.status === ArtefactStatus.IN_REVIEW && artefact.pdpGoals?.length) {
      // Defaults (opt-in: all goals untracked) come from the component so the
      // shape lives in one place next to GoalSelectionState.
      setGoalSelections((prev) => (prev.size > 0 ? prev : initGoalSelections(artefact.pdpGoals!)));
    }
  }, [artefact?.status, artefact?.pdpGoals]);

  const handleToggleGoal = useCallback((goalId: string) => {
    setGoalSelections((prev) => {
      const next = new Map(prev);
      const current = next.get(goalId);
      if (current) {
        next.set(goalId, { ...current, selected: !current.selected });
      }
      return next;
    });
  }, []);

  const handleToggleAction = useCallback((goalId: string, actionId: string) => {
    setGoalSelections((prev) => {
      const next = new Map(prev);
      const goal = next.get(goalId);
      if (goal) {
        const newActions = new Map(goal.actions);
        newActions.set(actionId, !newActions.get(actionId));
        next.set(goalId, { ...goal, actions: newActions });
      }
      return next;
    });
  }, []);

  const handleSetReviewDate = useCallback((goalId: string, date: Date | null) => {
    setGoalSelections((prev) => {
      const next = new Map(prev);
      const goal = next.get(goalId);
      if (goal) {
        next.set(goalId, { ...goal, reviewDate: date });
      }
      return next;
    });
  }, []);

  // ── Commit actions (Save for later / Mark as done / completed Save) ──

  // Save for later: persist edits (only if any) and return to the dashboard.
  // The entry is already IN_REVIEW on the server, so there's no status call —
  // and with nothing edited it's a pure navigation, no toast (a "Saved" with no
  // write would be a lie).
  const handleSaveForLater = useCallback(async () => {
    if (hasChanges) {
      const ok = await persistEdits();
      if (!ok) return;
      showToast('Saved');
    }
    leaveWithoutPrompt();
  }, [hasChanges, persistEdits, showToast, leaveWithoutPrompt]);

  // Completed entries stay editable; saving keeps them COMPLETED (no demotion)
  // and stays in place with a toast — only ever shown while there are edits.
  const handleSaveCompleted = useCallback(async () => {
    const ok = await persistEdits();
    if (ok) showToast('Saved');
  }, [persistEdits, showToast]);

  // The actual completion: persist pending edits first, then finalise (activates
  // PDP goals). Save-then-finalise is sequential — if the save fails the status
  // is untouched and edits stay buffered for retry; navigation waits for a
  // fulfilled finalise so a failure never strands the user on the dashboard.
  const runMarkAsDone = useCallback(async () => {
    setFinaliseConfirmVisible(false);
    if (!artefactId) return;

    if (hasChanges) {
      const ok = await persistEdits();
      if (!ok) return;
    }

    const pdpGoalSelections: PdpGoalSelection[] = Array.from(goalSelections.entries()).map(
      ([goalId, sel]) => ({
        goalId,
        selected: sel.selected,
        reviewDate: sel.selected && sel.reviewDate ? sel.reviewDate.toISOString() : null,
        actions: sel.selected
          ? Array.from(sel.actions.entries()).map(([actionId, selected]) => ({
              actionId,
              selected,
            }))
          : undefined,
      })
    );

    const result = await dispatch(finaliseArtefact({ artefactId, pdpGoalSelections }));
    if (finaliseArtefact.fulfilled.match(result)) {
      showToast('Marked as done');
      leaveWithoutPrompt();
    } else {
      // persistEdits already committed, so any edits are safe — only the
      // finalise failed. Say so, and leave the user on the (still IN_REVIEW)
      // entry to retry.
      Alert.alert(
        'Error',
        "Couldn't mark this entry as done. Your changes are saved — please try again."
      );
    }
  }, [
    artefactId,
    hasChanges,
    persistEdits,
    dispatch,
    goalSelections,
    showToast,
    leaveWithoutPrompt,
  ]);

  // Mark as done: validate first, then confirm only when there's a real side
  // effect to review (PDP goals will activate); otherwise go straight through.
  const handleMarkAsDone = useCallback(() => {
    if (!artefactId) return;

    const selectedGoals = Array.from(goalSelections.entries()).filter(([, sel]) => sel.selected);
    const missingDates = selectedGoals.some(([, sel]) => !sel.reviewDate);
    if (missingDates) {
      setReviewDateErrorVisible(true);
      return;
    }

    if (selectedGoals.length > 0) {
      setFinaliseConfirmVisible(true);
      return;
    }

    runMarkAsDone();
  }, [artefactId, goalSelections, runMarkAsDone]);

  // ── Archive ──

  const hasActivePdpGoals = useMemo(() => {
    if (!artefact?.pdpGoals) return false;
    return artefact.pdpGoals.some(
      (g) => g.status === PdpGoalStatus.STARTED || g.status === PdpGoalStatus.COMPLETED
    );
  }, [artefact?.pdpGoals]);

  const handleArchive = useCallback(() => {
    if (!artefactId) return;
    // Opened from the action-sheet callback: defer until the sheet's dismissal
    // animation finishes, so the RN Modal doesn't race the native dismissal on iOS.
    InteractionManager.runAfterInteractions(() => setArchiveDialogVisible(true));
  }, [artefactId]);

  const handleConfirmArchive = useCallback(
    (archivePdpGoals: boolean) => {
      setArchiveDialogVisible(false);
      if (!artefactId) return;
      dispatch(
        updateArtefactStatus({ artefactId, status: ArtefactStatus.ARCHIVED, archivePdpGoals })
      );
    },
    [artefactId, dispatch]
  );

  // ── Delete Entry ──

  const handleDelete = useCallback(() => {
    if (!artefactId) return;
    // Deferred for the same iOS action-sheet → Modal race as handleArchive.
    InteractionManager.runAfterInteractions(() => setDeleteDialogVisible(true));
  }, [artefactId]);

  const handleConfirmDelete = useCallback(() => {
    setDeleteDialogVisible(false);
    if (!artefactId) return;
    dispatch(deleteArtefact({ artefactId }))
      .unwrap()
      .then(() => leaveWithoutPrompt())
      .catch(() => Alert.alert('Error', 'Failed to delete entry. Please try again.'));
  }, [artefactId, dispatch, leaveWithoutPrompt]);

  // ── Duplicate to Review ──

  const handleClone = useCallback(() => {
    if (!artefactId) return;
    Alert.alert(
      'Duplicate Entry',
      'Duplicate this entry and all its data into a new artefact in review?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Duplicate',
          onPress: async () => {
            const result = await dispatch(duplicateToReview({ artefactId }));
            if (duplicateToReview.fulfilled.match(result)) {
              router.replace(`/(entry)/${result.payload.id}`);
            }
          },
        },
      ]
    );
  }, [artefactId, dispatch, router]);

  // ── Header overflow menu ──

  const showHeaderMenu =
    artefact?.status !== undefined && artefact?.status !== ArtefactStatus.IN_CONVERSATION;

  const handleShowMenu = useCallback(() => {
    if (artefact?.status === ArtefactStatus.COMPLETED) {
      showActionSheetWithOptions(
        {
          options: ['Archive', 'Duplicate', 'Delete', 'Cancel'],
          destructiveButtonIndex: 2,
          cancelButtonIndex: 3,
        },
        (index) => {
          if (index === 0) handleArchive();
          if (index === 1) handleClone();
          if (index === 2) handleDelete();
        }
      );
    } else if (artefact?.status === ArtefactStatus.ARCHIVED) {
      showActionSheetWithOptions(
        {
          options: ['Delete', 'Cancel'],
          destructiveButtonIndex: 0,
          cancelButtonIndex: 1,
        },
        (index) => {
          if (index === 0) handleDelete();
        }
      );
    } else if (artefact?.status !== undefined) {
      showActionSheetWithOptions(
        {
          options: ['Archive', 'Delete', 'Cancel'],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 2,
        },
        (index) => {
          if (index === 0) handleArchive();
          if (index === 1) handleDelete();
        }
      );
    }
  }, [artefact?.status, showActionSheetWithOptions, handleArchive, handleClone, handleDelete]);

  useEffect(() => {
    if (!artefact) return;
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          {canExport && (
            <Pressable
              onPress={() => setExportSheetVisible(true)}
              hitSlop={8}
              style={styles.headerButton}
            >
              <Feather name="share" size={20} color={colors.text} />
            </Pressable>
          )}
          {showHeaderMenu && (
            <Pressable
              onPress={updatingStatus ? undefined : handleShowMenu}
              hitSlop={8}
              disabled={updatingStatus}
              style={[styles.headerButton, canExport && styles.headerButtonSpaced]}
            >
              <Ionicons
                name="ellipsis-vertical"
                size={22}
                color={updatingStatus ? colors.textSecondary : colors.text}
              />
            </Pressable>
          )}
        </View>
      ),
    });
  }, [
    artefact,
    canExport,
    showHeaderMenu,
    navigation,
    colors.text,
    colors.textSecondary,
    handleShowMenu,
    updatingStatus,
  ]);

  const loading = entityStatus === 'loading';

  if (!artefact || loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const statusMeta = getArtefactStatusMeta(artefact.status);
  const canMarkAsFinal = artefact.status === ArtefactStatus.IN_REVIEW;
  const isArchivedEntry = artefact.status === ArtefactStatus.ARCHIVED;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={{ paddingBottom: insets.bottom + 8 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.section}>
          <EditableTitle value={displayTitle} onChange={handleTitleChange} editable={isEditable} />
          {/* Metadata line — type and date as quiet secondary text; the actionable
              review state lives in the banner below, not here (MOB-064/065). A
              terminal status word (Completed / Archived) is appended only when
              there's no banner to carry it. */}
          <Text style={[styles.metaLine, { color: colors.textSecondary }]}>
            {artefact.artefactTypeLabel ? `${artefact.artefactTypeLabel} · ` : ''}
            {`Created ${formatShortDate(artefact.createdAt)}`}
            {statusMeta.word && (
              <Text style={statusMeta.tone === 'success' ? { color: colors.success } : undefined}>
                {statusMeta.tone === 'success'
                  ? `  ·  ✓ ${statusMeta.word}`
                  : `  ·  ${statusMeta.word}`}
              </Text>
            )}
          </Text>
        </View>

        {/* Soft "needs your input" advisory — shows only in review with unmet sections */}
        <ArtefactAdvisoryBanner artefactId={artefactId} />

        {/* Entry document — the canonical FourteenFish-shaped output, editable in
            place while in review. Single source of truth for the entry body. */}
        {displayDocument.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Entry</Text>
            {displayDocument.map((field, index) => (
              <EditableReflectionSection
                key={field.sectionId}
                section={{ title: field.label, text: field.text }}
                editable={isEditable}
                expanded={expandedSections.has(index)}
                onToggleExpand={() => toggleSection(index)}
                onEdit={() => setEditingSectionIndex(index)}
              />
            ))}
          </View>
        )}

        {/* Capabilities — only the trainee's justification is shown (the evidence
            quote is internal provenance). Editable in place, mirroring the entry
            sections: justification text is the trainee's paste-ready own words. */}
        {displayCapabilities.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Capabilities</Text>
            {displayCapabilities.map((cap) => (
              <EditableReflectionSection
                key={cap.code}
                section={{ title: cap.name, text: cap.justification ?? '' }}
                editable={isEditable}
                expanded={expandedCapabilities.has(cap.code)}
                onToggleExpand={() => toggleCapability(cap.code)}
                onEdit={() => setEditingCapabilityCode(cap.code)}
                emptyHint={`Tap to add your justification for ${cap.name}`}
              />
            ))}
          </View>
        )}

        {/* Full Screen Section Editor — entry sections */}
        <FullScreenSectionEditor
          visible={editingSectionIndex !== null}
          sectionTitle={
            editingSectionIndex !== null ? (displayDocument[editingSectionIndex]?.label ?? '') : ''
          }
          sectionText={
            editingSectionIndex !== null ? (displayDocument[editingSectionIndex]?.text ?? '') : ''
          }
          onSave={handleSectionSave}
          onClose={() => setEditingSectionIndex(null)}
        />

        {/* Full Screen Section Editor — capability justifications */}
        <FullScreenSectionEditor
          visible={editingCapabilityCode !== null}
          sectionTitle={editingCapability?.name ?? ''}
          sectionText={editingCapability?.justification ?? ''}
          onSave={handleCapabilitySave}
          onClose={() => setEditingCapabilityCode(null)}
        />

        {/* PDP Goals */}
        {artefact.pdpGoals &&
          (canMarkAsFinal || isArchivedEntry
            ? artefact.pdpGoals.length > 0
            : artefact.pdpGoals.some((g) => g.status !== PdpGoalStatus.ARCHIVED)) && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>PDP Goals</Text>
              {canMarkAsFinal ? (
                <>
                  {/* Gentle, non-blocking nudge for the opt-in model (MOB-078):
                      explains why goals start untracked and invites tracking,
                      without gating "Mark as done". */}
                  <Text style={[styles.pdpHint, { color: colors.textSecondary }]}>
                    Optional — track any goals you&rsquo;d like to follow up later.
                  </Text>
                  <PdpGoalSelector
                    goals={artefact.pdpGoals}
                    selections={goalSelections}
                    onToggleGoal={handleToggleGoal}
                    onToggleAction={handleToggleAction}
                    onSetReviewDate={handleSetReviewDate}
                    disabled={updatingStatus}
                  />
                </>
              ) : (
                artefact.pdpGoals
                  .filter((goal) => isArchivedEntry || goal.status !== PdpGoalStatus.ARCHIVED)
                  .map((goal) => {
                    const goalStatus = getPdpGoalStatusDisplay(goal.status);
                    const isCompleted = goal.status === PdpGoalStatus.COMPLETED;
                    const visibleActions = isArchivedEntry
                      ? goal.actions
                      : goal.actions.filter((a) => a.status !== PdpGoalStatus.ARCHIVED);

                    return (
                      <View
                        key={goal.id}
                        style={[
                          styles.pdpGoalCard,
                          { backgroundColor: colors.surface },
                          isCompleted && {
                            borderLeftWidth: 4,
                            borderLeftColor: colors.success,
                            opacity: 0.55,
                          },
                        ]}
                      >
                        <View style={styles.pdpGoalHeader}>
                          <Text style={[styles.cardTitle, { color: colors.text }]}>
                            {goal.goal}
                          </Text>
                          <StatusPill label={goalStatus.label} variant={goalStatus.variant} />
                        </View>

                        {goal.reviewDate && (
                          <View style={styles.pdpReviewDateRow}>
                            <Ionicons
                              name="calendar-outline"
                              size={14}
                              color={colors.textSecondary}
                            />
                            <Text
                              style={[styles.pdpReviewDateText, { color: colors.textSecondary }]}
                            >
                              Review by {formatGoalDate(goal.reviewDate)}
                            </Text>
                          </View>
                        )}

                        <View style={styles.pdpActions}>
                          {visibleActions.map((action, actionIndex) => {
                            const actionActive =
                              action.status === PdpGoalStatus.STARTED ||
                              action.status === PdpGoalStatus.COMPLETED;

                            return (
                              <View
                                key={action.id}
                                style={[
                                  styles.pdpRow,
                                  actionIndex === visibleActions.length - 1 && styles.pdpRowLast,
                                ]}
                              >
                                {actionActive ? (
                                  <View
                                    style={[
                                      styles.pdpActionCheckbox,
                                      {
                                        borderColor: isCompleted ? colors.success : colors.primary,
                                        backgroundColor: isCompleted
                                          ? colors.success
                                          : colors.primary,
                                      },
                                    ]}
                                  >
                                    <Feather name="check" size={14} color="#ffffff" />
                                  </View>
                                ) : (
                                  <View
                                    style={[
                                      styles.pdpActionCheckbox,
                                      {
                                        borderColor: colors.textSecondary,
                                        backgroundColor: 'transparent',
                                      },
                                    ]}
                                  />
                                )}
                                <Text style={[styles.pdpText, { color: colors.text }]}>
                                  {action.action}
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    );
                  })
              )}
            </View>
          )}

        {/* Notes — user-authored addenda, editable in any non-archived state
            (read-only when archived). Stays visible while editing, unlike the
            actions below. */}
        {showNotes && (
          <View style={styles.section}>
            <NotesSection
              notes={displayNotes}
              editable={notesEditable}
              onAddNote={handleAddNote}
              onEditNote={handleEditNote}
              onDeleteNote={handleDeleteNote}
            />
          </View>
        )}

        {/* Full Screen Section Editor — notes (titleless, freeform) */}
        <FullScreenSectionEditor
          visible={editingNoteKey !== null}
          sectionTitle="Note"
          sectionText={editingNote?.text ?? ''}
          onSave={handleNoteSave}
          onClose={handleNoteEditorClose}
          hideTitle
          contentPlaceholder="Write your note…"
        />

        {/* Your rating — hidden until the artefact has AI output to rate */}
        {!hasChanges && artefact.status !== ArtefactStatus.IN_CONVERSATION && (
          <View style={styles.section}>
            {artefact.review ? (
              <Pressable
                style={[styles.reviewCard, { backgroundColor: colors.surface }]}
                onPress={() => setReviewSheetVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Edit your rating"
              >
                <View style={styles.reviewHeader}>
                  <View style={styles.reviewPromptRow}>
                    <Ionicons name="sparkles" size={14} color={AI_REASONING_COLOR} />
                    <Text style={[styles.reviewHeaderText, { color: colors.textSecondary }]}>
                      Your rating of the AI
                    </Text>
                  </View>
                  <Feather name="edit-2" size={15} color={colors.textSecondary} />
                </View>
                <StarRating value={artefact.review.rating} readOnly size={22} />
                {artefact.review.comment ? (
                  <Text
                    style={[styles.reviewComment, { color: colors.text }]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {artefact.review.comment}
                  </Text>
                ) : null}
                <Text style={[styles.reviewMeta, { color: colors.textSecondary }]}>
                  Rated {formatTimeAgo(artefact.review.updatedAt)}
                </Text>
              </Pressable>
            ) : (
              <View style={[styles.reviewCard, { backgroundColor: colors.surface }]}>
                <View style={styles.reviewPromptRow}>
                  <Ionicons name="sparkles" size={15} color={AI_REASONING_COLOR} />
                  <Text style={[styles.reviewPrompt, { color: colors.text }]}>
                    How well did the AI capture this entry?
                  </Text>
                </View>
                <Text style={[styles.reviewHelper, { color: colors.textSecondary }]}>
                  Your feedback on the AI&rsquo;s response. Private to you - it helps us improve.
                </Text>
                <View style={styles.reviewEmptyStars}>
                  <StarRating
                    value={0}
                    size={32}
                    gap={12}
                    onChange={(rating) => {
                      setReviewSeedRating(rating);
                      setReviewSheetVisible(true);
                    }}
                  />
                </View>
              </View>
            )}
          </View>
        )}

        {/* Actions — hidden when there are unsaved changes */}
        {!hasChanges && (
          <>
            {/* Navigation links */}
            <View style={styles.section}>
              <View style={[styles.navGroup, { backgroundColor: colors.surface }]}>
                <Pressable
                  onPress={() => router.push(`/(entry)/conversation/${artefact.conversation.id}`)}
                  style={styles.navRow}
                >
                  <Ionicons name="chatbubble-outline" size={18} color={colors.textSecondary} />
                  <Text style={[styles.navRowLabel, { color: colors.text }]}>
                    View conversation
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                </Pressable>
                {artefact.versionCount > 0 && (
                  <>
                    <View style={[styles.navDivider, { backgroundColor: colors.border }]} />
                    <Pressable
                      onPress={() => router.push(`/(entry)/versions/${artefact.id}`)}
                      style={styles.navRow}
                    >
                      <Feather name="clock" size={18} color={colors.textSecondary} />
                      <View style={styles.navRowText}>
                        <Text style={[styles.navRowTitle, { color: colors.text }]}>
                          Version history
                        </Text>
                        <Text style={[styles.navRowSubtitle, { color: colors.textSecondary }]}>
                          See and restore previous versions
                        </Text>
                      </View>
                      <View style={styles.navRowRight}>
                        <Text style={[styles.navBadge, { color: colors.textSecondary }]}>
                          {artefact.versionCount}
                        </Text>
                        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                      </View>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* Status-driven commit bar — the single save affordance (MOB-086/087/089).
          Renders nothing outside review/completed-with-edits. */}
      <EntryActionBar
        status={artefact.status}
        hasChanges={hasChanges}
        busy={saving || updatingStatus}
        onSaveForLater={handleSaveForLater}
        onMarkAsDone={handleMarkAsDone}
        onSaveCompleted={handleSaveCompleted}
      />

      {canExport && (
        <ExportSheet
          visible={exportSheetVisible}
          onClose={() => setExportSheetVisible(false)}
          artefact={artefact}
        />
      )}
      <ReviewSheet
        visible={reviewSheetVisible}
        onClose={() => setReviewSheetVisible(false)}
        artefact={artefact}
        initialRating={reviewSeedRating}
      />
      <AppDialog
        visible={reviewDateErrorVisible}
        tone="error"
        icon="warning"
        title="Add a review date"
        message="Set a review date for each goal you're tracking before you mark this entry as done."
        buttons={[{ label: 'Got it', onPress: () => setReviewDateErrorVisible(false) }]}
        onRequestClose={() => setReviewDateErrorVisible(false)}
      />
      <AppDialog
        visible={finaliseConfirmVisible}
        icon={null}
        title="Mark this entry as done?"
        message="It'll move to your completed entries and set up the PDP goals you've kept. You can still edit it afterwards."
        buttons={[
          { label: 'Mark as done', onPress: runMarkAsDone, variant: 'primary' },
          {
            label: 'Cancel',
            onPress: () => setFinaliseConfirmVisible(false),
            variant: 'secondary',
          },
        ]}
        onRequestClose={() => setFinaliseConfirmVisible(false)}
      />
      <AppDialog
        visible={archiveDialogVisible}
        tone="info"
        icon="archive-outline"
        title="Archive entry"
        message={
          hasActivePdpGoals
            ? 'This entry will be hidden — you can restore it anytime. It has active PDP goals: keep them, or archive them too?'
            : 'This entry will be hidden. You can restore it anytime from your archive.'
        }
        buttons={
          hasActivePdpGoals
            ? [
                {
                  label: 'Keep goals',
                  onPress: () => handleConfirmArchive(false),
                  variant: 'primary',
                },
                {
                  label: 'Archive & remove goals',
                  onPress: () => handleConfirmArchive(true),
                  variant: 'destructive',
                },
                {
                  label: 'Cancel',
                  onPress: () => setArchiveDialogVisible(false),
                  variant: 'secondary',
                },
              ]
            : [
                {
                  label: 'Archive',
                  onPress: () => handleConfirmArchive(false),
                  variant: 'primary',
                },
                {
                  label: 'Cancel',
                  onPress: () => setArchiveDialogVisible(false),
                  variant: 'secondary',
                },
              ]
        }
        onRequestClose={() => setArchiveDialogVisible(false)}
      />
      <AppDialog
        visible={deleteDialogVisible}
        tone="error"
        icon="trash-outline"
        title="Delete entry"
        message="This permanently deletes the entry, its conversation and linked goals. This can't be undone."
        buttons={[
          { label: 'Delete', onPress: handleConfirmDelete, variant: 'destructive' },
          { label: 'Cancel', onPress: () => setDeleteDialogVisible(false), variant: 'secondary' },
        ]}
        onRequestClose={() => setDeleteDialogVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonSpaced: {
    marginLeft: 8,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 10,
  },
  metaLine: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 2,
  },
  pdpHint: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: -2,
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  pdpGoalCard: {
    borderRadius: 12,
    padding: 14,
    overflow: 'hidden',
  },
  pdpActions: {
    marginTop: 8,
    marginLeft: 4,
  },
  pdpRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150, 150, 150, 0.2)',
  },
  pdpRowLast: {
    borderBottomWidth: 0,
  },
  pdpText: {
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
    flexShrink: 1,
  },
  pdpGoalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  pdpReviewDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  pdpReviewDateText: {
    fontSize: 13,
  },
  pdpActionCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  reviewCard: {
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reviewPromptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  reviewPrompt: {
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
  reviewHelper: {
    fontSize: 12,
    lineHeight: 17,
  },
  reviewHeaderText: {
    fontSize: 13,
    fontWeight: '600',
  },
  reviewEmptyStars: {
    alignSelf: 'flex-start',
  },
  reviewComment: {
    fontSize: 14,
    lineHeight: 20,
  },
  reviewMeta: {
    fontSize: 12,
  },
  navGroup: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
  },
  navRowLabel: {
    fontSize: 15,
    flex: 1,
  },
  // Version-history row uses a title + subtitle stack instead of a single label.
  navRowText: {
    flex: 1,
    gap: 2,
  },
  navRowTitle: {
    fontSize: 15,
  },
  navRowSubtitle: {
    fontSize: 12,
  },
  navRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  navBadge: {
    fontSize: 14,
  },
  navDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 42,
  },
});
