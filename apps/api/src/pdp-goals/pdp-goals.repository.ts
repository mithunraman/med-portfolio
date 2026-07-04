import { PdpGoalStatus } from '@acme/shared';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
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
  PdpGoalWithArtefact,
  SaveGoalData,
  UpdatePdpGoalActionData,
  UpdatePdpGoalData,
} from './pdp-goals.repository.interface';
import { PdpGoal, PdpGoalDocument } from './schemas/pdp-goal.schema';

/**
 * Single source of truth for the PdpGoal tombstone payload. Used by every
 * deletion path on this repo. Adding a new sensitive field belongs here.
 */
export function pdpGoalTombstoneUpdate() {
  return {
    $set: {
      goal: '[deleted]',
      completionReview: null,
      status: PdpGoalStatus.DELETED,
      'actions.$[].action': '[deleted]',
      'actions.$[].intendedEvidence': '[deleted]',
      'actions.$[].completionReview': null,
      'actions.$[].status': PdpGoalStatus.DELETED,
    },
  };
}

const ARTEFACT_LOOKUP_PIPELINE = [
  {
    $lookup: {
      from: 'artefacts',
      localField: 'artefactId',
      foreignField: '_id',
      as: '_artefact',
      pipeline: [{ $project: { xid: 1, title: 1 } }],
    },
  },
  {
    $addFields: {
      _artefactDoc: { $arrayElemAt: ['$_artefact', 0] },
    },
  },
  { $project: { _artefact: 0 } },
];

function mapToGoalWithArtefact(raw: Record<string, unknown>): PdpGoalWithArtefact {
  const artefactDoc = raw._artefactDoc as { xid?: string; title?: string } | undefined;
  return {
    xid: raw.xid as string,
    goal: raw.goal as string,
    userId: raw.userId as Types.ObjectId,
    artefactId: raw.artefactId as Types.ObjectId | null,
    status: raw.status as PdpGoalStatus,
    reviewDate: raw.reviewDate as Date | null,
    completedAt: raw.completedAt as Date | null,
    completionReview: raw.completionReview as string | null,
    actions: raw.actions as PdpGoalWithArtefact['actions'],
    createdAt: raw.createdAt as Date,
    updatedAt: raw.updatedAt as Date,
    artefactXid: artefactDoc?.xid ?? null,
    artefactTitle: artefactDoc?.title ?? null,
  };
}

@Injectable()
export class PdpGoalsRepository implements IPdpGoalsRepository {
  private readonly logger = new Logger(PdpGoalsRepository.name);

  constructor(
    @InjectModel(PdpGoal.name)
    private pdpGoalModel: Model<PdpGoalDocument>
  ) {}

