/**
 * G-1 — load and validate the ground-truth corpus.
 *
 * ## Why the validation matters more than the loading
 *
 * The corpus is an answer key. If it is wrong, the measurement is not wrong in
 * a way anyone notices — it is wrong in the *reassuring* direction.
 *
 * Concretely: if a message plants `{ type: PERSON, value: "Patel" }` but the
 * prose says `Patell`, that identifier can never appear in the output, so it
 * scores as **caught** on every run, for ever. Recall goes up. Nothing fails.
 * The same holds for a `mustSurvive` term that is not in the text — it will be
 * reported as over-redacted on every run and quietly train the reader to ignore
 * that column.
 *
 * So the loader asserts, for every entry, that each planted value and each
 * must-survive term actually occurs in its own `text`, under the same matcher
 * the scorer will use. A corpus that lies about itself fails to load.
 *
 * Errors are collected and thrown together — fixing a corpus one exception per
 * run would be miserable.
 */
import * as fs from 'fs';
import * as path from 'path';
import { load } from 'js-yaml';
import { CorpusMessage, CorpusThread, identifierForms, Mode, PlantedIdentifier } from './corpus.types';
import { appearsIn, survivesRedaction } from './matching';

/** Repo-root-relative location of the corpus. */
export const CORPUS_DIR = path.resolve(
  __dirname,
  '../../../../../docs/compliance/measurements/corpus'
);

export class CorpusValidationError extends Error {
  constructor(readonly problems: string[]) {
    super(`Corpus failed validation (${problems.length} problem(s)):\n  - ${problems.join('\n  - ')}`);
    this.name = 'CorpusValidationError';
  }
}

const MODES: readonly Mode[] = ['text', 'voice'];

function isMode(value: unknown): value is Mode {
  return MODES.includes(value as Mode);
}

function readYaml(dir: string, file: string): unknown {
  const parsed = load(fs.readFileSync(path.join(dir, file), 'utf8'));
  if (!Array.isArray(parsed)) throw new Error(`${file}: expected a top-level YAML list`);
  return parsed;
}

/**
 * Check one entry's answer key against its own prose.
 *
 * `where` prefixes every problem so a failure names the offending entry rather
 * than leaving the reader to grep for it.
 */
function checkAnswerKey(
  where: string,
  text: string,
  mustRedact: PlantedIdentifier[],
  mustSurvive: string[],
  problems: string[]
): void {
  for (const planted of mustRedact) {
    if (!planted?.type || !planted?.value) {
      problems.push(`${where}: mustRedact entry missing type or value`);
      continue;
    }
    if (!appearsIn(planted.value, text, planted.type)) {
      problems.push(
        `${where}: planted ${planted.type} "${planted.value}" does not occur in its own text ` +
          `— it could never leak, so it would score as caught for ever`
      );
    }
    // Aliases are deliberately exempt from the presence check: they exist for
    // forms the PIPELINE creates (spoken digits rendered as numerals), which by
    // definition are absent from the source text. They still have to be
    // non-empty, or they silently contribute nothing.
    for (const alias of planted.aliases ?? []) {
      if (!alias?.trim()) problems.push(`${where}: ${planted.type} has an empty alias`);
    }
  }

  for (const term of mustSurvive) {
    if (!survivesRedaction(term, text)) {
      problems.push(
        `${where}: mustSurvive term "${term}" does not occur in its own text ` +
          `— it would be reported as over-redacted on every run`
      );
    }
  }

  // Eponym collisions: `Mr Parkinson` in a message that also says `Parkinson's`.
  // If the planted value is contained in a term that must SURVIVE, then correct
  // behaviour — redacting the name, keeping the condition — still leaves the
  // value present, and the identifier scores as leaked on every run. The
  // measurement becomes unsound in the alarming direction rather than the
  // reassuring one, but it is just as wrong.
  //
  // The fix is a longer key that excludes the surviving term (`Mr Parkinson`),
  // which is the one place the minimal-core rule is deliberately broken.
  for (const planted of mustRedact) {
    for (const form of identifierForms(planted)) {
      const collision = mustSurvive.find((term) => appearsIn(form, term, planted.type));
      if (collision) {
        problems.push(
          `${where}: planted ${planted.type} "${form}" also occurs inside must-survive term ` +
            `"${collision}" — it would score as leaked even when redaction is correct. ` +
            `Use a longer key that excludes it`
        );
      }
    }
  }
}

export function loadMessages(dir: string = CORPUS_DIR): CorpusMessage[] {
  const raw = readYaml(dir, 'messages.yaml') as CorpusMessage[];
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const [i, m] of raw.entries()) {
    const where = m?.id ?? `messages.yaml[${i}]`;

    if (!m?.id) problems.push(`${where}: missing id`);
    else if (seen.has(m.id)) problems.push(`${where}: duplicate id`);
    else seen.add(m.id);

    if (!isMode(m?.mode)) problems.push(`${where}: mode must be 'text' or 'voice'`);
    if (!m?.text?.trim()) problems.push(`${where}: empty text`);

    // Normalise the optional lists once, so callers never handle undefined.
    m.mustRedact ??= [];
    m.mustSurvive ??= [];

    if (m?.text?.trim()) {
      checkAnswerKey(where, m.text, m.mustRedact, m.mustSurvive, problems);
    }
  }

  if (problems.length) throw new CorpusValidationError(problems);
  return raw;
}

export function loadThreads(dir: string = CORPUS_DIR): CorpusThread[] {
  const raw = readYaml(dir, 'threads.yaml') as CorpusThread[];
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const [i, t] of raw.entries()) {
    const where = t?.id ?? `threads.yaml[${i}]`;

    if (!t?.id) problems.push(`${where}: missing id`);
    else if (seen.has(t.id)) problems.push(`${where}: duplicate id`);
    else seen.add(t.id);

    if (!t?.identifiabilityQuestion?.trim()) {
      problems.push(`${where}: missing identifiabilityQuestion — a thread nobody is asked to judge measures nothing`);
    }
    if (!Array.isArray(t?.messages) || t.messages.length === 0) {
      problems.push(`${where}: thread has no messages`);
      continue;
    }

    t.mustRedact ??= [];

    for (const [j, msg] of t.messages.entries()) {
      if (!isMode(msg?.mode)) problems.push(`${where}[${j}]: mode must be 'text' or 'voice'`);
      if (!msg?.text?.trim()) problems.push(`${where}[${j}]: empty text`);
    }

    // A thread's planted identifiers may sit in any of its turns, so the key is
    // checked against the concatenated thread rather than a single message.
    const joined = t.messages.map((m) => m?.text ?? '').join('\n');
    checkAnswerKey(where, joined, t.mustRedact, [], problems);
  }

  if (problems.length) throw new CorpusValidationError(problems);
  return raw;
}
