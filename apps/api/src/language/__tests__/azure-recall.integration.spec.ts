/**
 * PHASE 1 — Redact-before-clean recall gate (dev harness, NOT a CI test).
 *
 * Question this answers: if Azure PHI redaction runs on the RAW transcript
 * instead of the CLEANED one, does its recall drop? Cleaning currently
 * normalises disfluencies / transcription noise, which may be helping Azure's
 * NER. The reorder (Redact → Clean) is only safe if raw-text recall holds.
 *
 * How it measures: for every case in `docs/cases/*.md` it runs the REAL
 * `AzureLanguageService.redactPhi()` twice — once on the raw segment, once on
 * `CleaningStage.execute(raw)` — and diffs the two entity sets by category. A
 * category caught on cleaned text but missed on raw text is a recall regression:
 * exactly the PHI that would start leaking after the swap.
 *
 * Honest limits of the signal:
 *  - The case corpus is the whole ground truth; inputs unlike it are unmeasured.
 *  - Azure returns value-free entities ({category, confidenceScore}) — no
 *    offsets/text — so the automated diff is at CATEGORY-COUNT granularity, not
 *    per-span. The full redacted texts are written out so a human can confirm
 *    whether a delta is a real leak or just a re-wording artefact.
 *
 * This makes REAL Azure + OpenAI calls, so it is gated behind
 * RUN_RECALL_HARNESS=1 and named *.integration.spec.ts (the unit runner ignores
 * that suffix; the integration runner skips it unless the flag is set):
 *
 *   RUN_RECALL_HARNESS=1 \
 *   /Users/…/node_modules/.bin/jest --config jest.config.ts --silent=false azure-recall
 *
 * Report is written to $RECALL_REPORT_PATH (default: session scratchpad).
 */
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Specialty } from '@acme/shared';
import * as fs from 'fs';
import * as path from 'path';
import { Types } from 'mongoose';
import { ConfigModule } from '../../config/config.module';
import { MetricsModule } from '../../common/metrics/metrics.module';
import { LLMModule } from '../../llm';
import { LanguageModule, AzureLanguageService, RedactedEntity } from '..';
import { CleaningStage } from '../../processing/stages/cleaning.stage';
import { StageContext } from '../../processing/stages/stage.interface';

const RUN = process.env.RUN_RECALL_HARNESS === '1';
const gate = RUN ? describe : describe.skip;

const CASES_DIR = path.resolve(__dirname, '../../../../../docs/cases');
const REPORT_PATH =
  process.env.RECALL_REPORT_PATH ??
  path.resolve(
    '/private/tmp/claude-501/-Users-mithunraman-Desktop-code-portfolio',
    '25c730c2-0391-4ee3-a8d8-7348bc2be880/scratchpad/phase1-recall-report.md'
  );

/** A minimal DI context: config + the two real services, no persistence layer. */
@Module({
  imports: [ConfigModule, MetricsModule, LLMModule, LanguageModule],
  providers: [CleaningStage],
})
class RecallHarnessModule {}

type Histogram = Map<string, number>;

/** Count entities per Azure category. */
function histogram(entities: RedactedEntity[]): Histogram {
  const h: Histogram = new Map();
  for (const e of entities) h.set(e.category, (h.get(e.category) ?? 0) + 1);
  return h;
}

/**
 * Split a case file into per-case segments on any line containing a `[Case …]`
 * marker — each segment is a realistic single-message input. Preamble and tiny
 * fragments are dropped.
 */
