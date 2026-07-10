import { MessageRole, type Question } from '@acme/shared';
import {
  AI_TURN_PREFIX,
  TRAINEE_TURN_PREFIX,
  buildTranscript,
  formatAssistantQuestion,
  traineeTurnsOnly,
  type TranscriptMessage,
} from '../transcript-format.util';

const freeText = (texts: string[]): Question =>
  ({
    questionType: 'free_text',
    prompts: texts.map((text) => ({ key: 'reflection', text })),
  }) as unknown as Question;

const select = (): Question => ({ questionType: 'single_select' }) as unknown as Question;

describe('transcript-format.util', () => {
  describe('formatAssistantQuestion', () => {
    it('prefixes free_text questions with the AI marker and joins prompt texts', () => {
      expect(formatAssistantQuestion(freeText(['What happened next?', 'Any follow-up?']))).toBe(
        `${AI_TURN_PREFIX}\nWhat happened next?\nAny follow-up?`
      );
    });

    it('uses a generic label for select-type interrupts (not the marker)', () => {
      expect(formatAssistantQuestion(select())).toBe('AI asked a clarification question.');
    });
  });

  describe('buildTranscript', () => {
    it('prefixes user turns with TRAINEE: and question turns with AI asked:, separated by ---', () => {
      const messages: TranscriptMessage[] = [
        { role: MessageRole.USER, content: '  Saw a 58yo with back pain.  ' },
        { role: MessageRole.ASSISTANT, question: freeText(['What was the outcome?']) },
        { role: MessageRole.USER, content: 'It settled on its own.' },
      ];

      expect(buildTranscript(messages)).toBe(
        `${TRAINEE_TURN_PREFIX}\nSaw a 58yo with back pain.` +
          `\n\n---\n\n${AI_TURN_PREFIX}\nWhat was the outcome?` +
          `\n\n---\n\n${TRAINEE_TURN_PREFIX}\nIt settled on its own.`
      );
    });

    it('skips assistant messages without a question and empty user turns', () => {
      const messages: TranscriptMessage[] = [
        { role: MessageRole.ASSISTANT, question: null }, // e.g. a thinking status message
        { role: MessageRole.USER, content: '' },
        { role: MessageRole.USER, content: 'Real answer.' },
      ];

      expect(buildTranscript(messages)).toBe(`${TRAINEE_TURN_PREFIX}\nReal answer.`);
    });
  });

  describe('traineeTurnsOnly', () => {
    it('keeps only TRAINEE: turns, strips their prefix, and drops AI asked: turns', () => {
      const transcript = buildTranscript([
        { role: MessageRole.USER, content: 'Trainee one.' },
        { role: MessageRole.ASSISTANT, question: freeText(['Trainee two? (AI paraphrase)']) },
        { role: MessageRole.USER, content: 'Trainee three.' },
      ]);

      expect(traineeTurnsOnly(transcript)).toBe('Trainee one.\n\n---\n\nTrainee three.');
    });

    it('excludes assistant-authored text from the verbatim-quote surface', () => {
      const transcript = buildTranscript([
        { role: MessageRole.ASSISTANT, question: freeText(['You mentioned the ramipril was the cause.']) },
        { role: MessageRole.USER, content: 'Yes, that is right.' },
      ]);

      // The AI's paraphrase must not appear in the gate surface; the trainee's words must.
      expect(traineeTurnsOnly(transcript)).not.toContain('ramipril');
      expect(traineeTurnsOnly(transcript)).toBe('Yes, that is right.');
    });

    it('keeps a trainee turn whose own content contains the --- separator (no dropped span)', () => {
      // The trainee typed the exact turn separator as a divider. A naive split
      // would drop the continuation and fail the quote gate for it; a `---` that
      // is not followed by a role marker must be treated as content, not a boundary.
      const transcript = buildTranscript([
        { role: MessageRole.USER, content: 'I started ramipril.\n\n---\n\nThen I safety-netted.' },
      ]);

      const trainee = traineeTurnsOnly(transcript);
      expect(trainee).toContain('I started ramipril.');
      expect(trainee).toContain('Then I safety-netted.');
      expect(trainee).toBe('I started ramipril.\n\n---\n\nThen I safety-netted.');
    });

    it('re-joins a separator-containing trainee turn without leaking a following AI turn', () => {
      const transcript = buildTranscript([
        { role: MessageRole.USER, content: 'First point.\n\n---\n\nSecond point.' },
        { role: MessageRole.ASSISTANT, question: freeText(['An AI paraphrase of ramipril.']) },
        { role: MessageRole.USER, content: 'Final point.' },
      ]);

      const trainee = traineeTurnsOnly(transcript);
      // Both trainee turns survive intact; the AI turn is still excluded.
      expect(trainee).toBe('First point.\n\n---\n\nSecond point.\n\n---\n\nFinal point.');
      expect(trainee).not.toContain('ramipril');
    });
  });
});
