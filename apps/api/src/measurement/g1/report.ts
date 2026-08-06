/**
 * G-1 — report rendering. Pure: takes run data, returns markdown.
 *
 * The output of this file **is** the C-6 evidence. It is written to
 * `docs/compliance/measurements/` and committed, so it has to answer a
 * regulator's two questions without anyone present to explain it: what was
 * tested against, and what came back.
 *
 * Three editorial decisions worth stating, because they are the difference
 * between evidence and a log file:
 *
 * 1. **Worst first.** Rows sort by recall ascending. A reader who stops after
 *    the first table has seen the problem.
 * 2. **Leaks are shown in context.** A count tells you something failed; the
 *    surrounding output tells you whether it is a model miss, a policy carve-out
 *    working as designed, or a corpus mistake. Those need different responses.
 * 3. **The threads are printed in full.** They are the only instrument G-1 has
 *    for quasi-identifiers, and they only work if a human reads them.
 */
import { CorpusMessage, CorpusThread, PlantedIdentifier } from './corpus.types';
import { CorpusScore, MessageScore } from './scorer';

/** One corpus message taken through the real pipeline. */
export interface MessageRun {
  message: CorpusMessage;
  /** Output of RedactionStage — persisted as `redactedContent` in production. */
  redactedText: string;
  /** Output of CleaningStage — persisted as `content`, and what the LLM sees. */
  cleanedText: string;
  /** Cleaning stage's injection verdict. True on clinical prose is a finding. */
  injectionDetected: boolean;
  /** Scored at the redaction boundary — diagnostic. */
  redactionScore: MessageScore;
  /** Scored at `content` — this is the gate. */
  finalScore: MessageScore;
}

/** One corpus thread, redacted per message then stitched as the graph stitches it. */
export interface ThreadRun {
  thread: CorpusThread;
  redactedMessages: string[];
  transcript: string;
  leaked: PlantedIdentifier[];
}

export interface ReportInput {
  runDate: string;
  corpusDir: string;
  azureSdkVersion: string;
  messages: MessageRun[];
  threads: ThreadRun[];
  /** Aggregated over `finalScore` — the measurement point that matters. */
  score: CorpusScore;
}

const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

/** Show a leak in context: the ~60 characters either side of where it survived. */
function excerpt(output: string, value: string): string {
  const flat = output.replace(/\s+/g, ' ');
  const at = flat.toLowerCase().indexOf(value.toLowerCase().replace(/\s+/g, ' '));
  if (at < 0) return flat.slice(0, 120).trim(); // structural match — no literal span
  return `…${flat.slice(Math.max(0, at - 60), at + value.length + 60).trim()}…`;
}

function renderRecallTable(score: CorpusScore): string[] {
  if (!score.byTypeAndMode.length) return ['_No identifiers planted._', ''];

  return [
    '| type | mode | planted | leaked | recall | floor | |',
    '| --- | --- | ---: | ---: | ---: | ---: | --- |',
    ...score.byTypeAndMode.map(
      (r) =>
        `| ${r.type} | ${r.mode} | ${r.planted} | ${r.leaked} | ${pct(r.recall)} | ` +
        // A waived bucket is neither passing nor failing, and marking it ✅ would
        // be the exact dishonesty the waiver mechanism exists to avoid.
        `${pct(r.floor)} | ${r.waived ? '◐ accepted residual' : r.passes ? '✅' : '⚠️ **below floor**'} |`
    ),
    '',
  ];
}

/**
 * Gaps between a floor and reality that were knowingly accepted.
 *
 * Printed as its own section, every run, so an accepted residual stays a visible
 * decision rather than fading into a number. This is the section a regulator
 * would read first, and it should read like a decision record — because it is.
 */
