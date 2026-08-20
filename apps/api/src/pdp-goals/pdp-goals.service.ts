import type { ListPdpGoalsResponse, PdpGoalListItem, PdpGoalResponse } from '@acme/shared';
import { PdpGoalStatus } from '@acme/shared';
import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ClientSession, Types } from 'mongoose';
import { toISOStringOrNull } from '../common/utils/date.util';
import { nanoidAlphanumeric } from '../common/utils/nanoid.util';
import { isErr, unwrapVoid } from '../common/utils/result.util';
import { AddPdpGoalActionDto, UpdatePdpGoalActionDto, UpdatePdpGoalDto } from './dto';
import {
  IPdpGoalsRepository,
  PDP_GOALS_REPOSITORY,
  PdpGoalWithArtefacts,
} from './pdp-goals.repository.interface';
import type { PdpGoal, PdpGoalAction } from './schemas/pdp-goal.schema';

const DEFAULT_STATUSES = [PdpGoalStatus.STARTED, PdpGoalStatus.COMPLETED];

function mapActionToDto(a: PdpGoalAction) {
  return {
    id: a.xid,
    action: a.action,
    intendedEvidence: a.intendedEvidence,
    status: a.status,
    dueDate: toISOStringOrNull(a.dueDate),
    completionReview: a.completionReview,
  };
}

/**
 * The fields the list mapper reads — narrower than `PdpGoal` so that both a raw
 * document and a `PdpGoalWithArtefacts` satisfy it. The latter is not assignable
 * to `PdpGoal`: it has no `_id`, `links` or `sortDate`.
 */
type PdpGoalListFields = Pick<
  PdpGoal,
  'xid' | 'goal' | 'status' | 'reviewDate' | 'completedAt' | 'completionReview' | 'actions'
>;

/** The list item plus its citations — PdpGoalResponse is PdpGoalSchema.extend. */
function mapGoalWithArtefactsToDto(goal: PdpGoalWithArtefacts): PdpGoalResponse {
  return {
    ...mapGoalToListItem(goal),
    linkedArtefacts: goal.linkedArtefacts.map((a) => ({
      id: a.xid,
      title: a.title,
      linkedAt: a.linkedAt.toISOString(),
    })),
  };
}

function mapGoalToListItem(goal: PdpGoalListFields): PdpGoalListItem {
  return {
    id: goal.xid,
    goal: goal.goal,
    status: goal.status,
    reviewDate: toISOStringOrNull(goal.reviewDate),
    completedAt: toISOStringOrNull(goal.completedAt),
    completionReview: goal.completionReview,
    actions: goal.actions.map(mapActionToDto),
  };
}

@Injectable()
export class PdpGoalsService {
  constructor(
    @Inject(PDP_GOALS_REPOSITORY)
    private readonly pdpGoalsRepository: IPdpGoalsRepository
  ) {}

  async deleteGoal(userId: string, goalXid: string): Promise<{ message: string }> {
    const userOid = new Types.ObjectId(userId);

    const anonResult = await this.pdpGoalsRepository.anonymizeGoal(goalXid, userOid);
    if (isErr(anonResult)) throw new InternalServerErrorException(anonResult.error.message);

    // No pre-read: anonymizeGoal filters on { xid, userId, status: $ne DELETED } —
    // exactly the existence check — and its boolean is `modifiedCount > 0`. That is
    // a faithful proxy for "matched" here, because the filter demands status !==
    // DELETED and the tombstone sets it, so a matched document always changes.
    // Without that guarantee this would 404 a delete that actually succeeded.
    if (!anonResult.value) throw new NotFoundException('PDP goal not found');

    return { message: 'Goal deleted successfully' };
  }

  async listGoals(
    userId: string,
    query: { statuses?: PdpGoalStatus[]; cursor?: string; limit?: number }
  ): Promise<ListPdpGoalsResponse> {
    const effectiveStatuses =
      query.statuses && query.statuses.length > 0 ? query.statuses : DEFAULT_STATUSES;
    const userId$ = new Types.ObjectId(userId);

    const result = await this.pdpGoalsRepository.findPaginated(
      userId$,
      effectiveStatuses,
      query.cursor,
      query.limit
    );

    if (isErr(result)) {
      switch (result.error.code) {
        case 'INVALID_CURSOR':
          throw new BadRequestException(result.error.message);
        case 'DB_ERROR':
          throw new InternalServerErrorException(result.error.message);
        default: {
          // Adding a code to PdpGoalErrorCode without handling it here is a
          // compile error — forces a deliberate HTTP mapping decision.
          const exhaustive: never = result.error.code;
          throw new InternalServerErrorException(`Unhandled error code: ${String(exhaustive)}`);
        }
      }
    }

    return {
      goals: result.value.items.map(mapGoalToListItem),
      nextCursor: result.value.nextCursor,
    };
  }

  async getGoal(userId: string, goalXid: string): Promise<PdpGoalResponse> {
    const result = await this.pdpGoalsRepository.findOneWithArtefacts(
      goalXid,
      new Types.ObjectId(userId)
    );

    if (isErr(result)) throw new InternalServerErrorException(result.error.message);
    if (!result.value) throw new NotFoundException('PDP goal not found');

    return mapGoalWithArtefactsToDto(result.value);
  }

