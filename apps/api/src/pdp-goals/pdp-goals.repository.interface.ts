import { PdpGoalStatus } from '@acme/shared';
import { ClientSession, Types } from 'mongoose';
import type { DBError } from '../artefacts/artefacts.repository.interface';
import type { Result } from '../common/utils/result.util';
import type { PdpGoal } from './schemas/pdp-goal.schema';

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

  countByUserId(
    userId: Types.ObjectId,
    statuses: PdpGoalStatus[]
  ): Promise<Result<number, DBError>>;
}