function renderAcceptedResiduals(score: CorpusScore): string[] {
  const waived = score.byTypeAndMode.filter((r) => r.waived);
  if (!waived.length) return [];

  return [
    '## Accepted residuals',
    '',
    'These buckets are **below floor and knowingly accepted**. The floor has not been',
    'moved — moving it would hide the decision. Each was accepted at the recall',
    'measured on that date, so **degradation beyond one identifier fails the run again**.',
    '',
    ...waived.flatMap((r) => [
      `### ${r.type} / ${r.mode} — measured ${pct(r.recall)}, floor ${pct(r.floor)}`,
      '',
      `Accepted ${r.waived?.acceptedOn} at ${pct(r.waived?.acceptedRecall ?? 0)}.`,
      '',
      r.waived?.reason ?? '',
      '',
    ]),
  ];
}

/**
 * Recall split by input mode.
 *
 * Voice is the dominant input for this product, so a blended average is the one
 * number most likely to hide a real problem. It gets its own comparison.
 */
function renderModeComparison(score: CorpusScore): string[] {
  const totals = (mode: string) =>
    score.byTypeAndMode
      .filter((r) => r.mode === mode)
      .reduce((acc, r) => ({ planted: acc.planted + r.planted, leaked: acc.leaked + r.leaked }), {
        planted: 0,
        leaked: 0,
      });

  const text = totals('text');
  const voice = totals('voice');
  if (!text.planted || !voice.planted) return [];

  const textRecall = (text.planted - text.leaked) / text.planted;
  const voiceRecall = (voice.planted - voice.leaked) / voice.planted;
  const gap = (textRecall - voiceRecall) * 100;

  return [
    '## Voice vs typed',
    '',
    `- typed: **${pct(textRecall)}** (${text.leaked}/${text.planted} leaked)`,
    `- voice: **${pct(voiceRecall)}** (${voice.leaked}/${voice.planted} leaked)`,
    `- gap: **${gap.toFixed(1)} points**`,
    '',
    gap > 5
      ? '> ⚠️ A gap this size is a finding about the product\'s dominant input mode, ' +
        'not noise. Transcription noise is costing recall.'
      : '> No material gap between typed and voice-originated input.',
    '',
  ];
}

/**
 * Where cleaning changed the answer.
 *
 * Cleaning is an LLM that rewrites already-redacted text and is the last writer
 * to `content`. It has a placeholder guard, but a guard is a claim until
 * something measures it — the same reasoning that produced M-17.1.
 */
function renderCleaningDelta(runs: MessageRun[]): string[] {
  const changed = runs.filter((r) => r.finalScore.leaked.length !== r.redactionScore.leaked.length);
  const flagged = runs.filter((r) => r.injectionDetected);

  const lines = ['## Redaction vs cleaning', ''];

  if (!changed.length) {
    lines.push('No message changed its leak count between `redactedContent` and `content`.', '');
  } else {
    lines.push(
      'Messages whose leak count changed after cleaning — cleaning is the last writer to',
      '`content`, so a change here means the guard did not hold:',
      '',
      '| message | leaked after redaction | leaked after cleaning |',
      '| --- | ---: | ---: |',
      ...changed.map(
        (r) => `| ${r.message.id} | ${r.redactionScore.leaked.length} | ${r.finalScore.leaked.length} |`
      ),
      ''
    );
  }

  if (flagged.length) {
    lines.push(
      `⚠️ **${flagged.length} message(s) flagged as prompt injection** by the cleaning stage: ` +
        `${flagged.map((r) => r.message.id).join(', ')}. In production these are marked REJECTED ` +
        `and the entry is lost, so a false positive on ordinary clinical prose is a product defect.`,
      ''
    );
  }

  return lines;
}

function renderLeakDetail(runs: MessageRun[]): string[] {
  const leaking = runs.filter((r) => r.finalScore.leaked.length);
  if (!leaking.length) return ['## Leak detail', '', 'No planted identifier survived to `content`.', ''];

  return [
    '## Leak detail',
    '',
    'Every planted identifier that reached `content`. Read the context before acting:',
    'a surviving relative date or sub-90 age may be a carve-out working as designed,',
    'not a model failure.',
    '',
    ...leaking.flatMap((run) => [
      `### ${run.message.id} (${run.message.mode}) — ${run.message.intent}`,
      '',
      ...run.finalScore.leaked.map((p) => `- **${p.type}** \`${p.value}\` — ${excerpt(run.cleanedText, p.value)}`),
      '',
    ]),
  ];
}

