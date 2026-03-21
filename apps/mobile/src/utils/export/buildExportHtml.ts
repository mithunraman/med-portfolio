import type { Artefact } from '@acme/shared';
import { PdpGoalStatus } from '@acme/shared';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function goalStatusLabel(status: PdpGoalStatus): string {
  switch (status) {
    case PdpGoalStatus.NOT_STARTED:
      return 'Not started';
    case PdpGoalStatus.STARTED:
      return 'In progress';
    case PdpGoalStatus.COMPLETED:
      return 'Completed';
    case PdpGoalStatus.ARCHIVED:
      return 'Archived';
    default:
      return 'Unknown';
  }
}

function buildReflectionHtml(artefact: Artefact): string {
  if (!artefact.reflection?.length) return '';

  const sections = artefact.reflection
    .map(
      (s) => `
      <div class="section">
        <h3>${escapeHtml(s.title)}</h3>
        <p>${escapeHtml(s.text)}</p>
      </div>`
    )
    .join('');

  return `<div class="block"><h2>Reflection</h2>${sections}</div>`;
}

function buildCapabilitiesHtml(artefact: Artefact): string {
  if (!artefact.capabilities?.length) return '';

  const rows = artefact.capabilities
    .map(
      (c) => `
      <tr>
        <td class="cap-name">${escapeHtml(c.name)}</td>
        <td>${escapeHtml(c.evidence)}</td>
      </tr>`
    )
    .join('');

  return `
    <div class="block">
      <h2>Capabilities</h2>
      <table>
        <thead><tr><th>Capability</th><th>Evidence</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function buildPdpGoalsHtml(artefact: Artefact): string {
  const nonArchived = artefact.pdpGoals?.filter((g) => g.status !== PdpGoalStatus.ARCHIVED);
  if (!nonArchived?.length) return '';

  const goals = nonArchived
    .map((g) => {
      const actions = g.actions
        .filter((a) => a.status !== PdpGoalStatus.ARCHIVED)
        .map(
          (a) => `
          <li>
            <span class="action-text">${escapeHtml(a.action)}</span>
            <span class="status-pill ${a.status === PdpGoalStatus.COMPLETED ? 'completed' : ''}">${goalStatusLabel(a.status)}</span>
            ${a.dueDate ? `<span class="due-date">Due: ${formatDate(a.dueDate)}</span>` : ''}
          </li>`
        )
        .join('');

      return `
        <div class="goal-card">
          <div class="goal-header">
            <span class="goal-text">${escapeHtml(g.goal)}</span>
            <span class="status-pill ${g.status === PdpGoalStatus.COMPLETED ? 'completed' : ''}">${goalStatusLabel(g.status)}</span>
          </div>
          ${g.reviewDate ? `<p class="review-date">Review by: ${formatDate(g.reviewDate)}</p>` : ''}
          ${actions ? `<ul class="actions-list">${actions}</ul>` : ''}
        </div>`;
    })
    .join('');

  return `<div class="block"><h2>PDP Goals</h2>${goals}</div>`;
}

export function buildExportHtml(artefact: Artefact): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    @page {
      margin: 20mm 15mm;
      size: A4;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #1a1a1a;
    }

    /* Header */
    .header {
      border-bottom: 2px solid #2563eb;
      padding-bottom: 12px;
      margin-bottom: 20px;
    }

    .header h1 {
      font-size: 18pt;
      font-weight: 700;
      color: #111;
      margin-bottom: 6px;
    }

    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      font-size: 9.5pt;
      color: #555;
    }

    .meta-item {
      display: inline;
    }

    .meta-label {
      font-weight: 600;
      color: #333;
    }

    .type-badge {
      display: inline-block;
      background: #eff6ff;
      color: #1d4ed8;
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 600;
      font-size: 9pt;
    }

    /* Content blocks */
    .block {
      margin-bottom: 20px;
    }

    .block h2 {
      font-size: 13pt;
      font-weight: 700;
      color: #111;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 4px;
      margin-bottom: 10px;
    }

    .section {
      margin-bottom: 12px;
    }

    .section h3 {
      font-size: 11pt;
      font-weight: 600;
      color: #333;
      margin-bottom: 4px;
    }

    .section p {
      color: #374151;
      white-space: pre-wrap;
    }

    /* Capabilities table */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10pt;
    }

    th {
      background: #f9fafb;
      text-align: left;
      padding: 6px 8px;
      font-weight: 600;
      color: #374151;
      border-bottom: 2px solid #e5e7eb;
    }

    td {
      padding: 6px 8px;
      border-bottom: 1px solid #f3f4f6;
      vertical-align: top;
    }

    .cap-code {
      font-weight: 600;
      color: #1d4ed8;
      white-space: nowrap;
      width: 50px;
    }

    .cap-name {
      font-weight: 500;
      width: 160px;
    }

    /* PDP Goals */
    .goal-card {
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 10px 12px;
      margin-bottom: 8px;
    }

    .goal-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
    }

    .goal-text {
      font-weight: 600;
      color: #111;
    }

    .status-pill {
      display: inline-block;
      font-size: 8pt;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: 3px;
      background: #f3f4f6;
      color: #6b7280;
      white-space: nowrap;
    }

    .status-pill.completed {
      background: #dcfce7;
      color: #166534;
    }

    .review-date {
      font-size: 9pt;
      color: #6b7280;
      margin-top: 4px;
    }

    .actions-list {
      list-style: none;
      margin-top: 8px;
      padding-left: 0;
    }

    .actions-list li {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 3px 0;
      font-size: 10pt;
      border-top: 1px solid #f3f4f6;
    }

    .action-text {
      flex: 1;
    }

    .due-date {
      font-size: 8.5pt;
      color: #9ca3af;
    }

    /* Footer */
    .footer {
      margin-top: 24px;
      padding-top: 8px;
      border-top: 1px solid #e5e7eb;
      font-size: 8pt;
      color: #9ca3af;
      text-align: center;
    }
  </style>
</head>
<body>

  <div class="header">
    <h1>${escapeHtml(artefact.title || 'Untitled Entry')}</h1>
    <div class="meta">
      ${artefact.artefactTypeLabel ? `<span class="meta-item"><span class="type-badge">${escapeHtml(artefact.artefactTypeLabel)}</span></span>` : ''}
      <span class="meta-item"><span class="meta-label">Date:</span> ${formatDate(artefact.createdAt)}</span>
      <span class="meta-item"><span class="meta-label">Status:</span> ${artefact.status === 400 ? 'Completed' : 'In review'}</span>
    </div>
  </div>

  ${buildReflectionHtml(artefact)}
  ${buildCapabilitiesHtml(artefact)}
  ${buildPdpGoalsHtml(artefact)}

  <div class="footer">
    Generated by Portfolio Assistant &middot; ${formatDate(new Date().toISOString())}
  </div>

</body>
</html>`;
}
