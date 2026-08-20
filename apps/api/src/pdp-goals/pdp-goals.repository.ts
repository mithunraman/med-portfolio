import { PdpGoalStatus } from '@acme/shared';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { ARTEFACT_LIVE_FILTER } from '../artefacts/artefacts.repository';
import { nanoidAlphanumeric } from '../common/utils/nanoid.util';
import { DBError, Result, err, ok } from '../common/utils/result.util';
import { PdpGoalCursor, buildPdpGoalCursor, parsePdpGoalCursor } from './cursor.util';
import { toSortDate } from './pdp-goal.constants';
import {
  CreatePdpGoalData,
  FindByUserOptions,
  IPdpGoalsRepository,
  Page,
  PdpGoalErrorCode,
  PdpGoalWithArtefacts,
  SaveGoalData,
  UpdatePdpGoalActionData,
  UpdateProposalData,
  UserGoalsFilterOptions,
} from './pdp-goals.repository.interface';
import {
  LINK_ARTEFACT_PATH,
  PdpGoal,
  PdpGoalDocument,
  PdpGoalLink,
  PdpGoalLinkSource,
} from './schemas/pdp-goal.schema';

/**
 * Single source of truth for the PdpGoal tombstone payload. Used by every
 * deletion path on this repo. Adding a new sensitive field belongs here.
 *
 * An **aggregation pipeline**, not a plain update document — same reasoning as
 * `artefactTombstoneUpdate()`, which carries the full explanation. Short version:
 * `'actions.$[].action'` errors outright on a goal whose `actions` field is
 * absent, and in `updateMany` that aborts the batch part-applied, wedging the
 * account-deletion flow. `$ifNull` makes absent and empty behave identically.
 */
export function pdpGoalTombstoneUpdate() {
  return [
    {
      $set: {
        goal: '[deleted]',
        completionReview: null,
        status: PdpGoalStatus.DELETED,
        actions: {
          $map: {
            input: { $ifNull: ['$actions', []] },
            in: {
              $mergeObjects: [
                '$$this',
                {
                  action: '[deleted]',
                  intendedEvidence: '[deleted]',
                  completionReview: null,
                  status: PdpGoalStatus.DELETED,
                },
              ],
            },
          },
        },
      },
    },
  ];
}

/**
 * Resolve the artefacts a goal cites.
 *
 * Tombstoned entries are excluded HERE rather than by pulling the link: links are
 * append-only, so this filter is the only thing keeping a deleted entry out of a
 * goal's citation list. Archived entries are deliberately kept — a filed entry is
 * still evidence.
 *
 * The lookup returns artefacts unordered and without `linkedAt`; correlation back
 * to the links happens in `mapToGoalWithArtefacts`.
 */
const ARTEFACT_LOOKUP_PIPELINE = [
  {
    $lookup: {
      from: 'artefacts',
      localField: LINK_ARTEFACT_PATH,
      foreignField: '_id',
      as: '_linkedArtefacts',
      pipeline: [
        { $match: { ...ARTEFACT_LIVE_FILTER } },
        { $project: { xid: 1, title: 1 } },
      ],
    },
  },
];

// Mirrors the $project above. `title` is nullable here for the same reason it is
// on the artefact itself — this is an unvalidated assertion over aggregation
// output, so declaring it non-null would silently launder a null through the
// mapper and into the client.
type LookedUpArtefact = { _id: Types.ObjectId; xid: string; title: string | null };

function mapToGoalWithArtefacts(raw: Record<string, unknown>): PdpGoalWithArtefacts {
  const links = (raw.links ?? []) as PdpGoalLink[];
  const found = (raw._linkedArtefacts ?? []) as LookedUpArtefact[];
  const byId = new Map(found.map((a) => [a._id.toString(), a]));

  // Iterate `links`, not the lookup result: links are append-only so their order
  // is citation order, and an id with no match is a tombstoned entry to skip.
  const linkedArtefacts = links.flatMap((link) => {
    const artefact = byId.get(link.artefactId.toString());
    return artefact ? [{ xid: artefact.xid, title: artefact.title, linkedAt: link.linkedAt }] : [];
  });

  return {
    xid: raw.xid as string,
    goal: raw.goal as string,
    userId: raw.userId as Types.ObjectId,
    status: raw.status as PdpGoalStatus,
    reviewDate: raw.reviewDate as Date | null,
    completedAt: raw.completedAt as Date | null,
    completionReview: raw.completionReview as string | null,
    actions: raw.actions as PdpGoalWithArtefacts['actions'],
    createdAt: raw.createdAt as Date,
    updatedAt: raw.updatedAt as Date,
    linkedArtefacts,
  };
}

@Injectable()
export class PdpGoalsRepository implements IPdpGoalsRepository {
  private readonly logger = new Logger(PdpGoalsRepository.name);

