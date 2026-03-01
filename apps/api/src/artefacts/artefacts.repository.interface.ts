import { ArtefactStatus, Specialty } from '@acme/shared';
import { ClientSession, Types } from 'mongoose';
import type { Result } from '../common/utils/result.util';
import type { Artefact } from './schemas/artefact.schema';

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
  artefacts: Artefact[];
}

export interface UpdateArtefactData {
  artefactType?: string | null;
  title?: string | null;
  reflection?: Array<{ title: string; text: string }> | null;
  capabilities?: Array<{ code: string; evidence: string }> | null;
  tags?: Record<string, string[]> | null;
  status?: ArtefactStatus;
}

export interface CountByUserFilter {
  since?: Date;
  status?: ArtefactStatus;
}

export interface IArtefactsRepository {
  upsertArtefact(
    data: UpsertArtefactData,
    session?: ClientSession
  ): Promise<Result<Artefact, DBError>>;

  listArtefacts(
    query: ListArtefactsQuery,
    session?: ClientSession
  ): Promise<Result<ListArtefactsResult, DBError>>;

  updateArtefactById(
    id: Types.ObjectId,
    data: UpdateArtefactData,
    session?: ClientSession
  ): Promise<Result<Artefact, DBError>>;

  countByUser(
    userId: Types.ObjectId,
    filter?: CountByUserFilter
  ): Promise<Result<number, DBError>>;
}
