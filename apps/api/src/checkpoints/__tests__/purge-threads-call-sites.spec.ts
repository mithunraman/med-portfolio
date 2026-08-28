import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

/**
 * `CheckpointRepository.purgeThreads` is the only hard delete in the codebase
 * whose safety cannot live in its own query.
 *
 * It deletes from LangGraph's collections, written by `MongoDBSaver` via the raw
 * driver. Those rows carry `thread_id` and nothing else — there is no `userId`
 * to filter on. So unlike every other repository method, no ownership predicate
 * can be added: the guarantee lives entirely in whoever supplies `threadIds`.
 * And the content is the whole graph state, serialised at every superstep, hard
 * deleted with no tombstone.
 *
 * That makes "who calls this" a property worth asserting. Each caller below has
 * its supplier and its scoping argument recorded, and each is covered by a real
 * integration test. A new call site fails this test, and writing its
 * justification is the review.
 *
 * ## What this does and does not catch
 *
 * Catches: a new direct call site wiring up raw or wrongly-scoped ids.
 * Misses:   an existing caller changing where its threadIds come from, or a call
 *           routed through a wrapper.
 *
 * It is a tripwire, not a proof. The proofs are the integration tests named
 * against each entry.
 */

interface CallSite {
  /** Path relative to `src/`, using forward slashes. */
  file: string;
  /** Where its threadIds come from. */
  supplier: string;
  /** Why that supplier's output is safe to hard-delete. */
  justification: string;
  /** The test that demonstrates it. */
  provenBy: string;
}

const ALLOWED_CALL_SITES: CallSite[] = [
  {
    file: 'analysis-runs/analysis-runs.service.ts',
    supplier: 'AnalysisRunsRepository.findThreadIdsByConversationIds(conversationIds, userId)',
    justification:
      'Entry/conversation delete cascade. The supplier is owner-scoped in its query, so a ' +
      "foreign conversation id cannot contribute a thread. Runs inside the cascade's " +
      'transaction, so an abort does not leave graph state destroyed for an entry that ' +
      'still exists.',
    provenBy: 'analysis-runs/__tests__/cascade-checkpoint-purge.integration.spec.ts',
  },
  {
    file: 'account-cleanup/account-cleanup.service.ts',
    supplier:
      'resolveThreadIds → findThreadIdsByConversationIds(resolveConversationIds(userId), userId)',
    justification:
      'Account deletion. Doubly scoped: the conversation ids are resolved by userId, and the ' +
      'thread query filters on userId again. Erasure completeness therefore depends on ' +
      'AnalysisRun.userId being correct — see the note on the repository method.',
    provenBy: 'account-cleanup/__tests__/account-cleanup.integration.spec.ts',
  },
  {
    file: 'analysis-runs/checkpoint-sweeper.service.ts',
    supplier: 'AnalysisRunsRepository.findRunsForSweepBatch(statuses, cutoff, limit)',
    justification:
      'Retention sweeper, and the one caller that is deliberately CROSS-USER — it must reach ' +
      'every account or checkpoint data accumulates forever. Its safety property is not ' +
      'ownership but selection: terminal statuses only, past the grace window, not already ' +
      'purged. A wrong predicate here destroys live work across all users rather than leaking ' +
      'anything.',
    provenBy: 'analysis-runs/__tests__/checkpoint-sweeper.integration.spec.ts',
  },
];

const SRC_ROOT = resolve(__dirname, '../..');

/** The method's own definition and its interface are not call sites. */
const DEFINITION_FILES = [
  'checkpoints/checkpoint.repository.ts',
  'checkpoints/checkpoint.repository.interface.ts',
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === 'node_modules' ? [] : sourceFiles(full);
    }
    return full.endsWith('.ts') ? [full] : [];
  });
}

function findCallSites(): string[] {
  return sourceFiles(SRC_ROOT)
    .filter((file) => !file.endsWith('.spec.ts'))
    .filter((file) => /\bpurgeThreads\s*\(/.test(readFileSync(file, 'utf8')))
    .map((file) => relative(SRC_ROOT, file).split(sep).join('/'))
    .filter((file) => !DEFINITION_FILES.includes(file))
    .sort();
}

describe('purgeThreads call sites', () => {
  it('are exactly the ones whose scoping has been reviewed', () => {
    // A new entry here is not a formality: purgeThreads cannot defend itself, so
    // the caller's supplier IS the access control. Add the justification and a
    // test that demonstrates it, then add the file below.
    expect(findCallSites()).toEqual(ALLOWED_CALL_SITES.map((site) => site.file).sort());
  });

  it('each name a supplier, a justification and the test that proves it', () => {
    for (const site of ALLOWED_CALL_SITES) {
      expect(site.supplier.length).toBeGreaterThan(0);
      expect(site.justification.length).toBeGreaterThan(0);
      expect(site.provenBy).toMatch(/\.spec\.ts$/);
    }
  });

  it('reference tests that exist', () => {
    for (const site of ALLOWED_CALL_SITES) {
      expect(sourceFiles(SRC_ROOT).map((f) => relative(SRC_ROOT, f).split(sep).join('/'))).toContain(
        site.provenBy
      );
    }
  });
});