function segmentsOf(fileText: string): string[] {
  return fileText
    .split(/^.*\[Case\b.*$/m)
    .map((s) => s.trim())
    .filter((s) => s.length >= 80);
}

function loadSegments(): { file: string; index: number; text: string }[] {
  const files = fs
    .readdirSync(CASES_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort();
  const out: { file: string; index: number; text: string }[] = [];
  for (const file of files) {
    const full = fs.readFileSync(path.join(CASES_DIR, file), 'utf8');
    segmentsOf(full).forEach((text, index) => out.push({ file, index, text }));
  }
  return out;
}

function histLine(h: Histogram): string {
  const entries = [...h.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return entries.length ? entries.map(([c, n]) => `${c}×${n}`).join(', ') : '(none)';
}

gate('Azure PHI recall — raw vs cleaned (redact-before-clean gate)', () => {
  it(
    'redacts every case on raw and cleaned text, then reports category deltas',
    async () => {
      const app = await NestFactory.createApplicationContext(RecallHarnessModule, {
        // abortOnError:false → surface DI/config errors as throwables instead of
        // Nest calling process.exit(1) (whose message jest.setup silences).
        logger: ['error', 'warn'],
        abortOnError: false,
      });

      try {
        const azure = app.get(AzureLanguageService);
        const cleaning = app.get(CleaningStage);
        const ctx: StageContext = {
          messageId: new Types.ObjectId(),
          conversationId: new Types.ObjectId(),
          specialty: Specialty.GP,
          mediaType: null,
        };

        const segments = loadSegments();
        expect(segments.length).toBeGreaterThan(0);

        const lines: string[] = [
          '# Phase 1 — Azure PHI recall: raw vs cleaned',
          '',
          `Corpus: ${CASES_DIR}`,
          `Segments: ${segments.length}`,
          '',
          'A **regression** is a category Azure caught on CLEANED text but missed on',
          'RAW text — the PHI that would start leaking once redaction runs first.',
          'Counts are category-level (Azure entities are value-free); read the',
          'redacted texts below to confirm a delta is a real leak, not a re-wording.',
          '',
        ];

        // Aggregate regression tally across the whole corpus.
        const regressionTotals: Histogram = new Map();
        let segmentsWithRegression = 0;

        for (const seg of segments) {
          const cleaned = (await cleaning.execute(seg.text, ctx)).text;
          const rawRedact = await azure.redactPhi(seg.text);
          const cleanedRedact = await azure.redactPhi(cleaned);

          const rawHist = histogram(rawRedact.entities);
          const cleanedHist = histogram(cleanedRedact.entities);

          const categories = [...new Set([...rawHist.keys(), ...cleanedHist.keys()])].sort();
          const regressions: string[] = [];
          const deltaRows: string[] = [];
          for (const cat of categories) {
            const rawN = rawHist.get(cat) ?? 0;
            const cleanedN = cleanedHist.get(cat) ?? 0;
            const flag = cleanedN > rawN ? ' ⚠️ raw under-caught' : '';
            deltaRows.push(`| ${cat} | ${rawN} | ${cleanedN} | ${cleanedN - rawN}${flag} |`);
            if (cleanedN > rawN) {
              regressions.push(`${cat} (raw ${rawN} < cleaned ${cleanedN})`);
              regressionTotals.set(cat, (regressionTotals.get(cat) ?? 0) + (cleanedN - rawN));
            }
          }
          if (regressions.length) segmentsWithRegression++;

          lines.push(
            `## ${seg.file} — segment ${seg.index}`,
            '',
            `- raw entities:     ${histLine(rawHist)}`,
            `- cleaned entities: ${histLine(cleanedHist)}`,
            regressions.length
              ? `- ⚠️ REGRESSIONS: ${regressions.join('; ')}`
              : '- ✅ no recall regression',
            '',
            '| category | raw | cleaned | Δ |',
            '| --- | --- | --- | --- |',
            ...deltaRows,
            '',
            '<details><summary>redacted on RAW</summary>',
            '',
            '```',
            rawRedact.redactedText,
            '```',
            '',
            '</details>',
            '',
            '<details><summary>redacted on CLEANED</summary>',
            '',
            '```',
            cleanedRedact.redactedText,
            '```',
            '',
            '</details>',
            ''
          );
        }

        const verdict =
          segmentsWithRegression === 0
            ? '✅ GO — no category-level recall regression on raw text across the corpus.'
            : `⚠️ REVIEW — ${segmentsWithRegression}/${segments.length} segment(s) show raw ` +
              `under-catching: ${histLine(regressionTotals)}. Inspect the redacted texts ` +
              `before proceeding to Phase 2.`;

        lines.splice(9, 0, `## Verdict`, '', verdict, '');

        fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
        // Bypass jest's `silent` console mock so the headline shows on the CLI.
        process.stdout.write(`\n${verdict}\nReport: ${REPORT_PATH}\n\n`);

        // The harness never asserts a verdict — a regression is a finding to read,
        // not a test failure. It only guarantees it exercised the whole corpus.
        expect(segments.length).toBeGreaterThan(0);
      } finally {
        await app.close();
      }
    },
    600_000
  );
});