  constructor(
    @InjectModel(PdpGoal.name)
    private pdpGoalModel: Model<PdpGoalDocument>
  ) {}

  /**
   * Single source of truth for how a user's-goals query turns options into a
   * filter, so two methods cannot interpret the same options differently.
   *
   * It does NOT make a count agree with the list it summarises — that needs the
   * caller to pass both the same options. See `dashboard.service.ts`.
   */
  private buildUserGoalsFilter(
    userId: Types.ObjectId,
    statuses: PdpGoalStatus[],
    options?: UserGoalsFilterOptions
  ): Record<string, unknown> {
    const filter: Record<string, unknown> = { userId, status: { $in: statuses } };
    // sortDate is never null (unscheduled goals carry the far-future sentinel),
    // so { $lte } alone excludes them — no explicit $ne: null needed.
    if (options?.dueBefore) filter.sortDate = { $lte: options.dueBefore };
    return filter;
  }

  /**
   * A proposal = an unclaimed goal whose ONLY link was created by these artefacts'
   * analysis. Derives what an `originArtefactId` field would have stored, without
   * a second source of truth that would be null for every standalone goal later.
   *
   * The `linkedBy` and `$size` clauses are INERT today — every goal has exactly one
   * analysis-created link, so both always pass. They are here so that when goals can
   * be created standalone or carry a second link, this predicate does not silently
   * widen into deleting or archiving goals the trainee owns.
   * `pdp-goals.repository.integration.spec.ts` covers both cases.
   */
  private proposalFilter(artefactIds: Types.ObjectId[], userId: Types.ObjectId) {
    return {
      // userId leads for two reasons. It is the ownership predicate the persistence
      // layer owes every user-owned record — load-bearing here because this backs a
      // hard deleteMany on caller-supplied ids. It is also the prefix of
      // { userId, 'links.artefactId' }: without it no index applies and the delete
      // degrades to a full collection scan, inside persistCompletion's transaction.
      userId,
      status: PdpGoalStatus.PROPOSED,
      links: {
        $elemMatch: { artefactId: { $in: artefactIds }, linkedBy: PdpGoalLinkSource.ANALYSIS },
      },
      // Safe without an $isArray guard only because the $elemMatch above rejects any
      // document whose `links` is absent or not an array before this evaluates.
      $expr: { $eq: [{ $size: '$links' }, 1] },
    };
  }

  async create(
    goals: CreatePdpGoalData[],
    session?: ClientSession
  ): Promise<Result<PdpGoal[], DBError>> {
    try {
      if (goals.length === 0) return ok([]);

      const goalsWithIds = goals.map((g) => ({
        userId: g.userId,
        goal: g.goal,
        xid: nanoidAlphanumeric(),
        links: [
          {
            artefactId: g.artefactId,
            linkedAt: new Date(),
            linkedBy: PdpGoalLinkSource.ANALYSIS,
          },
        ] satisfies PdpGoalLink[],
        actions: g.actions.map((a) => ({
          ...a,
          xid: nanoidAlphanumeric(),
        })),
      }));

      const docs = await this.pdpGoalModel.insertMany(goalsWithIds, { session });
      const lean = docs.map((d) => d.toObject());
      return ok(lean);
    } catch (error) {
      this.logger.error('Failed to create PDP goals', error);
      return err({ code: 'DB_ERROR', message: 'Failed to create PDP goals' });
    }
  }