  async updateGoal(
    userId: string,
    goalXid: string,
    dto: UpdatePdpGoalDto
  ): Promise<PdpGoalResponse> {
    const userOid = new Types.ObjectId(userId);

    const result = await this.pdpGoalsRepository.findOneWithArtefacts(goalXid, userOid);

    if (isErr(result)) throw new InternalServerErrorException(result.error.message);
    if (!result.value) throw new NotFoundException('PDP goal not found');

    const goal = result.value;

    if (dto.status !== undefined) goal.status = dto.status;
    if (dto.reviewDate !== undefined) {
      goal.reviewDate = dto.reviewDate ? new Date(dto.reviewDate) : null;
      goal.actions = goal.actions.map((a) => ({ ...a, dueDate: goal.reviewDate }));
    }
    if (dto.completionReview !== undefined) goal.completionReview = dto.completionReview ?? null;

    // When marking complete, complete all non-archived actions and capture timestamp
    if (dto.status === PdpGoalStatus.COMPLETED) {
      goal.completedAt = new Date();
      goal.actions = goal.actions.map((a) =>
        a.status !== PdpGoalStatus.ARCHIVED ? { ...a, status: PdpGoalStatus.COMPLETED } : a
      );
    }

    const saveResult = await this.pdpGoalsRepository.saveGoal(goalXid, userOid, {
      status: goal.status,
      reviewDate: goal.reviewDate,
      completedAt: goal.completedAt,
      completionReview: goal.completionReview,
      actions: goal.actions,
    });

    if (isErr(saveResult)) {
      if (saveResult.error.code === 'NOT_FOUND') {
        throw new NotFoundException('PDP goal not found');
      }
      throw new InternalServerErrorException(saveResult.error.message);
    }

    return mapGoalWithArtefactsToDto(goal);
  }

  async addAction(
    userId: string,
    goalXid: string,
    dto: AddPdpGoalActionDto
  ): Promise<PdpGoalResponse> {
    const userOid = new Types.ObjectId(userId);

    const result = await this.pdpGoalsRepository.findOneWithArtefacts(goalXid, userOid);

    if (isErr(result)) throw new InternalServerErrorException(result.error.message);
    if (!result.value) throw new NotFoundException('PDP goal not found');

    const goal = result.value;
    const newAction: PdpGoalAction = {
      xid: nanoidAlphanumeric(),
      action: dto.action,
      intendedEvidence: '',
      // STARTED, not PROPOSED: a manually added action on an already-adopted goal
      // was written by the trainee, not suggested by analysis, and never passes
      // through finalise. It also matches what the UI already produces — the
      // action toggle flips between COMPLETED and STARTED, never back to PROPOSED.
      status: PdpGoalStatus.STARTED,
      dueDate: goal.reviewDate,
      completionReview: null,
    };

    goal.actions = [...goal.actions, newAction];

    const saveResult = await this.pdpGoalsRepository.saveGoal(goalXid, userOid, {
      actions: goal.actions,
    });
    if (isErr(saveResult)) {
      if (saveResult.error.code === 'NOT_FOUND') {
        throw new NotFoundException('PDP goal not found');
      }
      throw new InternalServerErrorException(saveResult.error.message);
    }

    return mapGoalWithArtefactsToDto(goal);
  }

  async updateAction(
    userId: string,
    goalXid: string,
    actionXid: string,
    dto: UpdatePdpGoalActionDto
  ): Promise<PdpGoalResponse> {
    const userOid = new Types.ObjectId(userId);

    const result = await this.pdpGoalsRepository.findOneWithArtefacts(goalXid, userOid);

    if (isErr(result)) throw new InternalServerErrorException(result.error.message);
    if (!result.value) throw new NotFoundException('PDP goal not found');

    const goal = result.value;
    const action = goal.actions.find((a) => a.xid === actionXid);
    if (!action) throw new NotFoundException('Action not found');

    if (dto.status !== undefined) action.status = dto.status;
    if (dto.completionReview !== undefined) action.completionReview = dto.completionReview ?? null;

    const saveResult = await this.pdpGoalsRepository.saveGoal(goalXid, userOid, {
      actions: goal.actions,
    });
    if (isErr(saveResult)) {
      if (saveResult.error.code === 'NOT_FOUND') {
        throw new NotFoundException('PDP goal not found');
      }
      throw new InternalServerErrorException(saveResult.error.message);
    }

    return mapGoalWithArtefactsToDto(goal);
  }

  /**
   * Deleting an entry does NOT delete its goals (see `PdpGoalLink`). The one
   * exception, applied here: unclaimed PROPOSALS from those entries are
   * hard-deleted — they are unreachable in the UI, so the trainee cannot remove
   * them by hand, and left behind they accumulate against a deleted entry.
   */
  async deleteProposalsByArtefactIds(
    artefactIds: Types.ObjectId[],
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<void> {
    unwrapVoid(await this.pdpGoalsRepository.deleteUnadoptedProposals(artefactIds, userId, session));
  }
}
