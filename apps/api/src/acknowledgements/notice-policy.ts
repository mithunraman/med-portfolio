import type { NoticeDocument } from '@acme/shared';
import { NOTICE_REGISTRY } from './registry';

export type NeedsReAckResult =
  | { needs: false }
  | {
      needs: true;
      document: NoticeDocument;
      reason: 'first_time' | 'material_change' | 'unknown_version';
    };

interface Registry {
  active: NoticeDocument;
  all: readonly NoticeDocument[];
}

// Pure: decides whether a user needs to (re-)acknowledge based on the versions
// they've previously accepted. The "latest" acked version is chosen by registry
// position, not by storage timestamp — so an older registry-known version acked
// later (buggy client, replay) cannot demote a user back to an older policy.
// Versions absent from the current registry are ignored when picking the max;
// if none of the user's acks appear in the registry, we fail closed.
// Default-param registry keeps InitService callers trivial while letting unit
// tests pass in hand-crafted registries (no jest.mock required).
export function computeNeedsReAck(
  userAcknowledgedVersions: readonly string[],
  registry: Registry = NOTICE_REGISTRY
): NeedsReAckResult {
  const { active, all } = registry;

  if (userAcknowledgedVersions.length === 0) {
    return { needs: true, document: active, reason: 'first_time' };
  }

  let latestIdx = -1;
  for (const version of userAcknowledgedVersions) {
    const idx = all.findIndex((entry) => entry.version === version);
    if (idx > latestIdx) latestIdx = idx;
  }

  if (latestIdx === -1) {
    return { needs: true, document: active, reason: 'unknown_version' };
  }

  const activeIdx = all.findIndex((v) => v.version === active.version);
  if (activeIdx === -1) {
    return { needs: true, document: active, reason: 'unknown_version' };
  }

  // User has acked the active (or a later) version — up-to-date.
  if (latestIdx >= activeIdx) {
    return { needs: false };
  }

  const traversed = all.slice(latestIdx + 1, activeIdx + 1);
  const anyMaterial = traversed.some((v) => v.requiresReAckFromPriorVersions);
  return anyMaterial
    ? { needs: true, document: active, reason: 'material_change' }
    : { needs: false };
}
