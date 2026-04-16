import type { ListPdpGoalsResponse, PdpGoalListItem, PdpGoalResponse } from '@acme/shared';
import { PdpGoalStatus } from '@acme/shared';
import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { toISOStringOrNull } from '../common/utils/date.util';
import { nanoidAlphanumeric } from '../common/utils/nanoid.util';
import { isErr } from '../common/utils/result.util';
import { AddPdpGoalActionDto, UpdatePdpGoalActionDto, UpdatePdpGoalDto } from './dto';
import {
  IPdpGoalsRepository,
  PDP_GOALS_REPOSITORY,
  PdpGoalWithArtefact,
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

function mapGoalWithArtefactToDto(goal: PdpGoalWithArtefact): PdpGoalResponse {
  return {
    id: goal.xid,
    goal: goal.goal,
    status: goal.status,
    reviewDate: toISOStringOrNull(goal.reviewDate),
    completedAt: toISOStringOrNull(goal.completedAt),
    completionReview: goal.completionReview,
    actions: goal.actions.map(mapActionToDto),
    artefactId: goal.artefactXid ?? '',
    artefactTitle: goal.artefactTitle,
  };
}

function mapGoalToListItem(goal: PdpGoal): PdpGoalListItem {
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

    const result = await this.pdpGoalsRepository.findOneWithArtefact(goalXid, userOid);
    if (isErr(result)) throw new InternalServerErrorException(result.error.message);
    if (!result.value || result.value.status === PdpGoalStatus.DELETED) {
      throw new NotFoundException('PDP goal not found');
    }

    const anonResult = await this.pdpGoalsRepository.anonymizeGoal(goalXid, userOid);
    if (isErr(anonResult)) throw new InternalServerErrorException(anonResult.error.message);

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

    if (isErr(result)) throw new InternalServerErrorException(result.error.message);

    return {
      goals: result.value.items.map(mapGoalToListItem),
      nextCursor: result.value.nextCursor,
    };
  }

  async getGoal(userId: string, goalXid: string): Promise<PdpGoalResponse> {
    const result = await this.pdpGoalsRepository.findOneWithArtefact(
      goalXid,
      new Types.ObjectId(userId)
    );

    if (isErr(result)) throw new InternalServerErrorException(result.error.message);
    if (!result.value) throw new NotFoundException('PDP goal not found');

    return mapGoalWithArtefactToDto(result.value);
  }

  async updateGoal(
    userId: string,
    goalXid: string,
    dto: UpdatePdpGoalDto
  ): Promise<PdpGoalResponse> {
    const result = await this.pdpGoalsRepository.findOneWithArtefact(
      goalXid,
      new Types.ObjectId(userId)
    );

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

    const saveResult = await this.pdpGoalsRepository.saveGoal(goalXid, {
      status: goal.status,
      reviewDate: goal.reviewDate,
      completedAt: goal.completedAt,
      completionReview: goal.completionReview,
      actions: goal.actions,
    });

    if (isErr(saveResult)) throw new InternalServerErrorException(saveResult.error.message);

    return mapGoalWithArtefactToDto(goal);
  }

  async addAction(
    userId: string,
    goalXid: string,
    dto: AddPdpGoalActionDto
  ): Promise<PdpGoalResponse> {
    const result = await this.pdpGoalsRepository.findOneWithArtefact(
      goalXid,
      new Types.ObjectId(userId)
    );

    if (isErr(result)) throw new InternalServerErrorException(result.error.message);
    if (!result.value) throw new NotFoundException('PDP goal not found');

    const goal = result.value;
    const newAction: PdpGoalAction = {
      xid: nanoidAlphanumeric(),
      action: dto.action,
      intendedEvidence: '',
      status: PdpGoalStatus.NOT_STARTED,
      dueDate: goal.reviewDate,
      completionReview: null,
    };

    goal.actions = [...goal.actions, newAction];

    const saveResult = await this.pdpGoalsRepository.saveGoal(goalXid, {
      actions: goal.actions,
    });
    if (isErr(saveResult)) throw new InternalServerErrorException(saveResult.error.message);

    return mapGoalWithArtefactToDto(goal);
  }

  async updateAction(
    userId: string,
    goalXid: string,
    actionXid: string,
    dto: UpdatePdpGoalActionDto
  ): Promise<PdpGoalResponse> {
    const result = await this.pdpGoalsRepository.findOneWithArtefact(
      goalXid,
      new Types.ObjectId(userId)
    );

    if (isErr(result)) throw new InternalServerErrorException(result.error.message);
    if (!result.value) throw new NotFoundException('PDP goal not found');

    const goal = result.value;
    const action = goal.actions.find((a) => a.xid === actionXid);
    if (!action) throw new NotFoundException('Action not found');

    if (dto.status !== undefined) action.status = dto.status;
    if (dto.completionReview !== undefined) action.completionReview = dto.completionReview ?? null;

    const saveResult = await this.pdpGoalsRepository.saveGoal(goalXid, {
      actions: goal.actions,
    });
    if (isErr(saveResult)) throw new InternalServerErrorException(saveResult.error.message);

    return mapGoalWithArtefactToDto(goal);
  }
}
