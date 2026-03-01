import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Result, err, ok } from '../common/utils/result.util';
import type { DBError } from '../artefacts/artefacts.repository.interface';
import { PdpActionStatus } from '@acme/shared';
import {
  CreatePdpActionData,
  FindByUserOptions,
  IPdpActionsRepository,
} from './pdp-actions.repository.interface';
import { PdpAction, PdpActionDocument } from './schemas/pdp-action.schema';

@Injectable()
export class PdpActionsRepository implements IPdpActionsRepository {
  private readonly logger = new Logger(PdpActionsRepository.name);

  constructor(
    @InjectModel(PdpAction.name)
    private pdpActionModel: Model<PdpActionDocument>,
  ) {}

  async create(
    actions: CreatePdpActionData[],
    session?: ClientSession,
  ): Promise<Result<PdpAction[], DBError>> {
    try {
      if (actions.length === 0) return ok([]);

      const docs = await this.pdpActionModel.insertMany(actions, { session });
      const lean = docs.map((d) => d.toObject());
      return ok(lean);
    } catch (error) {
      this.logger.error('Failed to create PDP actions', error);
      return err({ code: 'DB_ERROR', message: 'Failed to create PDP actions' });
    }
  }

  async findByArtefactIds(
    ids: Types.ObjectId[],
    session?: ClientSession,
  ): Promise<Result<Map<string, PdpAction[]>, DBError>> {
    try {
      if (ids.length === 0) return ok(new Map());

      const actions = await this.pdpActionModel
        .find({ artefactId: { $in: ids } })
        .lean()
        .session(session || null);

      const map = new Map<string, PdpAction[]>();
      for (const action of actions) {
        const key = action.artefactId.toString();
        const list = map.get(key) || [];
        list.push(action);
        map.set(key, list);
      }

      return ok(map);
    } catch (error) {
      this.logger.error('Failed to find PDP actions by artefact IDs', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find PDP actions' });
    }
  }

  async findByArtefactId(
    id: Types.ObjectId,
    session?: ClientSession,
  ): Promise<Result<PdpAction[], DBError>> {
    try {
      const actions = await this.pdpActionModel
        .find({ artefactId: id })
        .lean()
        .session(session || null);

      return ok(actions);
    } catch (error) {
      this.logger.error(`Failed to find PDP actions for artefact ${id}`, error);
      return err({ code: 'DB_ERROR', message: 'Failed to find PDP actions' });
    }
  }

  async findByUserId(
    userId: Types.ObjectId,
    statuses: PdpActionStatus[],
    options?: FindByUserOptions,
  ): Promise<Result<PdpAction[], DBError>> {
    try {
      let query = this.pdpActionModel
        .find({ userId, status: { $in: statuses } })
        .sort(options?.sortByDueDate ? { dueDate: 1, createdAt: 1 } : { createdAt: -1 })
        .lean();

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      const actions = await query;
      return ok(actions);
    } catch (error) {
      this.logger.error('Failed to find PDP actions by user', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find PDP actions by user' });
    }
  }

  async countByUserId(
    userId: Types.ObjectId,
    statuses: PdpActionStatus[],
  ): Promise<Result<number, DBError>> {
    try {
      const count = await this.pdpActionModel.countDocuments({
        userId,
        status: { $in: statuses },
      });
      return ok(count);
    } catch (error) {
      this.logger.error('Failed to count PDP actions by user', error);
      return err({ code: 'DB_ERROR', message: 'Failed to count PDP actions' });
    }
  }
}
