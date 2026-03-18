import { PdpGoalStatus } from '@acme/shared';
import { ClientSession, Types } from 'mongoose';
import type { DBError } from '../artefacts/artefacts.repository.interface';
import type { Result } from '../common/utils/result.util';
import type { PdpGoal, PdpGoalAction } from './schemas/pdp-goal.schema';

export const PDP_GOALS_REPOSITORY = Symbol('PDP_GOALS_REPOSITORY');

export interface CreatePdpGoalActionData {
  action: string;
  intendedEvidence: string;
}

export interface CreatePdpGoalData {
  userId: Types.ObjectId;
  artefactId: Types.ObjectId;
  goal: string;
  actions: CreatePdpGoalActionData[];
}

export interface FindByUserOptions {
  limit?: number;
  sortByNextDueDate?: boolean;
  dueBefore?: Date;
}

export interface SaveGoalData {
  status?: PdpGoalStatus;
  reviewDate?: Date | null;
  completedAt?: Date | null;
  completionReview?: string | null;
  actions?: PdpGoalAction[];
}

export interface UpdatePdpGoalData {
  status?: PdpGoalStatus;
  reviewDate?: Date | null;
  completionReview?: string | null;
}

export interface UpdatePdpGoalActionData {
  actionXid: string;
  status: PdpGoalStatus;
}

export interface PdpGoalWithArtefact {
  xid: string;
  goal: string;
  userId: Types.ObjectId;
  artefactId: Types.ObjectId | null;
  status: PdpGoalStatus;
  reviewDate: Date | null;
  completedAt: Date | null;
  completionReview: string | null;
  actions: PdpGoalAction[];
  createdAt: Date;
  updatedAt: Date;
  artefactXid: string | null;
  artefactTitle: string | null;
}

export interface IPdpGoalsRepository {
  create(
    goals: CreatePdpGoalData[],
    session?: ClientSession
  ): Promise<Result<PdpGoal[], DBError>>;

  findByArtefactIds(
    ids: Types.ObjectId[],
    session?: ClientSession
  ): Promise<Result<Map<string, PdpGoal[]>, DBError>>;

  findByArtefactId(
    id: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<PdpGoal[], DBError>>;

  findByUserId(
    userId: Types.ObjectId,
    statuses: PdpGoalStatus[],
    options?: FindByUserOptions
  ): Promise<Result<PdpGoal[], DBError>>;

  findByUserIdWithArtefact(
    userId: Types.ObjectId,
    statuses: PdpGoalStatus[]
  ): Promise<Result<PdpGoalWithArtefact[], DBError>>;

  findOneWithArtefact(
    goalXid: string,
    userId: Types.ObjectId
  ): Promise<Result<PdpGoalWithArtefact | null, DBError>>;

  countByUserId(
    userId: Types.ObjectId,
    statuses: PdpGoalStatus[]
  ): Promise<Result<number, DBError>>;

  saveGoal(xid: string, data: SaveGoalData): Promise<Result<void, DBError>>;

  updateGoal(
    goalXid: string,
    data: UpdatePdpGoalData,
    actionUpdates?: UpdatePdpGoalActionData[],
    session?: ClientSession
  ): Promise<Result<void, DBError>>;

  updateManyByArtefactId(
    artefactId: Types.ObjectId,
    filter: { statuses: PdpGoalStatus[] },
    data: UpdatePdpGoalData,
    session?: ClientSession
  ): Promise<Result<void, DBError>>;

  deleteByArtefactId(
    artefactId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<number, DBError>>;
}
