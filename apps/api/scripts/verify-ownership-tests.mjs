#!/usr/bin/env node
/* eslint-disable */
/**
 * Mutation check for the ownership / blast-radius suites.
 *
 * The suites in `*.blast-radius.integration.spec.ts` assert that a repository
 * method touches only the record it was given, and refuses a caller who does not
 * own it. This script proves those assertions actually bite: it introduces one
 * deliberate defect at a time into a repository query — dropping the owner
 * predicate, or dropping the record predicate — runs that repository's suite, and
 * checks the *expected* case went red.
 *
 * A suite that stays green against a broken filter is worse than no suite, since
 * it licenses the belief that ownership is covered. This is how we know it isn't
 * doing that.
 *
 *   pnpm verify:ownership                        # every repository
 *   pnpm verify:ownership ArtefactsRepository    # just one
 *
 * Exit code is 0 only if every mutation was caught by the case that should catch
 * it, so this can gate CI later.
 *
 * ── Safety ──
 *
 * This script EDITS PRODUCTION SOURCE FILES and restores them afterwards. It
 * restores from an in-memory copy in a `finally` block (plus a signal handler),
 * never via `git checkout`, so an interrupted run cannot destroy uncommitted work.
 * It also refuses to start if a target file already has uncommitted changes —
 * otherwise a failed restore would be indistinguishable from your own edits.
 *
 * ── Maintenance ──
 *
 * Each mutation locates its target by an exact source string and requires it to
 * match EXACTLY ONCE. When a query is refactored the anchor stops matching and the
 * run fails loudly ("anchor matched 0 times") rather than silently skipping the
 * check — drift is visible, not silent.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ── Mutation tables ────────────────────────────────────────────────────────────
//
// expect:  'owner'   the "owner call touches only the target" case must fail
//          'foreign' the "foreign caller is refused / changes nothing" case must fail
//          'both'    both must fail
//          'any'     at least one test must fail, without requiring it to be a
//                    generated case — for defects whose fixture the harness does
//                    not produce, caught instead by a hand-written test.
//          'none'    the defect is deliberately NOT an ownership defect — nothing
//                    may fail. Use only with a comment saying why, and never to
//                    silence an inconvenient result. It is a watchdog as much as a
//                    waiver: if the method changes so the query becomes solely
//                    responsible for scoping, the mutation starts failing and this
//                    expectation breaks, which is the signal to reclassify it.
//
// `spec` is a jest path pattern covering ALL of a repository's own suites — the
// generated blast-radius file and any hand-written companion — because a defect
// caught by a hand-written test is caught. It deliberately excludes the module's
// service-level integration specs: they are slow, and a repository defect showing
// up there is incidental rather than the coverage we are verifying.
//
// Dropping the OWNER predicate is a cross-user defect and shows up on the foreign
// case. Dropping the RECORD predicate widens onto the caller's own other records
// and shows up on the owner case — which is why the harness seeds sibling records
// either side of the target.

const ARTEFACTS = {
  updateById: '.findOneAndUpdate({ _id: id, userId }, { $set: data }, { new: true, session })',
  findById: '.findOne({ userId, _id: id, ...ARTEFACT_LIVE_FILTER })',
  findByXid: '.findOne({ xid, userId, ...ARTEFACT_LIVE_FILTER })',
  review: '{ xid, userId, ...ARTEFACT_LIVE_FILTER },',
  notes:
    '            xid,\n' +
    '            userId: new Types.ObjectId(userId),\n' +
    '            status: { $nin: [ArtefactStatus.DELETED, ArtefactStatus.ARCHIVED] },\n',
  markDeleted: '{ userId, _id: { $in: ids }, status: { $ne: ArtefactStatus.DELETED } },',
  markByUser: '{ userId, status: { $ne: ArtefactStatus.DELETED } },',
  list: '      } = {\n        userId: query.userId,\n      };',
  count: 'const query: Record<string, unknown> = { userId: new Types.ObjectId(userId) };',
};

const PDP = {
  byArtefactIds: '.find({ [LINK_ARTEFACT_PATH]: { $in: ids }, userId })',
  byArtefactId: '.find({ [LINK_ARTEFACT_PATH]: id, userId })',
  lookupMatch: '{ $match: { xid: goalXid, userId } },',
  saveGoal: '.updateOne({ xid, userId }, { $set: setFields })',
  proposalOwner: '      userId,\n      status: PdpGoalStatus.PROPOSED,',
  proposalLink:
    '$elemMatch: { artefactId: { $in: artefactIds }, linkedBy: PdpGoalLinkSource.ANALYSIS },',
  anonymize: '{ xid, userId, status: { $ne: PdpGoalStatus.DELETED } },',
  markByUser: '{ userId, status: { $ne: PdpGoalStatus.DELETED } },',
  userFilter: "const filter: Record<string, unknown> = { userId, status: { $in: statuses } };",
};

const CONV = {
  byId: '.findOne({ _id: conversationId, userId, ...CONVERSATION_LIVE_FILTER })',
  byXid: '.findOne({ xid, userId, ...CONVERSATION_LIVE_FILTER })',
  activeByArtefact: '.findOne({ artefact: artefactId, userId, status: ConversationStatus.ACTIVE })',
  activeByArtefacts: '          artefact: { $in: artefactIds },\n          userId,\n',
  artefactRef: '.findOne({ userId, _id: conversationId })',
  idsByArtefacts: '.find({ userId, artefact: { $in: artefactIds } })',
  idsByUser: ".find({ userId }).distinct('_id')",
  msgById: '.findOne({ userId, _id: messageId })',
  msgByXids: '.find({ xid: { $in: xids }, userId })',
  msgByIdem: '.findOne({ userId, idempotencyKey })',
  listMsgs:
    '.find({ userId: query.userId, conversation: query.conversation, ...MESSAGE_LIVE_FILTER })',
  hasComplete:
    '          userId,\n          conversation: conversationId,\n' +
    '          role: MessageRole.USER,\n          status: MessageStatus.COMPLETE,',
  hasProcessing:
    '          userId,\n          conversation: conversationId,\n' +
    '          role: MessageRole.USER,\n' +
    '          // Explicit membership, not an ordinal range: correct regardless of the',
  lastRole: '.findOne({ userId, conversation: conversationId, ...MESSAGE_LIVE_FILTER })',
  laterAssistant:
    '          userId,\n          conversation: conversationId,\n' +
    '          role: MessageRole.ASSISTANT,',
  updateMsg: '{ userId, _id: messageId, ...MESSAGE_LIVE_FILTER },',
  updateMsgRaw:
    "{ userId, _id: messageId, rawContent: { $type: 'string' }, ...MESSAGE_LIVE_FILTER },",
  markConv: '{ userId, _id: { $in: ids }, status: { $ne: ConversationStatus.DELETED } },',
  markConvByUser: '{ userId, status: { $ne: ConversationStatus.DELETED } },',
  markMsgIds: '{ userId, _id: { $in: ids }, status: { $ne: MessageStatus.DELETED } },',
  markMsgByConv: '          userId,\n          conversation: { $in: conversationIds },\n',
};

const VERSIONS = {
  byEntity: '.find({ entityType, entityId, userId })',
  oneVersion: '.findOne({ entityType, entityId, userId, version })',
  count: '.countDocuments({ entityType, entityId, userId })',
  anonymize: '{ userId, entityType, entityId: { $in: entityIds } },',
  deleteByUser: '.deleteMany({ userId })',
};

const RUNS = {
  byId: '.findOne({ userId, _id: runId })',
  byIdem: '.findOne({ userId, conversationId, idempotencyKey })',
  active: '          userId,\n          conversationId,\n          status: { $in: ACTIVE_STATUSES },',
  executing:
    '          userId,\n          conversationId,\n          status: { $in: EXECUTING_STATUSES },',
  latest: '.findOne({ userId, conversationId })\n        .sort({ createdAt: -1 })',
  maxRunNumber: '.findOne({ userId, conversationId })\n        .sort({ runNumber: -1 })',
  updateStatus: '{ userId, _id: runId, status: expectedStatus },',
  currentStep: '{ userId, conversationId, status: { $in: ACTIVE_STATUSES } },',
  listRuns: '.find({ userId, conversationId })',
  threadIds: '.find({ userId, conversationId: { $in: conversationIds } })',
  markByConv: '          userId,\n          conversationId: { $in: conversationIds },\n',
  markByArtefact: '          userId,\n          artefactId: { $in: artefactIds },\n',
};

const MEDIA = {
  byXid: '.findOne({ xid, userId })',
  updateStatus: '.findOneAndUpdate({ xid, userId }, { $set: updateData }, { new: true })',
  byUser: ".find({ userId }).select('bucket key')",
  pendingByMessages:
    '          userId,\n          refDocumentId: { $in: messageIds },\n',
  pendingByUser:
    '          userId: new Types.ObjectId(userId),\n' +
    '          status: { $in: [MediaStatus.ATTACHED, MediaStatus.PENDING] },',
};

const SESSIONS = {
  listActive:
    '          userId: new Types.ObjectId(userId),\n          revokedAt: null,\n' +
    '          expiresAt: { $gt: new Date() },',
  rotateCas:
    '            _id: oid,\n            refreshTokenHash: expectedOldHash,\n' +
    '            revokedAt: null,',
  revokeOwnedById: '{ _id: oid, userId: new Types.ObjectId(userId), revokedAt: null },',
  revokeByDevice: '{ userId: new Types.ObjectId(userId), deviceId, revokedAt: null },',
  revokeOwnedByXid:
    '          xid: sessionXid,\n          userId: new Types.ObjectId(userId),\n',
  revokeAll: '{ userId: new Types.ObjectId(userId), revokedAt: null },',
  revokeFamily:
    '{ refreshTokenFamily: family, userId: new Types.ObjectId(userId), revokedAt: null },',
};

const REPOS = [
  {
    name: 'ArtefactsRepository',
    file: 'src/artefacts/artefacts.repository.ts',
    spec: 'src/artefacts/__tests__/artefacts.repository',
    mutations: [
      // Drop the owner predicate.
      ['updateArtefactById — drop userId', 'foreign', ARTEFACTS.updateById,
        '.findOneAndUpdate({ _id: id }, { $set: data }, { new: true, session })'],
      ['findById — drop userId', 'foreign', ARTEFACTS.findById,
        '.findOne({ _id: id, ...ARTEFACT_LIVE_FILTER })'],
      ['findByXid — drop userId', 'foreign', ARTEFACTS.findByXid,
        '.findOne({ xid, ...ARTEFACT_LIVE_FILTER })'],
      ['upsertReview — drop userId', 'foreign', ARTEFACTS.review,
        '{ xid, ...ARTEFACT_LIVE_FILTER },'],
      ['replaceNotes — drop userId', 'foreign', ARTEFACTS.notes,
        '            xid,\n' +
        '            status: { $nin: [ArtefactStatus.DELETED, ArtefactStatus.ARCHIVED] },\n'],
      ['markDeleted — drop userId', 'foreign', ARTEFACTS.markDeleted,
        '{ _id: { $in: ids }, status: { $ne: ArtefactStatus.DELETED } },'],

      // Drop the record predicate.
      ['updateArtefactById — drop _id', 'both', ARTEFACTS.updateById,
        '.findOneAndUpdate({ userId }, { $set: data }, { new: true, session })'],
      ['findById — drop _id', 'both', ARTEFACTS.findById,
        '.findOne({ userId, ...ARTEFACT_LIVE_FILTER })'],
      ['findByXid — drop xid', 'both', ARTEFACTS.findByXid,
        '.findOne({ userId, ...ARTEFACT_LIVE_FILTER })'],
      ['upsertReview — drop xid', 'both', ARTEFACTS.review, '{ userId, ...ARTEFACT_LIVE_FILTER },'],
      ['replaceNotes — drop xid', 'both', ARTEFACTS.notes,
        '            userId: new Types.ObjectId(userId),\n' +
        '            status: { $nin: [ArtefactStatus.DELETED, ArtefactStatus.ARCHIVED] },\n'],
      ['markDeleted — drop _id', 'both', ARTEFACTS.markDeleted,
        '{ userId, status: { $ne: ArtefactStatus.DELETED } },'],

      // Owner-axis methods: a single predicate to lose.
      ['listArtefacts — drop userId', 'both', ARTEFACTS.list, '      } = {\n      };'],
      ['countByUser — drop userId', 'both', ARTEFACTS.count,
        'const query: Record<string, unknown> = {};'],
      ['markDeletedByUserId — drop userId', 'both', ARTEFACTS.markByUser,
        '{ status: { $ne: ArtefactStatus.DELETED } },'],
    ],
  },
  {
    name: 'PdpGoalsRepository',
    file: 'src/pdp-goals/pdp-goals.repository.ts',
    spec: 'src/pdp-goals/__tests__/pdp-goals.repository',
    mutations: [
      // Drop the owner predicate.
      ['findByArtefactIds — drop userId', 'foreign', PDP.byArtefactIds,
        '.find({ [LINK_ARTEFACT_PATH]: { $in: ids } })'],
      ['findByArtefactId — drop userId', 'foreign', PDP.byArtefactId,
        '.find({ [LINK_ARTEFACT_PATH]: id })'],
      ['findOneWithArtefacts — drop userId', 'foreign', PDP.lookupMatch,
        '{ $match: { xid: goalXid } },'],
      ['saveGoal — drop userId', 'foreign', PDP.saveGoal,
        '.updateOne({ xid }, { $set: setFields })'],
      ['proposalFilter — drop userId', 'foreign', PDP.proposalOwner,
        '      status: PdpGoalStatus.PROPOSED,'],
      ['anonymizeGoal — drop userId', 'foreign', PDP.anonymize,
        '{ xid, status: { $ne: PdpGoalStatus.DELETED } },'],

      // Drop the record predicate.
      // Over-fetches every goal the owner has, but the method re-narrows to the
      // requested ids in application code (the `requested` Set), so the returned
      // map is identical and correctly scoped. A performance defect, not an
      // ownership one — the owner predicate is untouched. Contrast the singular
      // findByArtefactId below, which returns the query result directly and so
      // does surface it.
      ['findByArtefactIds — drop link path', 'none', PDP.byArtefactIds, '.find({ userId })'],
      ['findByArtefactId — drop link path', 'both', PDP.byArtefactId, '.find({ userId })'],
      ['findOneWithArtefacts — drop xid', 'both', PDP.lookupMatch, '{ $match: { userId } },'],
      ['saveGoal — drop xid', 'both', PDP.saveGoal, '.updateOne({ userId }, { $set: setFields })'],
      ['anonymizeGoal — drop xid', 'both', PDP.anonymize,
        '{ userId, status: { $ne: PdpGoalStatus.DELETED } },'],
      // Not a generated case: the harness seeds one goal per artefact, so
      // `artefactId` alone identifies the target and `xid` does no work. Analysis
      // routinely proposes SEVERAL goals from one entry, where it does — covered by
      // a hand-written test in pdp-goals.repository.integration.spec.ts.
      ['updateProposalForArtefact — drop xid', 'any',
        'const proposalGuard = { xid: goalXid, ...this.proposalFilter([artefactId], userId) };',
        'const proposalGuard = { ...this.proposalFilter([artefactId], userId) };'],
      // Shared by updateProposalForArtefact and deleteUnadoptedProposals: without
      // it, finalising one entry reaches every other proposal the trainee owns.
      ['proposalFilter — drop artefact link', 'both', PDP.proposalLink,
        '$elemMatch: { linkedBy: PdpGoalLinkSource.ANALYSIS },'],

      // Owner-axis methods.
      ['buildUserGoalsFilter — drop userId', 'both', PDP.userFilter,
        "const filter: Record<string, unknown> = { status: { $in: statuses } };"],
      ['markDeletedByUserId — drop userId', 'both', PDP.markByUser,
        '{ status: { $ne: PdpGoalStatus.DELETED } },'],
    ],
  },
  {
    name: 'ConversationsRepository',
    file: 'src/conversations/conversations.repository.ts',
    spec: 'src/conversations/__tests__/conversations.repository',
    mutations: [
      // Drop the owner predicate — conversation reads.
      ['findConversationById — drop userId', 'foreign', CONV.byId,
        '.findOne({ _id: conversationId, ...CONVERSATION_LIVE_FILTER })'],
      ['findConversationByXid — drop userId', 'foreign', CONV.byXid,
        '.findOne({ xid, ...CONVERSATION_LIVE_FILTER })'],
      ['findActiveConversationByArtefact — drop userId', 'foreign', CONV.activeByArtefact,
        '.findOne({ artefact: artefactId, status: ConversationStatus.ACTIVE })'],
      ['findActiveConversationsByArtefacts — drop userId', 'foreign', CONV.activeByArtefacts,
        '          artefact: { $in: artefactIds },\n'],
      ['findArtefactRefByConversationId — drop userId', 'foreign', CONV.artefactRef,
        '.findOne({ _id: conversationId })'],
      ['findIdsByArtefactIds — drop userId', 'foreign', CONV.idsByArtefacts,
        '.find({ artefact: { $in: artefactIds } })'],

      // Drop the owner predicate — message reads and predicates.
      ['findMessageById — drop userId', 'foreign', CONV.msgById, '.findOne({ _id: messageId })'],
      ['findMessagesByXids — drop userId', 'foreign', CONV.msgByXids,
        '.find({ xid: { $in: xids } })'],
      ['findMessageByIdempotencyKey — drop userId', 'foreign', CONV.msgByIdem,
        '.findOne({ idempotencyKey })'],
      ['listMessages — drop userId', 'foreign', CONV.listMsgs,
        '.find({ conversation: query.conversation, ...MESSAGE_LIVE_FILTER })'],
      ['hasCompleteMessages — drop userId', 'foreign', CONV.hasComplete,
        '          conversation: conversationId,\n' +
        '          role: MessageRole.USER,\n          status: MessageStatus.COMPLETE,'],
      ['hasProcessingMessages — drop userId', 'foreign', CONV.hasProcessing,
        '          conversation: conversationId,\n          role: MessageRole.USER,\n' +
        '          // Explicit membership, not an ordinal range: correct regardless of the'],
      ['getLastMessageRole — drop userId', 'foreign', CONV.lastRole,
        '.findOne({ conversation: conversationId, ...MESSAGE_LIVE_FILTER })'],
      ['hasLaterAssistantMessage — drop userId', 'foreign', CONV.laterAssistant,
        '          conversation: conversationId,\n          role: MessageRole.ASSISTANT,'],

      // Drop the owner predicate — writes.
      ['updateMessage — drop userId', 'foreign', CONV.updateMsg,
        '{ _id: messageId, ...MESSAGE_LIVE_FILTER },'],
      ['updateMessageIfRawContentPresent — drop userId', 'foreign', CONV.updateMsgRaw,
        "{ _id: messageId, rawContent: { $type: 'string' }, ...MESSAGE_LIVE_FILTER },"],
      ['markDeleted — drop userId', 'foreign', CONV.markConv,
        '{ _id: { $in: ids }, status: { $ne: ConversationStatus.DELETED } },'],
      ['markDeletedMessagesByIds — drop userId', 'foreign', CONV.markMsgIds,
        '{ _id: { $in: ids }, status: { $ne: MessageStatus.DELETED } },'],
      ['markDeletedMessagesByConversationIds — drop userId', 'foreign', CONV.markMsgByConv,
        '          conversation: { $in: conversationIds },\n'],

      // Drop the record predicate — the caller's own other records become reachable.
      ['findConversationById — drop _id', 'both', CONV.byId,
        '.findOne({ userId, ...CONVERSATION_LIVE_FILTER })'],
      ['findMessageById — drop _id', 'both', CONV.msgById, '.findOne({ userId })'],
      ['updateMessage — drop _id', 'both', CONV.updateMsg, '{ userId, ...MESSAGE_LIVE_FILTER },'],
      ['markDeleted — drop _id', 'both', CONV.markConv,
        '{ userId, status: { $ne: ConversationStatus.DELETED } },'],
      ['markDeletedMessagesByIds — drop _id', 'both', CONV.markMsgIds,
        '{ userId, status: { $ne: MessageStatus.DELETED } },'],
      ['markDeletedMessagesByConversationIds — drop conversation', 'both', CONV.markMsgByConv,
        '          userId,\n'],

      // Owner-axis methods.
      ['findConversationIdsByUser — drop userId', 'both', CONV.idsByUser,
        ".find({}).distinct('_id')"],
      ['markDeletedByUserId — drop userId', 'both', CONV.markConvByUser,
        '{ status: { $ne: ConversationStatus.DELETED } },'],
    ],
  },
  {
    name: 'VersionHistoryRepository',
    file: 'src/version-history/version-history.repository.ts',
    spec: 'src/version-history/__tests__/version-history.repository',
    mutations: [
      // Drop the owner predicate.
      ['findByEntity — drop userId', 'foreign', VERSIONS.byEntity,
        '.find({ entityType, entityId })'],
      ['findVersion — drop userId', 'foreign', VERSIONS.oneVersion,
        '.findOne({ entityType, entityId, version })'],
      ['countByEntity — drop userId', 'foreign', VERSIONS.count,
        '.countDocuments({ entityType, entityId })'],
      ['anonymizeByEntity — drop userId', 'foreign', VERSIONS.anonymize,
        '{ entityType, entityId: { $in: entityIds } },'],

      // Drop the record id — widens onto the caller's other entities.
      ['findByEntity — drop entityId', 'both', VERSIONS.byEntity,
        '.find({ entityType, userId })'],
      ['findVersion — drop entityId', 'both', VERSIONS.oneVersion,
        '.findOne({ entityType, userId, version })'],
      ['countByEntity — drop entityId', 'both', VERSIONS.count,
        '.countDocuments({ entityType, userId })'],
      ['anonymizeByEntity — drop entityId', 'both', VERSIONS.anonymize, '{ userId, entityType },'],

      // Drop the entity-type discriminator. Not a live leak — entity ids are
      // ObjectIds, so cross-entity collision is not a practical risk — but this
      // collection is entity-agnostic by design and the discriminator must keep
      // working when a second entity type ships.
      ['findByEntity — drop entityType', 'owner', VERSIONS.byEntity,
        '.find({ entityId, userId })'],
      ['countByEntity — drop entityType', 'owner', VERSIONS.count,
        '.countDocuments({ entityId, userId })'],
      ['anonymizeByEntity — drop entityType', 'owner', VERSIONS.anonymize,
        '{ userId, entityId: { $in: entityIds } },'],

      // Owner-axis hard delete — over-deletion here is unrecoverable.
      ['deleteByUserId — drop userId', 'both', VERSIONS.deleteByUser, '.deleteMany({})'],
    ],
  },
  {
    name: 'AnalysisRunsRepository',
    file: 'src/analysis-runs/analysis-runs.repository.ts',
    spec: 'src/analysis-runs/__tests__/analysis-runs.repository',
    mutations: [
      // Drop the owner predicate.
      ['findRunById — drop userId', 'foreign', RUNS.byId, '.findOne({ _id: runId })'],
      ['findRunByIdempotencyKey — drop userId', 'foreign', RUNS.byIdem,
        '.findOne({ conversationId, idempotencyKey })'],
      ['findActiveRun — drop userId', 'foreign', RUNS.active,
        '          conversationId,\n          status: { $in: ACTIVE_STATUSES },'],
      ['findExecutingRun — drop userId', 'foreign', RUNS.executing,
        '          conversationId,\n          status: { $in: EXECUTING_STATUSES },'],
      ['findLatestRun — drop userId', 'foreign', RUNS.latest,
        '.findOne({ conversationId })\n        .sort({ createdAt: -1 })'],
      ['getMaxRunNumber — drop userId', 'foreign', RUNS.maxRunNumber,
        '.findOne({ conversationId })\n        .sort({ runNumber: -1 })'],
      ['listRuns — drop userId', 'foreign', RUNS.listRuns, '.find({ conversationId })'],
      ['findThreadIdsByConversationIds — drop userId', 'foreign', RUNS.threadIds,
        '.find({ conversationId: { $in: conversationIds } })'],
      ['updateRunStatus — drop userId', 'foreign', RUNS.updateStatus,
        '{ _id: runId, status: expectedStatus },'],
      ['updateCurrentStep — drop userId', 'foreign', RUNS.currentStep,
        '{ conversationId, status: { $in: ACTIVE_STATUSES } },'],
      ['markDeletedByConversationIds — drop userId', 'foreign', RUNS.markByConv,
        '          conversationId: { $in: conversationIds },\n'],
      ['markDeletedByArtefactIds — drop userId', 'foreign', RUNS.markByArtefact,
        '          artefactId: { $in: artefactIds },\n'],

      // Drop the record predicate — widens onto the caller's own other runs.
      ['findRunById — drop _id', 'both', RUNS.byId, '.findOne({ userId })'],
      ['listRuns — drop conversationId', 'both', RUNS.listRuns, '.find({ userId })'],
      ['findThreadIdsByConversationIds — drop conversationId', 'both', RUNS.threadIds,
        '.find({ userId })'],
      ['updateRunStatus — drop _id', 'both', RUNS.updateStatus,
        '{ userId, status: expectedStatus },'],
      ['updateCurrentStep — drop conversationId', 'both', RUNS.currentStep,
        '{ userId, status: { $in: ACTIVE_STATUSES } },'],
      ['markDeletedByConversationIds — drop conversationId', 'both', RUNS.markByConv,
        '          userId,\n'],
      ['markDeletedByArtefactIds — drop artefactId', 'both', RUNS.markByArtefact,
        '          userId,\n'],

      // The compare-and-set precondition must not be what enforces ownership:
      // dropping it alone should change nothing the ownership cases assert.
      ['updateRunStatus — drop expectedStatus', 'none', RUNS.updateStatus, '{ userId, _id: runId },'],
    ],
  },
  {
    name: 'MediaRepository',
    file: 'src/media/media.repository.ts',
    spec: 'src/media/__tests__/media.repository',
    mutations: [
      // Drop the owner predicate.
      ['findByXid — drop userId', 'foreign', MEDIA.byXid, '.findOne({ xid })'],
      ['updateStatus — drop userId', 'foreign', MEDIA.updateStatus,
        '.findOneAndUpdate({ xid }, { $set: updateData }, { new: true })'],
      ['findByUser — drop userId', 'both', MEDIA.byUser, ".find({}).select('bucket key')"],
      ['markPendingDeleteByMessageIds — drop userId', 'foreign', MEDIA.pendingByMessages,
        '          refDocumentId: { $in: messageIds },\n'],
      ['markPendingDeleteByUser — drop userId', 'both', MEDIA.pendingByUser,
        '          status: { $in: [MediaStatus.ATTACHED, MediaStatus.PENDING] },'],

      // Drop the record predicate — widens onto the caller's own other recordings.
      ['findByXid — drop xid', 'both', MEDIA.byXid, '.findOne({ userId })'],
      ['updateStatus — drop xid', 'both', MEDIA.updateStatus,
        '.findOneAndUpdate({ userId }, { $set: updateData }, { new: true })'],
      ['markPendingDeleteByMessageIds — drop refDocumentId', 'both', MEDIA.pendingByMessages,
        '          userId,\n'],
    ],
  },
  {
    name: 'SessionsRepository',
    file: 'src/auth/sessions.repository.ts',
    spec: 'src/auth/__tests__/sessions.repository',
    mutations: [
      // Drop the owner predicate.
      ['listActiveByUser — drop userId', 'both', SESSIONS.listActive,
        '          revokedAt: null,\n          expiresAt: { $gt: new Date() },'],
      ['revokeOwnedBySessionId — drop userId', 'foreign', SESSIONS.revokeOwnedById,
        '{ _id: oid, revokedAt: null },'],
      ['revokeActiveByUserAndDevice — drop userId', 'foreign', SESSIONS.revokeByDevice,
        '{ deviceId, revokedAt: null },'],
      ['revokeOwnedByUserXid — drop userId', 'foreign', SESSIONS.revokeOwnedByXid,
        '          xid: sessionXid,\n'],
      ['revokeAllByUser — drop userId', 'both', SESSIONS.revokeAll, '{ revokedAt: null },'],
      ['revokeFamily — drop userId', 'foreign', SESSIONS.revokeFamily,
        '{ refreshTokenFamily: family, revokedAt: null },'],

      // Drop the record predicate — the caller's own other sessions become reachable.
      ['revokeOwnedBySessionId — drop _id', 'both', SESSIONS.revokeOwnedById,
        '{ userId: new Types.ObjectId(userId), revokedAt: null },'],
      ['revokeActiveByUserAndDevice — drop deviceId', 'both', SESSIONS.revokeByDevice,
        '{ userId: new Types.ObjectId(userId), revokedAt: null },'],
      ['revokeOwnedByUserXid — drop xid', 'both', SESSIONS.revokeOwnedByXid,
        '          userId: new Types.ObjectId(userId),\n'],
      ['revokeFamily — drop family', 'both', SESSIONS.revokeFamily,
        '{ userId: new Types.ObjectId(userId), revokedAt: null },'],

      // rotate's CAS: the two halves of the exemption argument.
      //
      // Dropping `_id` changes nothing, because refreshTokenHash is unique and
      // therefore already identifies the session on its own — which is precisely
      // why rotate needs no userId predicate.
      ['rotate — drop _id (CAS alone still pins the session)', 'none', SESSIONS.rotateCas,
        '            refreshTokenHash: expectedOldHash,\n            revokedAt: null,'],
      // Dropping the hash instead removes the ownership proof entirely — any
      // presented token could rotate a session whose id is known. This must fail.
      ['rotate — drop refreshTokenHash (removes the proof)', 'any', SESSIONS.rotateCas,
        '            _id: oid,\n            revokedAt: null,'],
    ],
  },
];

// ── Mechanism ──────────────────────────────────────────────────────────────────

function jestBinary() {
  for (const candidate of ['../../node_modules/.bin/jest', 'node_modules/.bin/jest']) {
    const path = resolve(API_DIR, candidate);
    if (existsSync(path)) return path;
  }
  throw new Error('Could not locate the jest binary (it is hoisted to the workspace root).');
}

function isDirty(relativePath) {
  const result = spawnSync('git', ['status', '--porcelain', '--', relativePath], {
    cwd: API_DIR,
    encoding: 'utf8',
  });
  return result.stdout.trim().length > 0;
}

/** Cases that failed, as reported by jest's `●` lines. */
function failedCases(output) {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('●') && line.includes('›'))
    .map((line) => line.replace(/^●\s*/, ''));
}