function renderOverRedaction(score: CorpusScore): string[] {
  if (!score.overRedaction.length) {
    return ['## Over-redaction', '', 'Every must-survive term survived.', ''];
  }

  return [
    '## Over-redaction',
    '',
    '**Reported, not gated.** Losing these costs narrative quality, which matters to',
    'the product, but harms nobody — and gating on it would create pressure to weaken',
    'redaction.',
    '',
    '| term | times lost |',
    '| --- | ---: |',
    ...score.overRedaction.map((o) => `| \`${o.term}\` | ${o.lost} |`),
    '',
  ];
}

/**
 * The threads — printed for a human, because nothing else can score them.
 *
 * Redaction runs per message; the graph then stitches every message into
 * `state.fullTranscript` before the LLM sees it. So each turn can be correctly
 * redacted and the assembly still identify someone. No detector will surface
 * that, because there is nothing to detect.
 */
function renderThreads(threads: ThreadRun[]): string[] {
  return [
    '---',
    '',
    '# Part B — quasi-identifier read (human)',
    '',
    '**These are not scored by the harness.** Read each redacted thread and answer its',
    'question in writing, appending the answers to this file. Answer honestly: *"yes, if',
    'you worked in that area"* is a **yes**.',
    '',
    ...threads.flatMap((run) => [
      `## ${run.thread.id} — ${run.thread.title}`,
      '',
      `**Question:** ${run.thread.identifiabilityQuestion.trim()}`,
      '',
      `**Mechanism:** ${run.thread.accumulationMechanism.trim()}`,
      '',
      run.leaked.length
        ? `**⚠️ Conventional identifiers that also leaked:** ` +
          run.leaked.map((p) => `\`${p.type}: ${p.value}\``).join(', ')
        : '**Conventional identifiers:** all caught.',
      '',
      'Redacted transcript, stitched as the graph stitches it:',
      '',
      '```',
      run.transcript,
      '```',
      '',
      '**Answer:** _(to be completed by the reader)_',
      '',
    ]),
  ];
}

export function renderReport(input: ReportInput): string {
  const { score, messages, threads } = input;
  const voiceCount = messages.filter((m) => m.message.mode === 'voice').length;

  return [
    `# G-1 — de-identification measurement`,
    '',
    `**Run:** ${input.runDate} · **Verdict:** ${score.verdict === 'PASS' ? '✅ PASS' : '❌ FAIL'}`,
    '',
    'Evidence for launch condition **C-6** (DPIA §6.3, measure M-A). Measures what',
    'survives the **full pipeline** — `RedactionStage` then `CleaningStage` — at the',
    'point the LLM actually sees it, not what one layer catches in isolation.',
    '',
    '| | |',
    '| --- | --- |',
    `| Corpus | \`${input.corpusDir}\` |`,
    `| Messages | ${messages.length} (${messages.length - voiceCount} typed, ${voiceCount} voice) |`,
    `| Threads | ${threads.length} |`,
    `| Identifiers planted | ${score.totalPlanted} |`,
    `| Identifiers leaked | **${score.totalLeaked}** |`,
    `| Azure SDK | \`@azure/ai-language-text@${input.azureSdkVersion}\` |`,
    '',
    '> Recorded so a future regression is attributable: Azure\'s model can change',
    '> under a pinned SDK, and a number with no version beside it cannot be compared',
    '> to the next one.',
    '',
    '# Part A — identifier recall (measured)',
    '',
    'Floors were committed in `floors.ts` **before this run existed**. Recall is scored',
    'at `content`, after cleaning.',
    '',
    ...renderRecallTable(score),
    ...renderAcceptedResiduals(score),
    ...renderModeComparison(score),
    ...renderCleaningDelta(messages),
    ...renderLeakDetail(messages),
    ...renderOverRedaction(score),
    ...renderThreads(threads),
  ].join('\n');
}
