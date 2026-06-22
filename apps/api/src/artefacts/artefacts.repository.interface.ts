import { ArtefactStatus, Completeness, DraftStatus, Specialty } from '@acme/shared';
import { ClientSession, Types } from 'mongoose';
import type { DBError, Result } from '../common/utils/result.util';
import type { Artefact } from './schemas/artefact.schema';

export const ARTEFACTS_REPOSITORY = Symbol('ARTEFACTS_REPOSITORY');


// Artefact types
export interface UpsertArtefactData {
  artefactId: string;
  userId: Types.ObjectId;
  specialty: Specialty;
  trainingStage: string;
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
  capabilities?: Array<{ code: string; evidence: string; justification?: string }> | null;
  completeness?: Completeness | null;
  draftStatus?: DraftStatus | null;
  readinessScore?: number | null;
  composedDocument?: Array<{ sectionId: string; label: string; text: string }> | null;
  tags?: Record<string, string[]> | null;
  status?: ArtefactStatus;
  completedAt?: Date | null;
}

export interface CountByUserFilter {
  since?: Date;
  status?: ArtefactStatus;
}

export interface UpsertArtefactReviewData {
  rating: number;
  comment: string | null;
}

export interface IArtefactsRepository {
  findById(
    id: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<Artefact | null, DBError>>;

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
    userId: Types.ObjectId,
    data: UpdateArtefactData,
    session?: ClientSession
  ): Promise<Result<Artefact, DBError>>;

  findByXid(
    xid: string,
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<Artefact | null, DBError>>;

  upsertReview(
    xid: string,
    userId: Types.ObjectId,
    data: UpsertArtefactReviewData,
    session?: ClientSession
  ): Promise<Result<Artefact, DBError>>;

  countByUser(
    userId: string,
    filter?: CountByUserFilter,
    session?: ClientSession
  ): Promise<Result<number, DBError>>;

  markDeletedByUserId(userId: Types.ObjectId): Promise<Result<number, DBError>>;

  markDeleted(
    ids: Types.ObjectId[],
    session?: ClientSession
  ): Promise<Result<number, DBError>>;
}
