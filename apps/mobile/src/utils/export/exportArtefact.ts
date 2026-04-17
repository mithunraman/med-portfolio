import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { Alert } from 'react-native';
import type { Artefact } from '@acme/shared';
import { PdpGoalStatus } from '@acme/shared';
import { formatDate } from '@/utils/formatDate';
import { getPdpGoalStatusDisplay } from '@/utils/pdpGoalStatus';
import { buildExportHtml } from './buildExportHtml';

function buildPlainText(artefact: Artefact): string {
  const lines: string[] = [];

  lines.push(artefact.title || 'Untitled Entry');
  lines.push('='.repeat(40));

  if (artefact.artefactTypeLabel) {
    lines.push(`Type: ${artefact.artefactTypeLabel}`);
  }
  lines.push(`Date: ${formatDate(artefact.createdAt)}`);
  lines.push('');

  const reflections = artefact.reflection?.filter((s) => s.text);
  if (reflections?.length) {
    lines.push('REFLECTION');
    lines.push('-'.repeat(20));
    for (const s of reflections) {
      lines.push(`\n${s.title}`);
      lines.push(s.text);
    }
    lines.push('');
  }

  const caps = artefact.capabilities?.filter((c) => c.name || c.evidence);
  if (caps?.length) {
    lines.push('CAPABILITIES');
    lines.push('-'.repeat(20));
    for (const c of caps) {
      lines.push(`\n${c.name}`);
      lines.push(`Evidence: ${c.evidence}`);
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
      for (const a of g.actions.filter((a) => a.status !== PdpGoalStatus.ARCHIVED && a.status !== PdpGoalStatus.DELETED)) {
        lines.push(`  - ${a.action} [${getPdpGoalStatusDisplay(a.status).label}]`);
        if (a.completionReview) {
          lines.push(`    Reflection: ${a.completionReview}`);
        }
      }
    }
  }

  return lines.join('\n');
}

export async function shareAsPdf(artefact: Artefact): Promise<void> {
  const html = buildExportHtml(artefact);
  const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: 'Share Portfolio Entry',
  });
}

export async function copyAsText(artefact: Artefact): Promise<void> {
  const text = buildPlainText(artefact);
  await Clipboard.setStringAsync(text);
  Alert.alert('Copied', 'Entry copied to clipboard.');
}
