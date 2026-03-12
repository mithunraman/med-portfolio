import type { ListPdpGoalsResponse, PdpGoalResponse } from '@acme/shared';
import { PdpGoalStatus } from '@acme/shared';
import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { isErr } from '../common/utils/result.util';
import type { PdpGoalAction } from './schemas/pdp-goal.schema';
import {
  IPdpGoalsRepository,
  PDP_GOALS_REPOSITORY,
  PdpGoalWithArtefact,
} from './pdp-goals.repository.interface';
import { AddPdpGoalActionDto, UpdatePdpGoalActionDto, UpdatePdpGoalDto } from './dto';

const DEFAULT_STATUSES = [PdpGoalStatus.ACTIVE, PdpGoalStatus.COMPLETED];

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
    reviewDate: goal.reviewDate instanceof Date ? goal.reviewDate.toISOString() : (goal.reviewDate ?? null),
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

  async updateGoal(userId: string, goalXid: string, dto: UpdatePdpGoalDto): Promise<PdpGoalResponse> {
    const existing = await this.pdpGoalsRepository.findOneWithArtefact(
      goalXid,
      new Types.ObjectId(userId)
    );

    if (isErr(existing)) throw new InternalServerErrorException(existing.error.message);
    if (!existing.value) throw new NotFoundException('PDP goal not found');

    const updateResult = await this.pdpGoalsRepository.updateGoal(goalXid, {
      status: dto.status,
      reviewDate: dto.reviewDate !== undefined ? (dto.reviewDate ? new Date(dto.reviewDate) : null) : undefined,
      completionReview: dto.completionReview,
    });

    if (isErr(updateResult)) throw new InternalServerErrorException(updateResult.error.message);

    return this.getGoal(userId, goalXid);
  }

  async addAction(userId: string, goalXid: string, dto: AddPdpGoalActionDto): Promise<PdpGoalResponse> {
    const existing = await this.pdpGoalsRepository.findOneWithArtefact(
      goalXid,
      new Types.ObjectId(userId)
    );

    if (isErr(existing)) throw new InternalServerErrorException(existing.error.message);
    if (!existing.value) throw new NotFoundException('PDP goal not found');

    const dueDate = existing.value.reviewDate;

    const addResult = await this.pdpGoalsRepository.addAction(goalXid, dto.action, dueDate);
    if (isErr(addResult)) throw new InternalServerErrorException(addResult.error.message);

    return this.getGoal(userId, goalXid);
  }

  async updateAction(
    userId: string,
    goalXid: string,
    actionXid: string,
    dto: UpdatePdpGoalActionDto
  ): Promise<PdpGoalResponse> {
    const existing = await this.pdpGoalsRepository.findOneWithArtefact(
      goalXid,
      new Types.ObjectId(userId)
    );

    if (isErr(existing)) throw new InternalServerErrorException(existing.error.message);
    if (!existing.value) throw new NotFoundException('PDP goal not found');

    const actionExists = existing.value.actions.some((a) => a.xid === actionXid);
    if (!actionExists) throw new NotFoundException('Action not found');

    const updateResult = await this.pdpGoalsRepository.updateSingleAction(goalXid, actionXid, {
      status: dto.status,
      completionReview: dto.completionReview,
    });

    if (isErr(updateResult)) throw new InternalServerErrorException(updateResult.error.message);

    return this.getGoal(userId, goalXid);
  }
}