  async findByArtefactIds(
    ids: Types.ObjectId[],
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<Map<string, PdpGoal[]>, DBError>> {
    try {
      if (ids.length === 0) return ok(new Map());

      // Ownership predicate at the persistence layer — defence in depth.
      const goals = await this.pdpGoalModel
        .find({ [LINK_ARTEFACT_PATH]: { $in: ids }, userId })
        .lean()
        .session(session || null);

      // A goal can cite several of the requested artefacts, so it may key under
      // more than one — iterate its links rather than assuming a single owner.
      const requested = new Set(ids.map((id) => id.toString()));
      const map = new Map<string, PdpGoal[]>();
      for (const goal of goals) {
        for (const link of goal.links ?? []) {
          const key = link.artefactId.toString();
          if (!requested.has(key)) continue;
          const list = map.get(key) || [];
          list.push(goal);
          map.set(key, list);
        }
      }

      return ok(map);
    } catch (error) {
      this.logger.error('Failed to find PDP goals by artefact IDs', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find PDP goals' });
    }
  }

  async findByArtefactId(
    id: Types.ObjectId,
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<PdpGoal[], DBError>> {
    try {
      // Ownership predicate at the persistence layer — defence in depth.
      const goals = await this.pdpGoalModel
        .find({ [LINK_ARTEFACT_PATH]: id, userId })
        .lean()
        .session(session || null);

      return ok(goals);
    } catch (error) {
      this.logger.error(`Failed to find PDP goals for artefact ${id}`, error);
      return err({ code: 'DB_ERROR', message: 'Failed to find PDP goals' });
    }
  }

  async findByUserId(
    userId: Types.ObjectId,
    statuses: PdpGoalStatus[],
    options?: FindByUserOptions
  ): Promise<Result<PdpGoal[], DBError>> {
    try {
      let query = this.pdpGoalModel
        .find(this.buildUserGoalsFilter(userId, statuses, options))
        .sort(options?.sortByReviewDate ? { sortDate: 1, _id: 1 } : { createdAt: -1 })
        .lean();

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      const goals = await query;
      return ok(goals);
    } catch (error) {
      this.logger.error('Failed to find PDP goals by user', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find PDP goals by user' });
    }
  }

  async findPaginated(
    userId: Types.ObjectId,
    statuses: PdpGoalStatus[],
    cursor?: string,
    limit = 20
  ): Promise<Result<Page<PdpGoal>, DBError<PdpGoalErrorCode>>> {
    // Parse the client-supplied cursor outside the try so a malformed value
    // surfaces as a distinct INVALID_CURSOR (→ 400) rather than being swallowed
    // by the catch below and mis-reported as a DB_ERROR (→ 500).
    let parsedCursor: PdpGoalCursor | undefined;
    if (cursor) {
      try {
        parsedCursor = parsePdpGoalCursor(cursor);
      } catch {
        return err({ code: 'INVALID_CURSOR', message: 'Invalid pagination cursor' });
      }
    }

    try {
      const filter = this.buildUserGoalsFilter(userId, statuses);

      if (parsedCursor) {
        const { sortDate, id } = parsedCursor;
        filter.$or = [{ sortDate: { $gt: sortDate } }, { sortDate, _id: { $gt: id } }];
      }

      const fetchLimit = limit + 1;
      const goals = await this.pdpGoalModel
        .find(filter)
        .sort({ sortDate: 1, _id: 1 })
        .limit(fetchLimit)
        .lean();

      const hasMore = goals.length > limit;
      if (hasMore) goals.pop();

      return ok({
        items: goals,
        nextCursor:
          hasMore && goals.length > 0 ? buildPdpGoalCursor(goals[goals.length - 1]) : null,
      });
    } catch (error) {
      this.logger.error('Failed to find PDP goals', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find PDP goals' });
    }
  }

  async findOneWithArtefacts(
    goalXid: string,
    userId: Types.ObjectId
  ): Promise<Result<PdpGoalWithArtefacts | null, DBError>> {
    try {
      const results = await this.pdpGoalModel.aggregate([
        { $match: { xid: goalXid, userId } },
        ...ARTEFACT_LOOKUP_PIPELINE,
        { $limit: 1 },
      ]);

      return ok(results.length > 0 ? mapToGoalWithArtefacts(results[0]) : null);
    } catch (error) {
      this.logger.error(`Failed to find PDP goal ${goalXid}`, error);
      return err({ code: 'DB_ERROR', message: 'Failed to find PDP goal' });
    }
  }

  async countByUserId(
    userId: Types.ObjectId,
    statuses: PdpGoalStatus[],
    options?: UserGoalsFilterOptions
  ): Promise<Result<number, DBError>> {
    try {
      const count = await this.pdpGoalModel.countDocuments(
        this.buildUserGoalsFilter(userId, statuses, options)
      );
      return ok(count);
    } catch (error) {
      this.logger.error('Failed to count PDP goals by user', error);
      return err({ code: 'DB_ERROR', message: 'Failed to count PDP goals' });
    }
  }

  /**
   * Apply a reviewDate to a `$set`, keeping the derived `sortDate` keyset-pagination
   * key in lockstep (sortDate = reviewDate ?? sentinel). Every write path that can
   * change reviewDate must go through this so the invariant can't drift.
   */
  private setReviewDate(
    setFields: Record<string, unknown>,
    data: { reviewDate?: Date | null }
  ): void {
    if (data.reviewDate !== undefined) {
      setFields.reviewDate = data.reviewDate;
      setFields.sortDate = toSortDate(data.reviewDate);
    }
  }

  async saveGoal(
    xid: string,
    userId: Types.ObjectId,
    data: SaveGoalData
  ): Promise<Result<void, DBError>> {
    try {
      const setFields: Record<string, unknown> = {};
      if (data.status !== undefined) setFields.status = data.status;
      this.setReviewDate(setFields, data);
      if (data.completedAt !== undefined) setFields.completedAt = data.completedAt;
      if (data.completionReview !== undefined) setFields.completionReview = data.completionReview;
      if (data.actions !== undefined) setFields.actions = data.actions;

      if (Object.keys(setFields).length === 0) {
        return ok(undefined);
      }

      // Ownership predicate at the persistence layer — defence in depth even if
      // a future caller forgets to pre-check. Mirrors anonymizeGoal.
      const result = await this.pdpGoalModel.updateOne({ xid, userId }, { $set: setFields });
      if (result.matchedCount === 0) {
        return err({ code: 'NOT_FOUND', message: 'PDP goal not found' });
      }
      return ok(undefined);
    } catch (error) {
      this.logger.error(`Failed to save PDP goal ${xid}`, error);
      return err({ code: 'DB_ERROR', message: 'Failed to save PDP goal' });
    }
  }

  async updateProposalForArtefact(
    goalXid: string,
    userId: Types.ObjectId,
    artefactId: Types.ObjectId,
    data: UpdateProposalData,
    actionUpdates?: UpdatePdpGoalActionData[],
    session?: ClientSession
  ): Promise<Result<void, DBError>> {
    const proposalGuard = { xid: goalXid, ...this.proposalFilter([artefactId], userId) };
    try {
      const goalSetFields: Record<string, unknown> = { status: data.status };
      this.setReviewDate(goalSetFields, data);

      const arrayFilters: Record<string, unknown>[] = [];

      if (actionUpdates?.length) {
        // Adopt path: per-action selections. Group by target status so each
        // distinct status costs one $set key rather than one per action.
        const byStatus = new Map<PdpGoalStatus, string[]>();
        for (const au of actionUpdates) {
          const xids = byStatus.get(au.status) || [];
          xids.push(au.actionXid);
          byStatus.set(au.status, xids);
        }

        // The $set key and its filter are pushed together on purpose: MongoDB
        // rejects the entire update if an arrayFilters identifier is not
        // referenced by some $set key ("array filter for identifier 'x' was not
        // used in the update"). Building the two independently would break the
        // moment a group could be empty.
        let i = 0;
        for (const [targetStatus, xids] of byStatus) {
          const id = `s${i++}`;
          goalSetFields[`actions.$[${id}].status`] = targetStatus;
          arrayFilters.push({ [`${id}.xid`]: { $in: xids } });
        }
      } else {
        // Decline path: no per-action selections, so the goal's status cascades
        // to every action.
        goalSetFields['actions.$[].status'] = data.status;
      }

      // ONE write, entirely inside the proposal guard — goal fields and every
      // action status together. Do not split it: this $set moves status off
      // PROPOSED, so proposalFilter stops matching its own target, and any
      // follow-up write would have to fall back to a weaker predicate.
      const result = await this.pdpGoalModel.updateOne(
        proposalGuard,
        { $set: goalSetFields },
        arrayFilters.length ? { session, arrayFilters } : { session }
      );
      if (result.matchedCount === 0) {
        return err({ code: 'NOT_FOUND', message: 'PDP goal not found' });
      }

      return ok(undefined);
    } catch (error) {
      this.logger.error(`Failed to update PDP goal ${goalXid}`, error);
      return err({ code: 'DB_ERROR', message: 'Failed to update PDP goal' });
    }
  }

  async deleteUnadoptedProposals(
    artefactIds: Types.ObjectId[],
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<number, DBError>> {
    if (artefactIds.length === 0) return ok(0);
    try {
      const result = await this.pdpGoalModel.deleteMany(this.proposalFilter(artefactIds, userId), {
        session,
      });
      return ok(result.deletedCount);
    } catch (error) {
      this.logger.error('Failed to delete unadopted PDP proposals', error);
      return err({ code: 'DB_ERROR', message: 'Failed to delete PDP goals' });
    }
  }

  async anonymizeGoal(
    xid: string,
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<boolean, DBError>> {
    try {
      const result = await this.pdpGoalModel.updateOne(
        { xid, userId, status: { $ne: PdpGoalStatus.DELETED } },
        pdpGoalTombstoneUpdate(),
        { session }
      );
      return ok(result.modifiedCount > 0);
    } catch (error) {
      this.logger.error(`Failed to anonymize PDP goal ${xid}`, error);
      return err({ code: 'DB_ERROR', message: 'Failed to anonymize PDP goal' });
    }
  }

  async markDeletedByUserId(userId: Types.ObjectId): Promise<Result<number, DBError>> {
    try {
      const result = await this.pdpGoalModel.updateMany(
        { userId, status: { $ne: PdpGoalStatus.DELETED } },
        pdpGoalTombstoneUpdate()
      );
      return ok(result.modifiedCount);
    } catch (error) {
      this.logger.error('Failed to anonymize PDP goals', error);
      return err({ code: 'DB_ERROR', message: 'Failed to anonymize PDP goals' });
    }
  }
}
