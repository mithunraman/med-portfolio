import {
  MessageRole,
  MessageStatus,
  MessageType,
  type Message,
  type SampleTurn,
} from '@acme/shared';

const SAMPLE_CONVERSATION_ID = 'sample';

// Bubbles always show a time, so the sample needs plausible ones: an early evening
// (the case opens "Right, last one of the day"), a couple of minutes per turn.
const BASE_TIME = new Date(2026, 0, 15, 17, 40).getTime();
const TURN_GAP_MS = 2 * 60 * 1000;

/**
 * Adapt the slim sample turns to the `Message` shape `MessageList` renders, so the
 * sample conversation uses the real chat components unchanged. An assistant turn
 * becomes a single-prompt free-text question with no hint examples, its `text`
 * the lead-in line — the same layout a real follow-up has. Ids are synthetic and
 * never reach Redux or the API.
 */
export function toSampleMessages(turns: SampleTurn[]): Message[] {
  return turns.map((turn, index) => {
    const timestamp = new Date(BASE_TIME + index * TURN_GAP_MS).toISOString();
    return {
      id: `sample-${index}`,
      conversationId: SAMPLE_CONVERSATION_ID,
      role: turn.role,
      messageType: MessageType.TEXT,
      status: MessageStatus.COMPLETE,
      content: turn.text,
      media: null,
      question:
        turn.role === MessageRole.ASSISTANT && turn.question
          ? {
              questionType: 'free_text',
              prompts: [{ key: 'q', text: turn.question, hints: { examples: [] } }],
            }
          : null,
      answer: null,
      generated: false,
      editedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });
}
