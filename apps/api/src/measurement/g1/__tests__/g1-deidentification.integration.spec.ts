/**
 * G-1 — de-identification measurement harness. **Makes real Azure and LLM calls.**
 *
 * Evidence for launch condition C-6 (DPIA §6.3, measure M-A). Answers the
 * question the DPIA currently assumes: once redaction has run, is what remains
 * still personal data?
 *
 * ## What it measures, and where
 *
 * Production runs **Redact → Clean → offline backstop** (`processing.service.ts`
 * `redactCleanAndComplete`): redaction writes `redactedContent`, the cleaning
 * LLM rewrites it, and the backstop's output is what lands in `content` — which
 * is what the graph puts into `state.fullTranscript` for the model to read.
 *
 * So the harness runs **all three, in that order**, and scores at two points:
 * after redaction (diagnostic) and at `content` (the gate). Scoring only the
 * redactor would measure a component and report it as if it were the control.
 *
 * It calls `RedactionStage.execute()` rather than reaching past it into
 * `redactPhi()`, so the offline regex backstop is included — that layer is what
 * catches NHS numbers and postcodes, and excluding it would produce an alarming
 * miss rate for identifiers the real pipeline never misses.
 *
 * ## Running it
 *
 *   RUN_G1=1 /path/to/node_modules/.bin/jest --config jest.config.ts --silent=false g1-deid
 *
 * Gated behind RUN_G1 and named *.integration.spec.ts so neither default runner
 * touches it. Sequential by design: parallelising risks tripping the pool RPM
 * caps, and a rate-limit error would surface as a phantom leak.
 *
 * Expect roughly 166 calls and 5–10 minutes.
 */
import { MessageRole, Specialty } from '@acme/shared';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';
import { Types } from 'mongoose';
import { MetricsModule } from '../../../common/metrics/metrics.module';
import { ConfigModule } from '../../../config/config.module';
import { LanguageModule } from '../../../language';
import { LLMModule } from '../../../llm';
import { buildTranscript } from '../../../portfolio-graph/nodes/transcript-format.util';
import { LocalPiiService } from '../../../processing/redaction/local-pii.service';
import { RedactionModule } from '../../../processing/redaction/redaction.module';
import { CleaningStage } from '../../../processing/stages/cleaning.stage';
import { RedactionStage } from '../../../processing/stages/redaction.stage';
import { StageContext } from '../../../processing/stages/stage.interface';
import { CORPUS_DIR, loadMessages, loadThreads } from '../corpus.loader';
import { MessageRun, renderReport, ThreadRun } from '../report';
import { aggregate, scoreIdentifiers, scoreMessage } from '../scorer';

const RUN = process.env.RUN_G1 === '1';
const gate = RUN ? describe : describe.skip;

/** Sibling of the corpus, so both derive from one already-correct path. */
const REPORT_DIR = path.resolve(CORPUS_DIR, '..');

/**
 * A report path that never overwrites an earlier one.
 *
 * The first convention was date-only, which meant a same-day re-run silently
 * replaced the previous report. Two runs on 2026-08-05 measured genuinely
 * different pipelines, and losing the first would have erased the record of a
 * corrected measurement — which is evidence in its own right.
 */
function nextReportPath(runDate: string): string {
  const base = path.join(REPORT_DIR, `g1-recall_${runDate}`);
  if (!fs.existsSync(`${base}.md`)) return `${base}.md`;
  for (let n = 2; ; n++) {
    const candidate = `${base}_run${n}.md`;
    if (!fs.existsSync(candidate)) return candidate;
  }
}

/**
 * Minimal DI context: config, the LLM stack and the two real stages. No
 * persistence layer — the harness never writes a message, so nothing needs a
 * database, and keeping Mongo out removes a whole class of setup failure from a
 * run that is already slow and expensive.
 */
@Module({
  imports: [ConfigModule, MetricsModule, LLMModule, LanguageModule, RedactionModule],
  providers: [RedactionStage, CleaningStage],
})
class G1HarnessModule {}

/** A fresh context per message, mirroring one real message through the pipeline. */
function stageContext(): StageContext {
  return {
    messageId: new Types.ObjectId(),
    conversationId: new Types.ObjectId(),
    specialty: Specialty.GP,
    mediaType: null,
  };
}

