import type { ArtefactNoteData } from '../artefacts.repository.interface';
import { reconcileNotes } from '../utils/notes-reconcile.util';

// ── Helpers ──

const T0 = new Date('2026-01-01T00:00:00.000Z'); // existing-note createdAt
const T1 = new Date('2026-01-02T00:00:00.000Z'); // existing-note updatedAt
const NOW = new Date('2026-06-23T12:00:00.000Z'); // injected "now"

function existing(xid: string, text: string): ArtefactNoteData {
  return { xid, text, createdAt: T0, updatedAt: T1 };
}

describe('reconcileNotes', () => {
  it('mints xid + both timestamps for a new note (no xid)', () => {
    const result = reconcileNotes([], [{ text: 'fresh note' }], NOW);

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('fresh note');
    expect(typeof result[0].xid).toBe('string');
    expect(result[0].xid.length).toBe(21);
    expect(result[0].createdAt).toBe(NOW);
    expect(result[0].updatedAt).toBe(NOW);
  });

  it('keeps createdAt and bumps updatedAt when an existing note text changes', () => {
    const current = [existing('n1', 'old text')];

    const result = reconcileNotes(current, [{ xid: 'n1', text: 'new text' }], NOW);

    expect(result).toEqual([{ xid: 'n1', text: 'new text', createdAt: T0, updatedAt: NOW }]);
  });

  it('leaves updatedAt untouched when an existing note is unchanged', () => {
    const current = [existing('n1', 'same text')];

    const result = reconcileNotes(current, [{ xid: 'n1', text: 'same text' }], NOW);

    expect(result).toEqual([{ xid: 'n1', text: 'same text', createdAt: T0, updatedAt: T1 }]);
  });

  it('drops a persisted note whose xid is omitted from the incoming array (delete)', () => {
    const current = [existing('n1', 'keep'), existing('n2', 'remove')];

    const result = reconcileNotes(current, [{ xid: 'n1', text: 'keep' }], NOW);

    expect(result.map((n) => n.xid)).toEqual(['n1']);
  });

  it('treats an unknown/forged xid as a new note (mints a fresh xid, never reuses the supplied one)', () => {
    const current = [existing('n1', 'real')];

    const result = reconcileNotes(current, [{ xid: 'forged-or-stale', text: 'attacker text' }], NOW);

    expect(result).toHaveLength(1);
    expect(result[0].xid).not.toBe('forged-or-stale');
    expect(result[0].xid.length).toBe(21);
    expect(result[0].createdAt).toBe(NOW);
    expect(result[0].updatedAt).toBe(NOW);
  });

  it('clears all notes when the incoming array is empty', () => {
    const current = [existing('n1', 'a'), existing('n2', 'b')];

    expect(reconcileNotes(current, [], NOW)).toEqual([]);
  });

  it('handles a mixed add + edit + delete in one pass, preserving incoming order', () => {
    const current = [existing('n1', 'first'), existing('n2', 'second')];

    const result = reconcileNotes(
      current,
      [
        { xid: 'n2', text: 'second edited' }, // edit (reordered first)
        { text: 'brand new' }, // add
        // n1 omitted -> delete
      ],
      NOW
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ xid: 'n2', text: 'second edited', createdAt: T0, updatedAt: NOW });
    expect(result[1].text).toBe('brand new');
    expect(result[1].xid.length).toBe(21);
    expect(result[1].createdAt).toBe(NOW);
    expect(result.some((n) => n.xid === 'n1')).toBe(false);
  });
});
