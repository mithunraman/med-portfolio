import { ArtefactStatus } from '@acme/shared';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Result, err, ok } from '../common/utils/result.util';
import {
  DBError,
  IArtefactsRepository,
  ListArtefactsQuery,
  ListArtefactsResult,
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

  async upsertArtefact(
    data: UpsertArtefactData,
    session?: ClientSession
  ): Promise<Result<ArtefactDocument, DBError>> {
    try {
      const artefact = await this.artefactModel.findOneAndUpdate(
        { artefactId: data.artefactId },
        {
          $setOnInsert: {
            artefactId: data.artefactId,
            userId: data.userId,
            specialty: data.specialty,
            status: ArtefactStatus.DRAFT,
            title: data.title,
          },
        },
        { upsert: true, new: true, session }
      );
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
        status?: ArtefactStatus;
        _id?: { $lt: Types.ObjectId };
      } = {
        userId: query.userId,
      };

      if (query.status !== undefined) {
        filter.status = query.status;
      }

      if (query.cursor) {
        filter._id = { $lt: query.cursor };
      }

      const artefacts = await this.artefactModel
        .find(filter)
        .sort({ _id: -1 })
        .limit(query.limit)
        .session(session || null);

      return ok({ artefacts });
    } catch (error) {
      this.logger.error('Failed to list artefacts', error);
      return err({ code: 'DB_ERROR', message: 'Failed to list artefacts' });
    }
  }
}
