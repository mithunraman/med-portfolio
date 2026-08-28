import { Types } from 'mongoose';
import { Snapshot, diffSnapshots, docKey, intersect } from '../blast-radius';

/**
 * The harness is only as trustworthy as its diff. Every ownership assertion in
 * the repository suites reduces to `diffSnapshots(...).touched`, so a bug here
 * turns the whole ownership suite green regardless of what the filters do.
 *
 * `snapshotAll` needs a live connection and is exercised by the integration
 * suites; the pure logic it depends on is covered here.
 */

// Mirrors what snapshotAll stores: canonical JSON keyed by `collection:_id`.
function snap(entries: Record<string, unknown>): Snapshot {
  return new Map(Object.entries(entries).map(([key, value]) => [key, JSON.stringify(value)]));
}

describe('diffSnapshots', () => {
  it('reports an unchanged snapshot as an empty blast radius', () => {
    const before = snap({ 'artefacts:a': { status: 1 }, 'artefacts:b': { status: 1 } });
    const after = snap({ 'artefacts:a': { status: 1 }, 'artefacts:b': { status: 1 } });

    expect(diffSnapshots(before, after).touched).toEqual([]);
  });

  it('classifies changed, added and removed documents separately', () => {
    const before = snap({ 'artefacts:a': { status: 1 }, 'artefacts:gone': { status: 1 } });
    const after = snap({ 'artefacts:a': { status: 2 }, 'artefacts:new': { status: 1 } });

    const diff = diffSnapshots(before, after);

    expect(diff.changed).toEqual(['artefacts:a']);
    expect(diff.added).toEqual(['artefacts:new']);
    expect(diff.removed).toEqual(['artefacts:gone']);
    expect(diff.touched).toEqual(['artefacts:a', 'artefacts:gone', 'artefacts:new']);
  });

  it('detects a hard delete — the case deleteMany specs depend on', () => {
    const before = snap({ 'pdp_goals:a': { status: 0 } });
    const after = snap({});

    const diff = diffSnapshots(before, after);

    expect(diff.removed).toEqual(['pdp_goals:a']);
    expect(diff.touched).toEqual(['pdp_goals:a']);
  });

  it('spans collections, so a cascade into a second collection is visible', () => {
    const before = snap({ 'conversations:c': { status: 1 }, 'messages:m': { status: 1 } });
    const after = snap({ 'conversations:c': { status: 1 }, 'messages:m': { status: 9 } });

    expect(diffSnapshots(before, after).touched).toEqual(['messages:m']);
  });

  it('notices a nested field change', () => {
    const before = snap({ 'artefacts:a': { notes: [{ xid: 'n1', text: 'clinical' }] } });
    const after = snap({ 'artefacts:a': { notes: [{ xid: 'n1', text: '[deleted]' }] } });

    expect(diffSnapshots(before, after).changed).toEqual(['artefacts:a']);
  });
});

describe('intersect', () => {
  it('returns only shared keys, preserving the order of the first list', () => {
    expect(intersect(['a', 'b', 'c'], ['c', 'a'])).toEqual(['a', 'c']);
  });

  it('returns an empty list for disjoint key sets', () => {
    expect(intersect(['a'], ['b'])).toEqual([]);
  });
});

describe('docKey', () => {
  it('renders an ObjectId by its hex string, not its object form', () => {
    const id = new Types.ObjectId();

    expect(docKey('artefacts', id)).toBe(`artefacts:${id.toHexString()}`);
  });
});
