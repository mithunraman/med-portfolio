import { ArtefactStatus } from '@acme/shared';
import { artefactTombstoneUpdate } from '../artefacts.repository';

describe('artefactTombstoneUpdate', () => {
  it('scrubs every sensitive field on an Artefact via $set', () => {
    const update = artefactTombstoneUpdate();

    expect(update.$set.title).toBe('[deleted]');
    expect(update.$set.composedDocument).toEqual([]);
    expect(update.$set.capabilities).toEqual([]);
    expect(update.$set.tags).toEqual({});
    expect(update.$set.status).toBe(ArtefactStatus.DELETED);
  });
});
