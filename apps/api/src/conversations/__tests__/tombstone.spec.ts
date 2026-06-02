import { ConversationStatus, MessageStatus } from '@acme/shared';
import {
  conversationTombstoneUpdate,
  messageTombstoneUpdate,
} from '../conversations.repository';

describe('conversationTombstoneUpdate', () => {
  it('scrubs every sensitive field on a Conversation via $set', () => {
    const update = conversationTombstoneUpdate();

    expect(update.$set.title).toBe('[deleted]');
    expect(update.$set.status).toBe(ConversationStatus.DELETED);
  });
});

describe('messageTombstoneUpdate', () => {
  it('scrubs every sensitive field on a Message via $set', () => {
    const update = messageTombstoneUpdate();

    expect(update.$set.rawContent).toBe('[deleted]');
    expect(update.$set.cleanedContent).toBe('[deleted]');
    expect(update.$set.content).toBe('[deleted]');
    expect(update.$set.status).toBe(MessageStatus.DELETED);
  });

  it('unsets the polymorphic embed/ref fields ($unset)', () => {
    const update = messageTombstoneUpdate();

    // All three must be unset on every tombstone path — verifying inclusion
    // catches the "markDeletedByUserId forgot to unset media" class of bug
    // that drift between scattered call sites used to allow.
    expect(update.$unset).toEqual({ question: '', answer: '', media: '' });
  });
});
