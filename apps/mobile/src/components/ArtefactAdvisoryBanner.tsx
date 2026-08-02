import { useAppDispatch, useAppSelector } from '@/hooks';
import { dismissAdvisory, selectArtefactById, selectIsAdvisoryDismissed } from '@/store';
import { useTheme } from '@/theme';
import { formatList, getArtefactAdvisory } from '@/utils/artefactAdvisory';
import { logger } from '@/utils/logger';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const log = logger.createScope('AdvisoryBanner');

interface Props {
  artefactId: string;
}

type IoniconName = keyof typeof Ionicons.glyphMap;

interface AdvisoryCardProps {
  /** Severity accent. `info` (blue) for calm guidance; `warning` (amber) for an
   *  actionable gap. Both resolve to theme tokens, so they adapt light/dark. */
  tone: 'info' | 'warning';
  icon: IoniconName;
  title: string;
  body: string;
  /**
   * When true, the card is a polite live region - its appearance is gently
   * announced by the screen reader. Use for cards that show conditionally (a
   * nudge), NOT for persistent content that's read in normal order on every
   * visit (announcing that on each mount/focus is noise). No `alert` role: these
   * are guidance, not transient time-sensitive messages.
   */
  announce?: boolean;
  /** When provided, the card shows a close button and is dismissible. */
  onDismiss?: () => void;
}

/** One guidance card. Presentational - visibility is decided by the parent. */
function AdvisoryCard({ tone, icon, title, body, announce, onDismiss }: AdvisoryCardProps) {
  const { colors } = useTheme();
  const accent = tone === 'info' ? colors.info : colors.warning;
  const background = tone === 'info' ? colors.infoBackground : colors.warningBackground;
  const border = tone === 'info' ? colors.infoBorder : colors.warningBorder;
  return (
    <View
      style={[styles.banner, { backgroundColor: background, borderColor: border }]}
      accessibilityLiveRegion={announce ? 'polite' : 'none'}
    >
      <Ionicons name={icon} size={18} color={accent} style={styles.icon} />
      <View style={styles.textContainer}>
        <Text style={[styles.title, { color: accent }]}>{title}</Text>
        <Text style={[styles.body, { color: colors.text }]}>{body}</Text>
      </View>
      {onDismiss && (
        <TouchableOpacity
          onPress={onDismiss}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Dismiss"
        >
          <Ionicons name="close" size={18} color={accent} />
        </TouchableOpacity>
      )}
    </View>
  );
}

/**
 * Guidance for the artefact detail screen while an entry is IN_REVIEW
 * (MOB-064/065). Two independent, stackable cards:
 *
 *  1. "Needs review" - a calm, non-dismissible safety prompt to check the AI's
 *     draft. Always shown in review; it's the primary purpose of the state.
 *  2. "Some sections need more detail" - a dismissible nudge naming the thin
 *     sections, shown only when required sections are still unmet.
 *
 * Self-contained: derives its own visibility from the artefact (status +
 * completeness) and session-scoped dismissal. Renders nothing outside review.
 */
export function ArtefactAdvisoryBanner({ artefactId }: Props) {
  const dispatch = useAppDispatch();
  const artefact = useAppSelector((state) => selectArtefactById(state, artefactId));
  const dismissed = useAppSelector((state) => selectIsAdvisoryDismissed(state, artefactId));

  if (!artefact) return null;

  const { inReview, incomplete, labels } = getArtefactAdvisory(artefact);
  if (!inReview) return null;

  // Specific copy when we know which sections are thin, else a generic nudge
  // (the graded verdict fired but no per-section gaps were recorded).
  const gapsBody =
    labels.length > 0
      ? `${formatList(labels)} could use more detail. Edit a section below to add to it.`
      : 'This entry isn’t ARCP-ready yet. Add more detail below before submitting.';

  const showGaps = incomplete && !dismissed;

  const handleDismiss = () => {
    log.info('Advisory dismissed', { artefactId });
    dispatch(dismissAdvisory(artefactId));
  };

  return (
    <>
      <AdvisoryCard
        tone="info"
        icon="information-circle-outline"
        title="Needs review"
        body="Your draft is ready. Please check each section is correct before you submit."
      />
      {showGaps && (
        <AdvisoryCard
          tone="warning"
          icon="warning-outline"
          title="Some sections need more detail"
          body={gapsBody}
          announce
          onDismiss={handleDismiss}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  icon: {
    marginTop: 1,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
  },
});
