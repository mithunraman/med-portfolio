import { ArtefactStatus } from '@acme/shared';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { DBError, Result, err, ok } from '../common/utils/result.util';
import {
  CountByUserFilter,
  IArtefactsRepository,
  ListArtefactsQuery,
  ListArtefactsResult,
  UpdateArtefactData,
  UpsertArtefactData,
  UpsertArtefactReviewData,
} from './artefacts.repository.interface';
import { Artefact, ArtefactDocument } from './schemas/artefact.schema';

/**
 * Single source of truth for the Artefact tombstone payload. Used by every
 * deletion path on this repo. Adding a new sensitive field belongs here.
 */
export function artefactTombstoneUpdate() {
  return {
    $set: {
      title: '[deleted]',
      composedDocument: [],
      capabilities: [],
      tags: {},
      review: null,
      status: ArtefactStatus.DELETED,
    },
  };
}

/**
 * Canonical "live" filter for read paths — excludes tombstones.
 * Cascade-write call sites keep their inline `$ne` because that's idempotency
 * semantics ("don't re-tombstone"), not the read-time "exclude deleted" rule.
 */
const ARTEFACT_LIVE_FILTER = { status: { $ne: ArtefactStatus.DELETED } } as const;

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
        .findOne({ _id: id, ...ARTEFACT_LIVE_FILTER })
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
    userId: Types.ObjectId,
    data: UpdateArtefactData,
    session?: ClientSession
  ): Promise<Result<Artefact, DBError>> {
    try {
      // Ownership predicate at the persistence layer — defence in depth. A
      // foreign _id degrades to NOT_FOUND rather than mutating another user's
      // artefact, even if a future caller forgets to pre-check.
      const artefact = await this.artefactModel
        .findOneAndUpdate({ _id: id, userId }, { $set: data }, { new: true, session })
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
        .findOne({ xid, userId, ...ARTEFACT_LIVE_FILTER })
        .lean()
        .session(session || null);
      return ok(artefact);
    } catch (error) {
      this.logger.error('Failed to find artefact by xid', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find artefact' });
    }
  }

  async upsertReview(
    xid: string,
    userId: Types.ObjectId,
    data: UpsertArtefactReviewData,
    session?: ClientSession
  ): Promise<Result<Artefact, DBError>> {
    try {
      // Single atomic write: { xid, userId } enforces ownership at the DB level —
      // a non-owner gets NOT_FOUND, which is also the right HTTP shape (don't leak
      // existence). ARTEFACT_LIVE_FILTER blocks rating a tombstoned artefact, so
      // no prior read and no transaction are needed.
      const artefact = await this.artefactModel
        .findOneAndUpdate(
          { xid, userId, ...ARTEFACT_LIVE_FILTER },
          { $set: { review: { ...data, updatedAt: new Date() } } },
          { new: true, session }
        )
        .lean();

      if (!artefact) {
        return err({ code: 'NOT_FOUND', message: 'Artefact not found' });
      }

      return ok(artefact);
    } catch (error) {
      this.logger.error('Failed to upsert artefact review', error);
      return err({ code: 'DB_ERROR', message: 'Failed to upsert artefact review' });
    }
  }

  async countByUser(
    userId: string,
    filter?: CountByUserFilter,
    session?: ClientSession
  ): Promise<Result<number, DBError>> {
    try {
      const query: Record<string, unknown> = { userId: new Types.ObjectId(userId) };

      if (filter?.since) {
        query.createdAt = { $gte: filter.since };
      }
      if (filter?.status !== undefined) {
        query.status = filter.status;
      }

      const count = await this.artefactModel.countDocuments(query).session(session ?? null);
      return ok(count);
    } catch (error) {
      this.logger.error('Failed to count artefacts', error);
      return err({ code: 'DB_ERROR', message: 'Failed to count artefacts' });
    }
  }

  async markDeletedByUserId(userId: Types.ObjectId): Promise<Result<number, DBError>> {
    try {
      const result = await this.artefactModel.updateMany(
        { userId, status: { $ne: ArtefactStatus.DELETED } },
        artefactTombstoneUpdate()
      );
      return ok(result.modifiedCount);
    } catch (error) {
      this.logger.error('Failed to anonymize artefacts', error);
      return err({ code: 'DB_ERROR', message: 'Failed to anonymize artefacts' });
    }
  }

  async markDeleted(
    ids: Types.ObjectId[],
    session?: ClientSession
  ): Promise<Result<number, DBError>> {
    if (ids.length === 0) return ok(0);
    try {
      const result = await this.artefactModel.updateMany(
        { _id: { $in: ids }, status: { $ne: ArtefactStatus.DELETED } },
        artefactTombstoneUpdate(),
        { session }
      );
      return ok(result.modifiedCount);
    } catch (error) {
      this.logger.error('Failed to mark artefacts deleted', error);
      return err({ code: 'DB_ERROR', message: 'Failed to mark artefacts deleted' });
    }
  }
}
