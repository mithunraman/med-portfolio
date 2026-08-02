import { formatDate } from '@/utils/formatDate';
import { getPdpGoalStatusDisplay } from '@/utils/pdpGoalStatus';
import type { Artefact } from '@acme/shared';
import { PdpGoalStatus } from '@acme/shared';
import * as Sentry from '@sentry/react-native';
import * as Clipboard from 'expo-clipboard';
import { File } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import { logger } from '@/utils/logger';
import { buildExportHtml } from './buildExportHtml';

const exportLogger = logger.createScope('Export');

/**
 * Filename for the shared PDF.
 *
 * Whitespace is collapsed to hyphens rather than preserved: the name is
 * interpolated into a `file:///` URI (expo-file-system's `File` takes URIs, not
 * paths), and a raw space makes that URI malformed. The share sheet still opens
 * - it does not resolve the item eagerly - but the receiving app's extension
 * cannot read the file and hangs, with no error surfacing back to us.
 */
function buildFileName(artefact: Artefact): string {
  const type = artefact.artefactTypeLabel || 'Entry';
  const title = artefact.title || 'Untitled';
  const sanitized = `${type} - ${title}`
    .replace(/[^a-zA-Z0-9 \-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
    .replace(/ /g, '-')
    // Collapse the runs of hyphens the substitution can create (" - " → "---").
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${sanitized || 'Entry'}.pdf`;
}

function exportContentSummary(artefact: Artefact) {
  return {
    hasReflection: !!artefact.composedDocument?.some((s) => s.text),
    hasCapabilities: !!artefact.capabilities?.some((c) => c.name || c.justification),
    hasPdpGoals: !!artefact.pdpGoals?.some(
      (g) => g.status !== PdpGoalStatus.ARCHIVED && g.status !== PdpGoalStatus.DELETED && g.goal
    ),
    hasNotes: !!artefact.notes?.some((n) => n.text.trim()),
  };
}

function buildPlainText(artefact: Artefact): string {
  const lines: string[] = [];

  lines.push(artefact.title || 'Untitled Entry');
  lines.push('='.repeat(40));

  if (artefact.artefactTypeLabel) {
    lines.push(`Type: ${artefact.artefactTypeLabel}`);
  }
  lines.push(`Date: ${formatDate(artefact.createdAt)}`);
  lines.push('');

  const fields = artefact.composedDocument?.filter((s) => s.text);
  if (fields?.length) {
    lines.push('ENTRY');
    lines.push('-'.repeat(20));
    for (const s of fields) {
      lines.push(`\n${s.label}`);
      lines.push(s.text);
    }
    lines.push('');
  }

  const caps = artefact.capabilities?.filter((c) => c.name || c.justification);
  if (caps?.length) {
    lines.push('CAPABILITIES');
    lines.push('-'.repeat(20));
    for (const c of caps) {
      lines.push(`\n${c.name}`);
      lines.push(c.justification);
    }
    lines.push('');
  }

  const nonArchivedGoals = artefact.pdpGoals?.filter(
    (g) => g.status !== PdpGoalStatus.ARCHIVED && g.status !== PdpGoalStatus.DELETED && g.goal
  );
  if (nonArchivedGoals?.length) {
    lines.push('PDP GOALS');
    lines.push('-'.repeat(20));
    for (const g of nonArchivedGoals) {
      lines.push(`\n• ${g.goal} [${getPdpGoalStatusDisplay(g.status).label}]`);
      if (g.completionReview) {
        lines.push(`  Reflection: ${g.completionReview}`);
      }
      for (const a of g.actions.filter(
        (a) => a.status !== PdpGoalStatus.ARCHIVED && a.status !== PdpGoalStatus.DELETED
      )) {
        lines.push(`  - ${a.action} [${getPdpGoalStatusDisplay(a.status).label}]`);
        if (a.completionReview) {
          lines.push(`    Reflection: ${a.completionReview}`);
        }
      }
    }
    lines.push('');
  }

  const notes = artefact.notes?.filter((n) => n.text.trim());
  if (notes?.length) {
    // Newest-first, matching the on-screen NotesSection ordering.
    const sorted = [...notes].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    lines.push('NOTES');
    lines.push('-'.repeat(20));
    for (const n of sorted) {
      lines.push(`\n${n.text}`);
      lines.push(formatDate(n.createdAt));
    }
  }

  return lines.join('\n');
}

export async function shareAsPdf(artefact: Artefact): Promise<void> {
  try {
    const html = buildExportHtml(artefact);
    const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });
    const fileName = buildFileName(artefact);
    const dir = uri.substring(0, uri.lastIndexOf('/'));
    const tempFile = new File(uri);
    const dest = new File(`${dir}/${fileName}`);
    if (dest.exists) {
      dest.delete();
    }
    tempFile.move(dest);
    // Share `dest.uri`, not `tempFile.uri` - `dest` points at the destination by
    // construction, so this holds whether or not `move()` mutates the receiver.
    await Sharing.shareAsync(dest.uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: 'Share Portfolio Entry',
    });
    exportLogger.info('PDF shared', {
      artefactId: artefact.id,
      ...exportContentSummary(artefact),
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: 'export', format: 'pdf' },
      extra: { artefactId: artefact.id, ...exportContentSummary(artefact) },
    });
    Alert.alert('Export failed', 'Unable to generate PDF. Please try again.');
  }
}

export async function copyAsText(artefact: Artefact): Promise<void> {
  try {
    const text = buildPlainText(artefact);
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', 'Entry copied to clipboard.');
    exportLogger.info('Text copied', {
      artefactId: artefact.id,
      ...exportContentSummary(artefact),
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: 'export', format: 'text' },
      extra: { artefactId: artefact.id, ...exportContentSummary(artefact) },
    });
    Alert.alert('Copy failed', 'Unable to copy text. Please try again.');
  }
}
