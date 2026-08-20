import { PdpGoalStatus } from '@acme/shared';
import { ClientSession, Types } from 'mongoose';
import type { DBError, Result } from '../common/utils/result.util';
import type { PdpGoal, PdpGoalAction } from './schemas/pdp-goal.schema';

/**
 * Error codes `findPaginated` can return. `INVALID_CURSOR` is a client input
 * error (→ 400); `DB_ERROR` is a genuine persistence failure (→ 500). The
 * service switches on this union with an exhaustiveness check, so adding a code
 * here forces the caller to decide its HTTP mapping.
 */
export type PdpGoalErrorCode = 'DB_ERROR' | 'INVALID_CURSOR';

export const PDP_GOALS_REPOSITORY = Symbol('PDP_GOALS_REPOSITORY');

export interface CreatePdpGoalActionData {
  action: string;
  intendedEvidence: string;
}

export interface CreatePdpGoalData {
  userId: Types.ObjectId;
  /** Seeds the goal's first (and, today, only) link. */
  artefactId: Types.ObjectId;
  goal: string;
  actions: CreatePdpGoalActionData[];
}

export interface FindByUserOptions {
  limit?: number;
  sortByReviewDate?: boolean;
  dueBefore?: Date;
}

/** The subset of FindByUserOptions that narrows the SET rather than the query shape. */
export type UserGoalsFilterOptions = Pick<FindByUserOptions, 'dueBefore'>;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface SaveGoalData {
  status?: PdpGoalStatus;
  reviewDate?: Date | null;
  completedAt?: Date | null;
  completionReview?: string | null;
  actions?: PdpGoalAction[];
}

/**
 * Adopting or declining a proposal at finalise. `status` is required: it is the
 * only field every caller sets, and making it optional would permit an empty
 * `$set`, which MongoDB rejects at runtime.
 *
 * No `completionReview` — a proposal has not been started, let alone completed.
 * A goal's completion review is written through `SaveGoalData`.
 */
export interface UpdateProposalData {
  status: PdpGoalStatus;
  reviewDate?: Date | null;
}

export interface UpdatePdpGoalActionData {
  actionXid: string;
  status: PdpGoalStatus;
}

/**
 * An artefact a goal cites, as projected by the citation `$lookup`. Tombstoned
 * entries are excluded.
 *
 * Deliberately NOT the same shape as `LinkedArtefactRef` in `@acme/shared`, which
 * is the API contract: this carries the internal `xid` and a `Date`, that carries
 * the public `id` and an ISO string. The two are mutually non-assignable, so the
 * distinct name is for readers rather than for the compiler.
 */
export interface LinkedArtefactProjection {
  xid: string;
  /** Null is legitimate — see LinkedArtefactRefSchema in @acme/shared. */
  title: string | null;
  linkedAt: Date;
}

/**
 * A goal with its citations resolved.
 *
 * Derived from `PdpGoal` rather than restated: a field added to the schema then
 * surfaces as a compile error in `mapToGoalWithArtefacts` instead of silently
 * going missing from every read. A field that genuinely should not be exposed is
 * added to the omit list — the error is the prompt to decide which.
 */
export type PdpGoalWithArtefacts = Omit<PdpGoal, '_id' | 'links' | 'sortDate'> & {
  /** May be empty: every entry citing this goal was deleted. */
  linkedArtefacts: LinkedArtefactProjection[];
};

export interface IPdpGoalsRepository {
  create(goals: CreatePdpGoalData[], session?: ClientSession): Promise<Result<PdpGoal[], DBError>>;

  findByArtefactIds(
    ids: Types.ObjectId[],
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<Map<string, PdpGoal[]>, DBError>>;

  findByArtefactId(
    id: Types.ObjectId,
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<PdpGoal[], DBError>>;

  findByUserId(
    userId: Types.ObjectId,
    statuses: PdpGoalStatus[],
    options?: FindByUserOptions
  ): Promise<Result<PdpGoal[], DBError>>;

  findPaginated(
    userId: Types.ObjectId,
    statuses: PdpGoalStatus[],
    cursor?: string,
    limit?: number
  ): Promise<Result<Page<PdpGoal>, DBError<PdpGoalErrorCode>>>;

  findOneWithArtefacts(
    goalXid: string,
    userId: Types.ObjectId
  ): Promise<Result<PdpGoalWithArtefacts | null, DBError>>;

  countByUserId(
    userId: Types.ObjectId,
    statuses: PdpGoalStatus[],
    options?: UserGoalsFilterOptions
  ): Promise<Result<number, DBError>>;

  saveGoal(xid: string, userId: Types.ObjectId, data: SaveGoalData): Promise<Result<void, DBError>>;

  /**
   * Adopt or decline a PROPOSAL belonging to this artefact's analysis.
   *
   * Scoped by `proposalFilter`, so it can only ever reach an unclaimed suggestion
   * this artefact produced — never a goal the trainee adopted, and never a goal
   * another entry cites. The `goalXid` is client-supplied at finalise, so this
   * predicate is the only thing standing between that input and a goal it has no
   * business touching. Non-match → NOT_FOUND → 404.
   *
   * Deliberately NOT idempotent: the filter requires PROPOSED, so a replayed
   * finalise 404s. Already unreachable — finalise requires IN_REVIEW, sets
   * COMPLETED, and runs in a transaction that rolls back wholesale on failure.
   */
  updateProposalForArtefact(
    goalXid: string,
    userId: Types.ObjectId,
    artefactId: Types.ObjectId,
    data: UpdateProposalData,
    actionUpdates?: UpdatePdpGoalActionData[],
    session?: ClientSession
  ): Promise<Result<void, DBError>>;

  /**
   * Hard-delete unclaimed proposals produced by these artefacts' analyses.
   *
   * Two callers, both narrow: analysis replay (a run rewriting its own output) and
   * artefact deletion — the latter a deliberate exception to "artefact lifecycle
   * never touches goals", because a PROPOSED goal is unreachable in the UI and the
   * trainee cannot delete it by hand. Adopted goals are never touched.
   *
   * `artefactIds` must all belong to `userId` — the filter enforces ownership
   * rather than trusting the caller, and `userId` is also what lets the query use
   * the { userId, 'links.artefactId' } index instead of scanning the collection.
   */
  deleteUnadoptedProposals(
    artefactIds: Types.ObjectId[],
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<number, DBError>>;

  anonymizeGoal(
    xid: string,
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<boolean, DBError>>;

  markDeletedByUserId(userId: Types.ObjectId): Promise<Result<number, DBError>>;
}
