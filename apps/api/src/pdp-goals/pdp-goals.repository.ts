import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Result, err, ok } from '../common/utils/result.util';
import type { DBError } from '../artefacts/artefacts.repository.interface';
import { PdpGoalStatus } from '@acme/shared';
import { nanoidAlphanumeric } from '../common/utils/nanoid.util';
import {
  CreatePdpGoalData,
  FindByUserOptions,
  IPdpGoalsRepository,
} from './pdp-goals.repository.interface';
import { PdpGoal, PdpGoalDocument } from './schemas/pdp-goal.schema';

@Injectable()
export class PdpGoalsRepository implements IPdpGoalsRepository {
  private readonly logger = new Logger(PdpGoalsRepository.name);

  constructor(
    @InjectModel(PdpGoal.name)
    private pdpGoalModel: Model<PdpGoalDocument>,
  ) {}

  async create(
    goals: CreatePdpGoalData[],
    session?: ClientSession,
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
    session?: ClientSession,
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
    session?: ClientSession,
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
    options?: FindByUserOptions,
  ): Promise<Result<PdpGoal[], DBError>> {
    try {
      let query = this.pdpGoalModel
        .find({ userId, status: { $in: statuses } })
        .sort(
          options?.sortByNextDueDate
            ? { nextActionDueDate: 1, createdAt: 1 }
            : { createdAt: -1 },
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

  async countByUserId(
    userId: Types.ObjectId,
    statuses: PdpGoalStatus[],
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
}
