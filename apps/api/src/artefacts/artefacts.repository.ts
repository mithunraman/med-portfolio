import { ArtefactStatus } from '@acme/shared';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Result, err, ok } from '../common/utils/result.util';
import {
  CountByUserFilter,
  DBError,
  IArtefactsRepository,
  ListArtefactsQuery,
  ListArtefactsResult,
  UpdateArtefactData,
  UpsertArtefactData,
} from './artefacts.repository.interface';
import { Artefact, ArtefactDocument } from './schemas/artefact.schema';

@Injectable()
export class ArtefactsRepository implements IArtefactsRepository {
  private readonly logger = new Logger(ArtefactsRepository.name);

  constructor(
    @InjectModel(Artefact.name)
    private artefactModel: Model<ArtefactDocument>
  ) {}

  async findById(
    id: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<Artefact | null, DBError>> {
    try {
      const artefact = await this.artefactModel
        .findById(id)
        .session(session ?? null)
        .lean();
      return ok(artefact);
    } catch (error) {
      this.logger.error('Failed to find artefact by id', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find artefact by id' });
    }
  }

  async upsertArtefact(
    data: UpsertArtefactData,
    session?: ClientSession
  ): Promise<Result<Artefact, DBError>> {
    try {
      const artefact = await this.artefactModel
        .findOneAndUpdate(
          { artefactId: data.artefactId },
          {
            $setOnInsert: {
              artefactId: data.artefactId,
              userId: data.userId,
              specialty: data.specialty,
              trainingStage: data.trainingStage,
              status: ArtefactStatus.IN_CONVERSATION,
              title: data.title,
            },
          },
          { upsert: true, new: true, session }
        )
        .lean();
      return ok(artefact);
    } catch (error) {
      this.logger.error('Failed to upsert artefact', error);
      return err({ code: 'DB_ERROR', message: 'Failed to upsert artefact' });
    }
  }

  async listArtefacts(
    query: ListArtefactsQuery,
    session?: ClientSession
  ): Promise<Result<ListArtefactsResult, DBError>> {
    try {
      const filter: {
        userId: Types.ObjectId;
        status?: ArtefactStatus | { $ne: ArtefactStatus };
        _id?: { $lt: Types.ObjectId };
      } = {
        userId: query.userId,
      };

      if (query.status !== undefined) {
        filter.status = query.status;
      } else {
        filter.status = { $ne: ArtefactStatus.DELETED };
      }

      if (query.cursor) {
        filter._id = { $lt: query.cursor };
      }

      const artefacts = await this.artefactModel
        .find(filter)
        .sort({ _id: -1 })
        .limit(query.limit)
        .lean()
        .session(session || null);

      return ok({ artefacts });
    } catch (error) {
      this.logger.error('Failed to list artefacts', error);
      return err({ code: 'DB_ERROR', message: 'Failed to list artefacts' });
    }
  }

  async updateArtefactById(
    id: Types.ObjectId,
    data: UpdateArtefactData,
    session?: ClientSession
  ): Promise<Result<Artefact, DBError>> {
    try {
      const artefact = await this.artefactModel
        .findByIdAndUpdate(id, { $set: data }, { new: true, session })
        .lean();

      if (!artefact) {
        return err({ code: 'NOT_FOUND', message: `Artefact not found: ${id}` });
      }

      return ok(artefact);
    } catch (error) {
      this.logger.error(`Failed to update artefact ${id}`, error);
      return err({ code: 'DB_ERROR', message: 'Failed to update artefact' });
    }
  }

  async findByXid(
    xid: string,
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<Artefact | null, DBError>> {
    try {
      const artefact = await this.artefactModel
        .findOne({ xid, userId })
        .lean()
        .session(session || null);
      return ok(artefact);
    } catch (error) {
      this.logger.error('Failed to find artefact by xid', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find artefact' });
    }
  }

  async countByUser(
    userId: Types.ObjectId,
    filter?: CountByUserFilter
  ): Promise<Result<number, DBError>> {
    try {
      const query: Record<string, unknown> = { userId };

      if (filter?.since) {
        query.createdAt = { $gte: filter.since };
      }
      if (filter?.status !== undefined) {
        query.status = filter.status;
      }

      const count = await this.artefactModel.countDocuments(query);
      return ok(count);
    } catch (error) {
      this.logger.error('Failed to count artefacts', error);
      return err({ code: 'DB_ERROR', message: 'Failed to count artefacts' });
    }
  }

  async anonymizeArtefact(
    artefactId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<void, DBError>> {
    try {
      await this.artefactModel.updateOne(
        { _id: artefactId },
        {
          $set: {
            title: '[deleted]',
            reflection: [],
            capabilities: [],
            tags: {},
            status: ArtefactStatus.DELETED,
          },
        },
        { session }
      );
      return ok(undefined);
    } catch (error) {
      this.logger.error('Failed to anonymize artefact', error);
      return err({ code: 'DB_ERROR', message: 'Failed to anonymize artefact' });
    }
  }

  async anonymizeByUser(userId: Types.ObjectId): Promise<Result<number, DBError>> {
    try {
      const result = await this.artefactModel.updateMany(
        { userId },
        {
          $set: {
            title: '[deleted]',
            reflection: [],
            capabilities: [],
            tags: {},
            status: ArtefactStatus.DELETED,
          },
        }
      );
      return ok(result.modifiedCount);
    } catch (error) {
      this.logger.error('Failed to anonymize artefacts', error);
      return err({ code: 'DB_ERROR', message: 'Failed to anonymize artefacts' });
    }
  }
}
