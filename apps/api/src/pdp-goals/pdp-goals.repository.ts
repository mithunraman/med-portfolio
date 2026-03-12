import { PdpGoalStatus } from '@acme/shared';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import type { DBError } from '../artefacts/artefacts.repository.interface';
import { nanoidAlphanumeric } from '../common/utils/nanoid.util';
import { Result, err, ok } from '../common/utils/result.util';
import {
  CreatePdpGoalData,
  FindByUserOptions,
  IPdpGoalsRepository,
  PdpGoalWithArtefact,
  UpdatePdpGoalActionData,
  UpdatePdpGoalData,
  UpdateSingleActionData,
} from './pdp-goals.repository.interface';
import { PdpGoal, PdpGoalDocument } from './schemas/pdp-goal.schema';

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
      _sortDate: {
        $cond: [{ $eq: ['$reviewDate', null] }, new Date('9999-12-31'), '$reviewDate'],
      },
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
    session?: ClientSession
  ): Promise<Result<Map<string, PdpGoal[]>, DBError>> {
    try {
      if (ids.length === 0) return ok(new Map());

      const goals = await this.pdpGoalModel
        .find({ artefactId: { $in: ids } })
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
    session?: ClientSession
  ): Promise<Result<PdpGoal[], DBError>> {
    try {
      const goals = await this.pdpGoalModel
        .find({ artefactId: id })
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
        filter.reviewDate = { $ne: null, $lte: options.dueBefore };
      }

      let query = this.pdpGoalModel
        .find(filter)
        .sort(
          options?.sortByNextDueDate ? { nextActionDueDate: 1, createdAt: 1 } : { createdAt: -1 }
        )
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

  async findByUserIdWithArtefact(
    userId: Types.ObjectId,
    statuses: PdpGoalStatus[]
  ): Promise<Result<PdpGoalWithArtefact[], DBError>> {
    try {
      const results = await this.pdpGoalModel.aggregate([
        { $match: { userId, status: { $in: statuses } } },
        ...ARTEFACT_LOOKUP_PIPELINE,
        { $sort: { _sortDate: 1 } },
        { $project: { _sortDate: 0 } },
      ]);

      return ok(results.map(mapToGoalWithArtefact));
    } catch (error) {
      this.logger.error('Failed to find PDP goals with artefact info', error);
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
        { $project: { _sortDate: 0 } },
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

  async updateGoal(
    goalXid: string,
    data: UpdatePdpGoalData,
    actionUpdates?: UpdatePdpGoalActionData[],
    session?: ClientSession
  ): Promise<Result<void, DBError>> {
    try {
      const goalSetFields: Record<string, unknown> = {};
      if (data.status !== undefined) goalSetFields.status = data.status;
      if (data.reviewDate !== undefined) goalSetFields.reviewDate = data.reviewDate;
      if (data.completionReview !== undefined) goalSetFields.completionReview = data.completionReview;

      if (actionUpdates) {
        if (Object.keys(goalSetFields).length > 0) {
          await this.pdpGoalModel.updateOne(
            { xid: goalXid },
            { $set: goalSetFields },
            { session }
          );
        }

        const byStatus = new Map<PdpGoalStatus, string[]>();
        for (const au of actionUpdates) {
          const xids = byStatus.get(au.status) || [];
          xids.push(au.actionXid);
          byStatus.set(au.status, xids);
        }

        for (const [targetStatus, xids] of byStatus) {
          await this.pdpGoalModel.updateOne(
            { xid: goalXid },
            { $set: { 'actions.$[elem].status': targetStatus } },
            { session, arrayFilters: [{ 'elem.xid': { $in: xids } }] }
          );
        }
      } else {
        if (data.status !== undefined) {
          goalSetFields['actions.$[].status'] = data.status;
        }

        if (Object.keys(goalSetFields).length > 0) {
          await this.pdpGoalModel.updateOne(
            { xid: goalXid },
            { $set: goalSetFields },
            { session }
          );
        }
      }

      return ok(undefined);
    } catch (error) {
      this.logger.error(`Failed to update PDP goal ${goalXid}`, error);
      return err({ code: 'DB_ERROR', message: 'Failed to update PDP goal' });
    }
  }

  async updateSingleAction(
    goalXid: string,
    actionXid: string,
    data: UpdateSingleActionData
  ): Promise<Result<void, DBError>> {
    try {
      const setFields: Record<string, unknown> = {};
      if (data.status !== undefined) setFields['actions.$[elem].status'] = data.status;
      if (data.completionReview !== undefined)
        setFields['actions.$[elem].completionReview'] = data.completionReview;

      if (Object.keys(setFields).length === 0) return ok(undefined);

      await this.pdpGoalModel.updateOne(
        { xid: goalXid },
        { $set: setFields },
        { arrayFilters: [{ 'elem.xid': actionXid }] }
      );

      return ok(undefined);
    } catch (error) {
      this.logger.error(`Failed to update action ${actionXid} on goal ${goalXid}`, error);
      return err({ code: 'DB_ERROR', message: 'Failed to update action' });
    }
  }

  async addAction(
    goalXid: string,
    actionText: string,
    dueDate: Date | null
  ): Promise<Result<void, DBError>> {
    try {
      await this.pdpGoalModel.updateOne(
        { xid: goalXid },
        {
          $push: {
            actions: {
              xid: nanoidAlphanumeric(),
              action: actionText,
              intendedEvidence: '',
              status: PdpGoalStatus.PENDING,
              dueDate,
              completionReview: null,
            },
          },
        }
      );

      return ok(undefined);
    } catch (error) {
      this.logger.error(`Failed to add action to goal ${goalXid}`, error);
      return err({ code: 'DB_ERROR', message: 'Failed to add action' });
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
      if (data.reviewDate !== undefined) {
        setFields.reviewDate = data.reviewDate;
      }

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
}
