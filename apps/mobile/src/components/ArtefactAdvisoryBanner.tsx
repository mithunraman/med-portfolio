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

/**
 * Soft, advisory banner shown on the artefact detail screen when the analysis left
 * required sections thin. It names the sections and points at the inline editing
 * already on screen. Self-contained: derives its own visibility from the artefact
 * (status + completeness) and session-scoped dismissal — the screen mounts it with
 * just the id. Renders nothing when not applicable.
 */
export function ArtefactAdvisoryBanner({ artefactId }: Props) {
  const dispatch = useAppDispatch();
  const { colors } = useTheme();
  const artefact = useAppSelector((state) => selectArtefactById(state, artefactId));
  const dismissed = useAppSelector((state) => selectIsAdvisoryDismissed(state, artefactId));

  if (!artefact) return null;

  const { incomplete, labels } = getArtefactAdvisory(artefact);
  if (!incomplete || dismissed) return null;

  // Specific copy when we know which sections are thin; otherwise a generic nudge
  // (e.g. the graded verdict fired but no per-section gaps were recorded).
  const body =
    labels.length > 0
      ? `${formatList(labels)} could use more detail. Tap a section below to add to it.`
      : 'This entry isn’t ARCP-ready yet. Add more detail below before submitting.';

  const handleDismiss = () => {
    log.info('Advisory dismissed', { artefactId });
    dispatch(dismissAdvisory(artefactId));
  };

  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: colors.warningBackground, borderColor: colors.warningBorder },
      ]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Ionicons
        name="information-circle-outline"
        size={18}
        color={colors.warning}
        style={styles.icon}
      />
      <View style={styles.textContainer}>
        <Text style={[styles.title, { color: colors.warning }]}>Before you submit</Text>
        <Text style={[styles.body, { color: colors.text }]}>{body}</Text>
      </View>
      <TouchableOpacity
        onPress={handleDismiss}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel="Dismiss"
      >
        <Ionicons name="close" size={18} color={colors.warning} />
      </TouchableOpacity>
    </View>
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
