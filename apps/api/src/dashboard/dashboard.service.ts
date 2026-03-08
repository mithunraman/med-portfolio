import type { DashboardResponse } from '@acme/shared';
import { ArtefactStatus, PdpGoalStatus } from '@acme/shared';
import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  ARTEFACTS_REPOSITORY,
  IArtefactsRepository,
} from '../artefacts/artefacts.repository.interface';
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
    @Inject(ARTEFACTS_REPOSITORY)
    private readonly artefactsRepository: IArtefactsRepository,
    @Inject(PDP_GOALS_REPOSITORY)
    private readonly pdpGoalsRepository: IPdpGoalsRepository
  ) {}

  async getDashboard(userId: string): Promise<DashboardResponse> {
    const userObjectId = new Types.ObjectId(userId);
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const activeStatuses = [PdpGoalStatus.PENDING, PdpGoalStatus.ACTIVE];

    const [
      recentEntriesResult,
      recentEntriesTotalResult,
      pdpGoalsResult,
      pdpGoalsTotalResult,
      entriesThisWeekResult,
      toReviewResult,
    ] = await Promise.all([
      this.artefactsService.listArtefacts(userId, { limit: 5 }),
      this.artefactsRepository.countByUser(userObjectId, { since: fourteenDaysAgo }),
      this.pdpGoalsRepository.findByUserId(userObjectId, activeStatuses, {
        limit: 5,
        sortByNextDueDate: true,
      }),
      this.pdpGoalsRepository.countByUserId(userObjectId, activeStatuses),
      this.artefactsRepository.countByUser(userObjectId, { since: sevenDaysAgo }),
      this.artefactsRepository.countByUser(userObjectId, { status: ArtefactStatus.REVIEW }),
    ]);

    if (isErr(recentEntriesTotalResult)) {
      throw new InternalServerErrorException(recentEntriesTotalResult.error.message);
    }
    if (isErr(pdpGoalsResult)) {
      throw new InternalServerErrorException(pdpGoalsResult.error.message);
    }
    if (isErr(pdpGoalsTotalResult)) {
      throw new InternalServerErrorException(pdpGoalsTotalResult.error.message);
    }
    if (isErr(entriesThisWeekResult)) {
      throw new InternalServerErrorException(entriesThisWeekResult.error.message);
    }
    if (isErr(toReviewResult)) {
      throw new InternalServerErrorException(toReviewResult.error.message);
    }

    // Count distinct capability codes from recent entries
    const capabilityCodes = new Set<string>();
    for (const artefact of recentEntriesResult.artefacts) {
      if (artefact.capabilities) {
        for (const cap of artefact.capabilities) {
          capabilityCodes.add(cap.code);
        }
      }
    }

    return {
      recentEntries: {
        total: recentEntriesTotalResult.value,
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
      stats: {
        entriesThisWeek: entriesThisWeekResult.value,
        toReview: toReviewResult.value,
        capabilitiesCount: capabilityCodes.size,
      },
    };
  }
}
