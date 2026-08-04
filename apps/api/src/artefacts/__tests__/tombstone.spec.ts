import { ArtefactStatus } from '@acme/shared';
import { artefactTombstoneUpdate } from '../artefacts.repository';

describe('artefactTombstoneUpdate', () => {
  it('scrubs every sensitive field on an Artefact via $set', () => {
    const [{ $set }] = artefactTombstoneUpdate();

    expect($set.title).toBe('[deleted]');
    expect($set.composedDocument).toEqual([]);
    expect($set.capabilities).toEqual([]);
    expect($set.tags).toEqual({ $literal: {} });
    expect($set.review).toBeNull();
    expect($set.status).toBe(ArtefactStatus.DELETED);
  });

  it('rewrites note text while preserving the rest of each note', () => {
    const [{ $set }] = artefactTombstoneUpdate();

    expect($set.notes).toEqual({
      $map: {
        input: { $ifNull: ['$notes', []] },
        in: { $mergeObjects: ['$$this', { text: '[deleted]' }] },
      },
    });
  });

  it('is a pipeline, and never reintroduces the all-positional operator', () => {
    // `notes.$[].text` errors on a document where `notes` is absent, which in an
    // updateMany aborts the batch part-applied. The pipeline form exists to avoid
    // that; a regression would most likely arrive as someone "simplifying" it back.
    const update = artefactTombstoneUpdate();

    expect(Array.isArray(update)).toBe(true);
    const keys = update.flatMap((stage) => Object.keys(stage.$set));
    expect(keys.filter((k) => k.includes('$[]'))).toEqual([]);
  });
});
