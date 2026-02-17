import { ArtefactStatus, Specialty } from '@acme/shared';
import { ClientSession, Types } from 'mongoose';
import type { Result } from '../common/utils/result.util';
import type { ArtefactDocument } from './schemas/artefact.schema';

export const ARTEFACTS_REPOSITORY = Symbol('ARTEFACTS_REPOSITORY');

export interface DBError {
  code: string;
  message: string;
}

// Artefact types
export interface UpsertArtefactData {
  artefactId: string;
  userId: Types.ObjectId;
  specialty: Specialty;
  title: string;
}

export interface ListArtefactsQuery {
  userId: Types.ObjectId;
  status?: ArtefactStatus;
  cursor?: Types.ObjectId;
  limit: number;
}

export interface ListArtefactsResult {
  artefacts: ArtefactDocument[];
}

export interface IArtefactsRepository {
  upsertArtefact(
    data: UpsertArtefactData,
    session?: ClientSession
  ): Promise<Result<ArtefactDocument, DBError>>;

  listArtefacts(
    query: ListArtefactsQuery,
    session?: ClientSession
  ): Promise<Result<ListArtefactsResult, DBError>>;
}
