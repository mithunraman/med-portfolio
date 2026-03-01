import { ClientSession, Types } from 'mongoose';
import type { DBError } from '../artefacts/artefacts.repository.interface';
import type { Result } from '../common/utils/result.util';
import type { PdpAction } from './schemas/pdp-action.schema';

export const PDP_ACTIONS_REPOSITORY = Symbol('PDP_ACTIONS_REPOSITORY');

export interface CreatePdpActionData {
  userId: Types.ObjectId;
  artefactId: Types.ObjectId;
  action: string;
  timeframe: string;
}

export interface IPdpActionsRepository {
  create(
    actions: CreatePdpActionData[],
    session?: ClientSession
  ): Promise<Result<PdpAction[], DBError>>;

  findByArtefactIds(
    ids: Types.ObjectId[],
    session?: ClientSession
  ): Promise<Result<Map<string, PdpAction[]>, DBError>>;

  findByArtefactId(
    id: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<PdpAction[], DBError>>;
}