gate('G-1 — de-identification measurement (C-6 evidence)', () => {
  it(
    'runs the corpus through the real pipeline and reports per-type recall',
    async () => {
      const messages = loadMessages();
      const threads = loadThreads();

      const app = await NestFactory.createApplicationContext(G1HarnessModule, {
        // abortOnError:false → surface DI/config errors as throwables rather than
        // letting Nest call process.exit(1), whose message jest.setup silences.
        logger: ['error', 'warn'],
        abortOnError: false,
      });

      try {
        const redaction = app.get(RedactionStage);
        const cleaning = app.get(CleaningStage);
        const localPii = app.get(LocalPiiService);

        /**
         * One message through Redact → Clean → backstop, exactly as production
         * orders them in `redactCleanAndComplete`.
         *
         * The trailing backstop is not optional here. It is what production
         * persists to `content`, so a harness that stopped at the cleaning stage
         * would measure a pipeline that no longer exists and report a worse
         * number than the system actually produces.
         */
        const runPipeline = async (text: string) => {
          const ctx = stageContext();
          const redacted = await redaction.execute(text, ctx);
          const cleaned = await cleaning.execute(redacted.text, ctx);
          const backstopped = await localPii.redactLocal(cleaned.text);
          return {
            redactedText: redacted.text,
            cleanedText: backstopped.redactedText,
            injectionDetected: cleaned.injectionDetected ?? false,
          };
        };

        const messageRuns: MessageRun[] = [];
        for (const [i, message] of messages.entries()) {
          process.stdout.write(`\r[G-1] message ${i + 1}/${messages.length} (${message.id})   `);
          const out = await runPipeline(message.text);
          messageRuns.push({
            message,
            ...out,
            redactionScore: scoreMessage(message, out.redactedText),
            finalScore: scoreMessage(message, out.cleanedText),
          });
        }

        const threadRuns: ThreadRun[] = [];
        for (const [i, thread] of threads.entries()) {
          process.stdout.write(`\r[G-1] thread ${i + 1}/${threads.length} (${thread.id})   `);

          // Redact and clean each turn independently — that is how production
          // does it — then stitch with the real formatter, so the transcript a
          // reader judges is the transcript the model would receive.
          const cleanedTurns: string[] = [];
          for (const turn of thread.messages) cleanedTurns.push((await runPipeline(turn.text)).cleanedText);

          const transcript = buildTranscript(
            cleanedTurns.map((content) => ({ role: MessageRole.USER, content }))
          );

          threadRuns.push({
            thread,
            redactedMessages: cleanedTurns,
            transcript,
            leaked: scoreIdentifiers(thread.mustRedact, transcript).leaked,
          });
        }

        // Threads are aggregated separately and deliberately: their answer key is
        // thread-level against a stitched transcript, so folding them into the
        // per-message denominator would report a rate over two different things.
        const score = aggregate(messageRuns.map((r) => r.finalScore));

        const runDate = new Date().toISOString().slice(0, 10);
        const reportPath = nextReportPath(runDate);
        fs.writeFileSync(
          reportPath,
          renderReport({
            runDate,
            corpusDir: path.relative(path.resolve(REPORT_DIR, '../../..'), CORPUS_DIR),
            azureSdkVersion: (
              require('../../../../package.json') as { dependencies: Record<string, string> }
            ).dependencies['@azure/ai-language-text'],
            messages: messageRuns,
            threads: threadRuns,
            score,
          }),
          'utf8'
        );

        // Bypass jest's console mock so the headline reaches the terminal.
        const failing = score.byTypeAndMode.filter((r) => !r.passes);
        process.stdout.write(
          `\n\n[G-1] ${score.verdict} — ${score.totalLeaked}/${score.totalPlanted} planted identifiers leaked` +
            (failing.length
              ? `\n[G-1] below floor: ${failing.map((r) => `${r.type}/${r.mode}`).join(', ')}`
              : '') +
            `\n[G-1] report: ${reportPath}\n\n`
        );

        // Guarantee the run actually exercised the whole corpus first — a harness
        // that silently measured nothing would otherwise look like a clean pass.
        expect(messageRuns).toHaveLength(messages.length);
        expect(threadRuns).toHaveLength(threads.length);
        expect(score.totalPlanted).toBeGreaterThan(50);

        // Then enforce. Failure detail lives in the report and in the line above,
        // not in a jest diff — but the run has to fail, or the measurement is an
        // observation rather than a control.
        //
        // A bucket below floor can still pass if it carries an ACCEPTED RESIDUAL
        // (see floors.ts). That is a recorded controller decision with a reason
        // and a date, not a lowered threshold, and it re-fails if recall degrades.
        expect(score.verdict).toBe('PASS');
      } finally {
        await app.close();
      }
    },
    900_000
  );
});
