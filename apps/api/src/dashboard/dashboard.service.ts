import type { DashboardResponse } from '@acme/shared';
import { PdpGoalStatus } from '@acme/shared';
import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ArtefactsService } from '../artefacts/artefacts.service';
import { isErr } from '../common/utils/result.util';
import {
  IPdpGoalsRepository,
  PDP_GOALS_REPOSITORY,
} from '../pdp-goals/pdp-goals.repository.interface';

@Injectable()
export class DashboardService {
  constructor(
    private readonly artefactsService: ArtefactsService,
    @Inject(PDP_GOALS_REPOSITORY)
    private readonly pdpGoalsRepository: IPdpGoalsRepository
  ) {}

  async getDashboard(userId: string): Promise<DashboardResponse> {
    const userObjectId = new Types.ObjectId(userId);
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const activeStatuses = [PdpGoalStatus.PENDING, PdpGoalStatus.ACTIVE];

    const [recentEntriesResult, pdpGoalsResult, pdpGoalsTotalResult] = await Promise.all([
      this.artefactsService.listArtefacts(userId, { limit: 5 }),
      this.pdpGoalsRepository.findByUserId(userObjectId, activeStatuses, {
        limit: 5,
        sortByNextDueDate: true,
        dueBefore: thirtyDaysFromNow,
      }),
      this.pdpGoalsRepository.countByUserId(userObjectId, activeStatuses),
    ]);

    if (isErr(pdpGoalsResult)) {
      throw new InternalServerErrorException(pdpGoalsResult.error.message);
    }
    if (isErr(pdpGoalsTotalResult)) {
      throw new InternalServerErrorException(pdpGoalsTotalResult.error.message);
    }

    return {
      recentEntries: {
        total: recentEntriesResult.artefacts.length,
        items: recentEntriesResult.artefacts,
      },
      pdpGoalsDue: {
        total: pdpGoalsTotalResult.value,
        items: pdpGoalsResult.value.map((g) => ({
          id: g.xid,
          goal: g.goal,
          status: g.status as PdpGoalStatus,
          reviewDate: g.reviewDate?.toISOString() ?? null,
          completionReview: g.completionReview,
          actions: g.actions.map((a) => ({
            id: a.xid,
            action: a.action,
            intendedEvidence: a.intendedEvidence,
            status: a.status as PdpGoalStatus,
            dueDate: a.dueDate?.toISOString() ?? null,
            completionReview: a.completionReview,
          })),
        })),
      },
    };
  }
}
