import type { DashboardResponse } from '@acme/shared';
import { ArtefactStatus, PdpActionStatus } from '@acme/shared';
import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  ARTEFACTS_REPOSITORY,
  IArtefactsRepository,
} from '../artefacts/artefacts.repository.interface';
import { ArtefactsService } from '../artefacts/artefacts.service';
import { isErr } from '../common/utils/result.util';
import {
  IPdpActionsRepository,
  PDP_ACTIONS_REPOSITORY,
} from '../pdp-actions/pdp-actions.repository.interface';

@Injectable()
export class DashboardService {
  constructor(
    private readonly artefactsService: ArtefactsService,
    @Inject(ARTEFACTS_REPOSITORY)
    private readonly artefactsRepository: IArtefactsRepository,
    @Inject(PDP_ACTIONS_REPOSITORY)
    private readonly pdpActionsRepository: IPdpActionsRepository
  ) {}

  async getDashboard(userId: string): Promise<DashboardResponse> {
    const userObjectId = new Types.ObjectId(userId);
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const activeStatuses = [PdpActionStatus.PENDING, PdpActionStatus.ACTIVE];

    const [
      recentEntriesResult,
      recentEntriesTotalResult,
      pdpActionsResult,
      pdpActionsTotalResult,
      entriesThisWeekResult,
      toReviewResult,
    ] = await Promise.all([
      this.artefactsService.listArtefacts(userId, { limit: 5 }),
      this.artefactsRepository.countByUser(userObjectId, { since: fourteenDaysAgo }),
      this.pdpActionsRepository.findByUserId(userObjectId, activeStatuses, {
        limit: 5,
        sortByDueDate: true,
      }),
      this.pdpActionsRepository.countByUserId(userObjectId, activeStatuses),
      this.artefactsRepository.countByUser(userObjectId, { since: sevenDaysAgo }),
      this.artefactsRepository.countByUser(userObjectId, { status: ArtefactStatus.REVIEW }),
    ]);

    if (isErr(recentEntriesTotalResult)) {
      throw new InternalServerErrorException(recentEntriesTotalResult.error.message);
    }
    if (isErr(pdpActionsResult)) {
      throw new InternalServerErrorException(pdpActionsResult.error.message);
    }
    if (isErr(pdpActionsTotalResult)) {
      throw new InternalServerErrorException(pdpActionsTotalResult.error.message);
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
      pdpActionsDue: {
        total: pdpActionsTotalResult.value,
        items: pdpActionsResult.value.map((p) => ({
          id: p.xid,
          action: p.action,
          timeframe: p.timeframe,
          status: p.status as PdpActionStatus,
          dueDate: p.dueDate?.toISOString() ?? null,
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
