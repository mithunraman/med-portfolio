import type { NoticeDocument } from '@acme/shared';
import { computeNeedsReAck } from '../notice-policy';

const base: Omit<NoticeDocument, 'version' | 'requiresReAckFromPriorVersions'> = {
  title: '',
  subtitle: null,
  body: [],
  acknowledgements: [],
  ctaLabel: '',
  ctaDisclaimer: '',
};

const v1_0: NoticeDocument = { ...base, version: 'v1.0', requiresReAckFromPriorVersions: false };
const v1_1: NoticeDocument = { ...base, version: 'v1.1', requiresReAckFromPriorVersions: false };
const v1_2: NoticeDocument = { ...base, version: 'v1.2', requiresReAckFromPriorVersions: true };
const v1_3: NoticeDocument = { ...base, version: 'v1.3', requiresReAckFromPriorVersions: false };

const fourVersionRegistry = { active: v1_3, all: [v1_0, v1_1, v1_2, v1_3] as const };
const singleVersionRegistry = { active: v1_0, all: [v1_0] as const };

describe('computeNeedsReAck', () => {
  it('returns first_time when user has no prior acknowledgements', () => {
    expect(computeNeedsReAck([], fourVersionRegistry)).toEqual({
      needs: true,
      document: v1_3,
      reason: 'first_time',
    });
  });

  it('returns needs:false when user is on the active version', () => {
    expect(computeNeedsReAck(['v1.3'], fourVersionRegistry)).toEqual({ needs: false });
  });

  it('returns material_change when the chain crosses a material version (v1.0 → v1.3)', () => {
    expect(computeNeedsReAck(['v1.0'], fourVersionRegistry)).toEqual({
      needs: true,
      document: v1_3,
      reason: 'material_change',
    });
  });

  it('returns material_change when chain v1.1 → v1.3 still includes material v1.2', () => {
    expect(computeNeedsReAck(['v1.1'], fourVersionRegistry)).toEqual({
      needs: true,
      document: v1_3,
      reason: 'material_change',
    });
  });

  it('returns needs:false when traversed range v1.2 → v1.3 has no material versions', () => {
    expect(computeNeedsReAck(['v1.2'], fourVersionRegistry)).toEqual({ needs: false });
  });

  it('returns unknown_version when none of the user-acked versions are in the registry', () => {
    expect(computeNeedsReAck(['v0.9-retired'], fourVersionRegistry)).toEqual({
      needs: true,
      document: v1_3,
      reason: 'unknown_version',
    });
  });

  it('returns first_time on single-version registry when user has no acks', () => {
    expect(computeNeedsReAck([], singleVersionRegistry)).toEqual({
      needs: true,
      document: v1_0,
      reason: 'first_time',
    });
  });

  it('returns needs:false on single-version registry when user is on it', () => {
    expect(computeNeedsReAck(['v1.0'], singleVersionRegistry)).toEqual({ needs: false });
  });

  // Defends against the bug the new shape was introduced to prevent:
  // a buggy client POSTs an older registry-known version *after* acking the
  // active one. With timestamp-based "latest" this caused a re-ack loop;
  // registry-order resolution makes ack order in the array irrelevant.
  it('picks the highest registry-position version regardless of array order', () => {
    expect(computeNeedsReAck(['v1.3', 'v1.0'], fourVersionRegistry)).toEqual({ needs: false });
    expect(computeNeedsReAck(['v1.0', 'v1.3'], fourVersionRegistry)).toEqual({ needs: false });
  });

  it('ignores unknown versions when picking the latest, uses known max', () => {
    expect(computeNeedsReAck(['v0.9-retired', 'v1.2'], fourVersionRegistry)).toEqual({
      needs: false,
    });
  });

  it('returns material_change when an old known version sits beside an unknown one', () => {
    expect(computeNeedsReAck(['v0.9-retired', 'v1.0'], fourVersionRegistry)).toEqual({
      needs: true,
      document: v1_3,
      reason: 'material_change',
    });
  });
});
