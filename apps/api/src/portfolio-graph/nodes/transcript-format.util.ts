/**
 * Transcript formatting for the portfolio graph — the single home for the turn
 * provenance convention every downstream node relies on.
 *
 * Turns are role-prefixed so the nodes that consume `state.fullTranscript`
 * (check_completeness partitions/grades "ideas"; tag_capabilities gates on
 * verbatim quotes) can tell trainee evidence from the assistant's own prompts:
 *  - `TRAINEE:` — the trainee's words; the ONLY gradeable evidence.
 *  - `AI asked:` — an assistant prompt; context only, never gradeable content.
 *
 * Pure and dependency-free (beyond shared types) so it is unit-testable with
 * plain objects — no repository or graph concerns leak in.
 */
import { type FreeTextQuestion, MessageRole, type Question } from '@acme/shared';

export const TRAINEE_TURN_PREFIX = 'TRAINEE:';
export const AI_TURN_PREFIX = 'AI asked:';

/** Turns are joined by this separator; the grading prompts key off the "---". */
const TURN_SEPARATOR = '\n\n---\n\n';
const TRAINEE_BLOCK_PREFIX = `${TRAINEE_TURN_PREFIX}\n`;

/** The minimal shape buildTranscript needs — mongoose message docs satisfy it structurally. */
export interface TranscriptMessage {
  role: MessageRole;
  content?: string | null;
  question?: Question | null;
}

/**
 * Format an ASSISTANT follow-up question as a role-prefixed prompt header.
 * For free_text questions, emits the individual question texts so downstream
 * nodes know which section each subsequent trainee answer targets.
 */
export function formatAssistantQuestion(question: Question): string {
  if (question.questionType === 'free_text') {
    const ftq = question as FreeTextQuestion;
    const questions = ftq.prompts.map((p) => p.text).join('\n');
    return `${AI_TURN_PREFIX}\n${questions}`;
  }
  // single_select / multi_select are classification/capability interrupts —
  // not conversational follow-ups, so use a generic label.
  return 'AI asked a clarification question.';
}

/**
 * Build the conversation transcript from chronologically-ordered, already-
 * status-filtered user/assistant messages. User turns are prefixed
 * `TRAINEE:` and assistant questions `AI asked:` so provenance is explicit.
 * Assistant messages without a question (e.g. thinking status) are skipped.
 */
export function buildTranscript(messages: TranscriptMessage[]): string {
  const parts: string[] = [];
  for (const msg of messages) {
    if (msg.role === MessageRole.USER && msg.content) {
      parts.push(`${TRAINEE_BLOCK_PREFIX}${msg.content.trim()}`);
    } else if (msg.role === MessageRole.ASSISTANT && msg.question) {
      parts.push(formatAssistantQuestion(msg.question));
    }
  }
  return parts.join(TURN_SEPARATOR);
}

/** A fragment starts a genuine new turn only when it opens with a role marker. */
function startsNewTurn(fragment: string): boolean {
  // Both AI forms — `AI asked:\n…` and `AI asked a clarification question.` —
  // share the `AI asked` stem, so one check covers them.
  return fragment.startsWith(TRAINEE_BLOCK_PREFIX) || fragment.startsWith('AI asked');
}

/**
 * Extract only the trainee's turns from a transcript built by `buildTranscript`,
 * with the `TRAINEE:` prefixes stripped and turns re-joined. Used as the verbatim-
 * quote gate for capability evidence so assistant-authored text (an `AI asked:`
 * turn that paraphrases the trainee) can never verify as the trainee's own words.
 *
 * A real turn boundary is a `TURN_SEPARATOR` immediately followed by a role marker.
 * A `---` inside a trainee's OWN message is not followed by a marker, so we re-join
 * it rather than treating it as a boundary — otherwise the continuation would be a
 * prefix-less fragment and get silently dropped from the quote gate (a false negative).
 */
export function traineeTurnsOnly(transcript: string): string {
  const turns: string[] = [];
  for (const fragment of transcript.split(TURN_SEPARATOR)) {
    if (startsNewTurn(fragment)) {
      turns.push(fragment);
    } else if (turns.length > 0) {
      // Continuation of the previous turn — the separator was part of that turn's
      // own content, not a real boundary. Restore it.
      turns[turns.length - 1] += TURN_SEPARATOR + fragment;
    }
    // A leading prefix-less fragment (malformed transcript) has no turn to attach
    // to — ignore it.
  }
  return turns
    .filter((block) => block.startsWith(TRAINEE_BLOCK_PREFIX))
    .map((block) => block.slice(TRAINEE_BLOCK_PREFIX.length))
    .join(TURN_SEPARATOR);
}