  async create(
    goals: CreatePdpGoalData[],
    session?: ClientSession
  ): Promise<Result<PdpGoal[], DBError>> {
    try {
      if (goals.length === 0) return ok([]);

      const goalsWithIds = goals.map((g) => ({
        ...g,
        xid: nanoidAlphanumeric(),
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
        .find({ artefactId: { $in: ids }, userId })
        .lean()
        .session(session || null);

      const map = new Map<string, PdpGoal[]>();
      for (const goal of goals) {
        if (!goal.artefactId) continue;
        const key = goal.artefactId.toString();
        const list = map.get(key) || [];
        list.push(goal);
        map.set(key, list);
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
        .find({ artefactId: id, userId })
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
      const filter: Record<string, unknown> = { userId, status: { $in: statuses } };
      if (options?.dueBefore) {
        // sortDate is never null (unscheduled goals carry the far-future sentinel),
        // so { $lte } alone excludes them — no explicit $ne: null needed.
        filter.sortDate = { $lte: options.dueBefore };
      }

      let query = this.pdpGoalModel
        .find(filter)
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
      const filter: Record<string, unknown> = { userId, status: { $in: statuses } };

      if (parsedCursor) {
        const { sortDate, id } = parsedCursor;
        filter.$or = [
          { sortDate: { $gt: sortDate } },
          { sortDate, _id: { $gt: id } },
        ];
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

  async findOneWithArtefact(
    goalXid: string,
    userId: Types.ObjectId
  ): Promise<Result<PdpGoalWithArtefact | null, DBError>> {
    try {
      const results = await this.pdpGoalModel.aggregate([
        { $match: { xid: goalXid, userId } },
        ...ARTEFACT_LOOKUP_PIPELINE,
        { $limit: 1 },
      ]);

      return ok(results.length > 0 ? mapToGoalWithArtefact(results[0]) : null);
    } catch (error) {
      this.logger.error(`Failed to find PDP goal ${goalXid}`, error);
      return err({ code: 'DB_ERROR', message: 'Failed to find PDP goal' });
    }
  }

  async countByUserId(
    userId: Types.ObjectId,
    statuses: PdpGoalStatus[]
  ): Promise<Result<number, DBError>> {
    try {
      const count = await this.pdpGoalModel.countDocuments({
        userId,
        status: { $in: statuses },
      });
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
      // a future caller forgets to pre-check. Mirrors anonymizeGoal/updateGoal.
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

  async updateGoalForArtefact(
    goalXid: string,
    userId: Types.ObjectId,
    artefactId: Types.ObjectId,
    data: UpdatePdpGoalData,
    actionUpdates?: UpdatePdpGoalActionData[],
    session?: ClientSession
  ): Promise<Result<void, DBError>> {
    // Ownership predicate at the persistence layer: every write is scoped by
    // { xid, userId, artefactId } — the goal must belong to both this user and
    // this artefact. A goal from another of the user's artefacts (or another
    // user) → matchedCount === 0 → NOT_FOUND, so a finalise flow can only mutate
    // its own goals. Mirrors saveGoal/anonymizeGoal.
    const baseFilter = { xid: goalXid, userId, artefactId };
    try {
      const goalSetFields: Record<string, unknown> = {};
      if (data.status !== undefined) goalSetFields.status = data.status;
      this.setReviewDate(goalSetFields, data);
      if (data.completionReview !== undefined)
        goalSetFields.completionReview = data.completionReview;

      if (actionUpdates && actionUpdates.length > 0) {
        if (Object.keys(goalSetFields).length > 0) {
          const goalResult = await this.pdpGoalModel.updateOne(
            baseFilter,
            { $set: goalSetFields },
            { session }
          );
          if (goalResult.matchedCount === 0) {
            return err({ code: 'NOT_FOUND', message: 'PDP goal not found' });
          }
        }

        const byStatus = new Map<PdpGoalStatus, string[]>();
        for (const au of actionUpdates) {
          const xids = byStatus.get(au.status) || [];
          xids.push(au.actionXid);
          byStatus.set(au.status, xids);
        }

        for (const [targetStatus, xids] of byStatus) {
          const actionResult = await this.pdpGoalModel.updateOne(
            baseFilter,
            { $set: { 'actions.$[elem].status': targetStatus } },
            { session, arrayFilters: [{ 'elem.xid': { $in: xids } }] }
          );
          if (actionResult.matchedCount === 0) {
            return err({ code: 'NOT_FOUND', message: 'PDP goal not found' });
          }
        }
      } else {
        // Cascade: update goal fields and propagate status to all actions
        if (data.status !== undefined) {
          goalSetFields['actions.$[].status'] = data.status;
        }

        if (Object.keys(goalSetFields).length > 0) {
          const goalResult = await this.pdpGoalModel.updateOne(
            baseFilter,
            { $set: goalSetFields },
            { session }
          );
          if (goalResult.matchedCount === 0) {
            return err({ code: 'NOT_FOUND', message: 'PDP goal not found' });
          }
        }
      }

      return ok(undefined);
    } catch (error) {
      this.logger.error(`Failed to update PDP goal ${goalXid}`, error);
      return err({ code: 'DB_ERROR', message: 'Failed to update PDP goal' });
    }
  }

  async updateManyByArtefactId(
    artefactId: Types.ObjectId,
    filter: { statuses: PdpGoalStatus[] },
    data: UpdatePdpGoalData,
    session?: ClientSession
  ): Promise<Result<void, DBError>> {
    try {
      const setFields: Record<string, unknown> = {};
      if (data.status !== undefined) {
        setFields.status = data.status;
        setFields['actions.$[].status'] = data.status;
      }
      this.setReviewDate(setFields, data);

      if (Object.keys(setFields).length > 0) {
        await this.pdpGoalModel.updateMany(
          { artefactId, status: { $in: filter.statuses } },
          { $set: setFields },
          { session }
        );
      }

      return ok(undefined);
    } catch (error) {
      this.logger.error('Failed to bulk-update PDP goals', error);
      return err({ code: 'DB_ERROR', message: 'Failed to bulk-update PDP goals' });
    }
  }

  async deleteByArtefactId(
    artefactId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<number, DBError>> {
    try {
      const result = await this.pdpGoalModel.deleteMany({ artefactId }, { session });
      return ok(result.deletedCount);
    } catch (error) {
      this.logger.error(`Failed to delete PDP goals for artefact ${artefactId}`, error);
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

  async markDeletedByArtefactIds(
    artefactIds: Types.ObjectId[],
    session?: ClientSession
  ): Promise<Result<number, DBError>> {
    if (artefactIds.length === 0) return ok(0);
    try {
      const result = await this.pdpGoalModel.updateMany(
        { artefactId: { $in: artefactIds }, status: { $ne: PdpGoalStatus.DELETED } },
        pdpGoalTombstoneUpdate(),
        { session }
      );
      return ok(result.modifiedCount);
    } catch (error) {
      this.logger.error('Failed to mark PDP goals deleted by artefact ids', error);
      return err({
        code: 'DB_ERROR',
        message: 'Failed to mark PDP goals deleted by artefact ids',
      });
    }
  }
}
