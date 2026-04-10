import type { ListPdpGoalsResponse, PdpGoalResponse } from '@acme/shared';
import { PdpGoalStatus } from '@acme/shared';
import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { nanoidAlphanumeric } from '../common/utils/nanoid.util';
import { isErr } from '../common/utils/result.util';
import { AddPdpGoalActionDto, UpdatePdpGoalActionDto, UpdatePdpGoalDto } from './dto';
import {
  IPdpGoalsRepository,
  PDP_GOALS_REPOSITORY,
  PdpGoalWithArtefact,
} from './pdp-goals.repository.interface';
import type { PdpGoalAction } from './schemas/pdp-goal.schema';

const DEFAULT_STATUSES = [PdpGoalStatus.STARTED, PdpGoalStatus.COMPLETED];


function mapActionToDto(a: PdpGoalAction) {
  return {
    id: a.xid,
    action: a.action,
    intendedEvidence: a.intendedEvidence,
    status: a.status,
    dueDate: a.dueDate ? (a.dueDate instanceof Date ? a.dueDate.toISOString() : a.dueDate) : null,
    completionReview: a.completionReview,
  };
}

function mapGoalToDto(goal: PdpGoalWithArtefact): PdpGoalResponse {
  return {
    id: goal.xid,
    goal: goal.goal,
    status: goal.status,
    reviewDate:
      goal.reviewDate instanceof Date ? goal.reviewDate.toISOString() : (goal.reviewDate ?? null),
    completedAt:
      goal.completedAt instanceof Date
        ? goal.completedAt.toISOString()
        : (goal.completedAt ?? null),
    completionReview: goal.completionReview,
    actions: goal.actions.map(mapActionToDto),
    artefactId: goal.artefactXid ?? '',
    artefactTitle: goal.artefactTitle,
  };
}

@Injectable()
export class PdpGoalsService {
  constructor(
    @Inject(PDP_GOALS_REPOSITORY)
    private readonly pdpGoalsRepository: IPdpGoalsRepository
  ) {}

  async listGoals(userId: string, statuses?: PdpGoalStatus[]): Promise<ListPdpGoalsResponse> {
    const effectiveStatuses = statuses && statuses.length > 0 ? statuses : DEFAULT_STATUSES;
    const userId$ = new Types.ObjectId(userId);

    const [goalsResult, countResult] = await Promise.all([
      this.pdpGoalsRepository.findByUserIdWithArtefact(userId$, effectiveStatuses),
      this.pdpGoalsRepository.countByUserId(userId$, effectiveStatuses),
    ]);

    if (isErr(goalsResult)) throw new InternalServerErrorException(goalsResult.error.message);
    if (isErr(countResult)) throw new InternalServerErrorException(countResult.error.message);

    return {
      goals: goalsResult.value.map(mapGoalToDto),
      total: countResult.value,
    };
  }

  async getGoal(userId: string, goalXid: string): Promise<PdpGoalResponse> {
    const result = await this.pdpGoalsRepository.findOneWithArtefact(
      goalXid,
      new Types.ObjectId(userId)
    );

    if (isErr(result)) throw new InternalServerErrorException(result.error.message);
    if (!result.value) throw new NotFoundException('PDP goal not found');

    return mapGoalToDto(result.value);
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
      nextActionDueDate: goal.reviewDate,
      actions: goal.actions,
    });

    if (isErr(saveResult)) throw new InternalServerErrorException(saveResult.error.message);

    return mapGoalToDto(goal);
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
      nextActionDueDate: goal.reviewDate,
    });
    if (isErr(saveResult)) throw new InternalServerErrorException(saveResult.error.message);

    return mapGoalToDto(goal);
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
      nextActionDueDate: goal.reviewDate,
    });
    if (isErr(saveResult)) throw new InternalServerErrorException(saveResult.error.message);

    return mapGoalToDto(goal);
  }
}
