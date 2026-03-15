import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { Alert } from 'react-native';
import type { Artefact } from '@acme/shared';
import { buildExportHtml } from './buildExportHtml';

function buildPlainText(artefact: Artefact): string {
  const lines: string[] = [];

  lines.push(artefact.title || 'Untitled Entry');
  lines.push('='.repeat(40));

  if (artefact.artefactTypeLabel) {
    lines.push(`Type: ${artefact.artefactTypeLabel}`);
  }
  lines.push(`Date: ${new Date(artefact.createdAt).toLocaleDateString('en-GB')}`);
  lines.push('');

  if (artefact.reflection?.length) {
    lines.push('REFLECTION');
    lines.push('-'.repeat(20));
    for (const s of artefact.reflection) {
      lines.push(`\n${s.title}`);
      lines.push(s.text);
    }
    lines.push('');
  }

  if (artefact.capabilities?.length) {
    lines.push('CAPABILITIES');
    lines.push('-'.repeat(20));
    for (const c of artefact.capabilities) {
      lines.push(`\n[${c.code}] ${c.name}`);
      lines.push(`Evidence: ${c.evidence}`);
    }
    lines.push('');
  }

  if (artefact.pdpGoals?.length) {
    lines.push('PDP GOALS');
    lines.push('-'.repeat(20));
    for (const g of artefact.pdpGoals) {
      lines.push(`\n• ${g.goal}`);
      for (const a of g.actions) {
        lines.push(`  - ${a.action}`);
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