function satisfies(expectation, cases) {
  const owner = cases.some((c) => c.includes('owner call'));
  const foreign = cases.some((c) => c.includes('foreign caller'));
  if (expectation === 'none') return cases.length === 0;
  if (expectation === 'any') return cases.length > 0;
  if (expectation === 'owner') return owner;
  if (expectation === 'foreign') return foreign;
  return owner && foreign;
}

function runRepo(repo, jest) {
  const absolute = join(API_DIR, repo.file);
  const original = readFileSync(absolute, 'utf8');
  let missed = 0;

  const restore = () => writeFileSync(absolute, original);
  const onSignal = () => {
    restore();
    process.exit(130);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  try {
    console.log(`\n${repo.name}  (${repo.mutations.length} mutations)`);

    for (const [label, expectation, find, replace] of repo.mutations) {
      const occurrences = original.split(find).length - 1;
      if (occurrences !== 1) {
        console.log(`  ✗ ${label}\n      anchor matched ${occurrences} times — expected exactly 1`);
        missed++;
        continue;
      }

      const runSuite = () => {
        writeFileSync(absolute, original.replace(find, replace));
        const result = spawnSync(jest, ['--config', 'jest.config.ts', '--runInBand', repo.spec], {
          cwd: API_DIR,
          encoding: 'utf8',
        });
        restore();
        return failedCases(`${result.stdout}${result.stderr}`);
      };

      // Each mutation spins a fresh in-memory Mongo, which occasionally fails to
      // start and reports the whole suite as failed (or nothing as failed). Retry
      // once before calling it a blind spot: a genuine miss reproduces, a flake
      // does not. Only the retry result counts.
      let cases = runSuite();
      let retried = false;
      if (!satisfies(expectation, cases)) {
        retried = true;
        cases = runSuite();
      }

      if (satisfies(expectation, cases)) {
        const note = retried ? ' (after retry)' : '';
        console.log(
          expectation === 'none'
            ? `  ✓ ${label}  →  nothing failed, as documented${note}`
            : `  ✓ ${label}  →  ${cases.length} case(s) failed${note}`
        );
      } else {
        missed++;
        console.log(
          expectation === 'none'
            ? `  ✗ ${label}  →  expected NOTHING to fail; reclassify this mutation`
            : `  ✗ ${label}  →  expected the '${expectation}' case to fail`
        );
        console.log(cases.length ? `      failed: ${cases.join('; ')}` : '      NOTHING FAILED');
      }
    }
  } finally {
    restore();
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }

  return missed;
}

const args = process.argv.slice(2);
/**
 * Escape hatch for verifying a repository change BEFORE committing it — the case
 * this script is most useful for, and the one the clean-tree guard would
 * otherwise block. Restore is from an in-memory copy in a `finally` plus signal
 * handlers, so it survives a failed run or a Ctrl-C; the guard exists for the
 * residual case where it does not. Check `git diff` afterwards when you use this.
 */
const allowDirty = args.includes('--allow-dirty');
const only = args.find((arg) => !arg.startsWith('--'));
const selected = only ? REPOS.filter((r) => r.name === only) : REPOS;

if (!selected.length) {
  console.error(`Unknown repository '${only}'. Known: ${REPOS.map((r) => r.name).join(', ')}`);
  process.exit(2);
}

for (const repo of selected) {
  if (isDirty(repo.file)) {
    if (!allowDirty) {
      console.error(
        `Refusing to run: ${repo.file} has uncommitted changes.\n` +
          'This script edits that file and restores it; run it from a clean tree so a\n' +
          'failed restore is never confused with your own work.\n' +
          'Pass --allow-dirty to verify a change you are actively making, then check git diff.'
      );
      process.exit(2);
    }
    console.warn(
      `⚠️  ${repo.file} has uncommitted changes and --allow-dirty was passed.\n` +
        '   Verify `git diff` on that file once this finishes.'
    );
  }
}

const jest = jestBinary();
const missed = selected.reduce((total, repo) => total + runRepo(repo, jest), 0);

console.log(
  missed === 0
    ? '\nEvery mutation was caught by the case that should catch it.'
    : `\n${missed} mutation(s) NOT caught — the ownership suite has a blind spot.`
);
process.exit(missed === 0 ? 0 : 1);
