import type { InitResponse } from '@acme/shared';
import { UserRole } from '@acme/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AcknowledgementsRepository, computeNeedsReAck, NOTICE_REGISTRY } from '../acknowledgements';
import {
  ARTEFACTS_REPOSITORY,
  IArtefactsRepository,
} from '../artefacts/artefacts.repository.interface';
import { AuthService } from '../auth/auth.service';
import { isErr } from '../common/utils/result.util';
import { isGuestAtArtefactLimit } from '../config/quota.config';
import { DashboardService } from '../dashboard/dashboard.service';
import { NoticesService } from '../notices/notices.service';
import { QuotaService } from '../quota/quota.service';
import { VersionPolicyService } from '../version-policy/version-policy.service';

@Injectable()
export class InitService {
  private readonly logger = new Logger(InitService.name);

  constructor(
    private readonly authService: AuthService,
    private readonly dashboardService: DashboardService,
    private readonly quotaService: QuotaService,
    private readonly versionPolicyService: VersionPolicyService,
    private readonly noticesService: NoticesService,
    private readonly acknowledgementsRepository: AcknowledgementsRepository,
    @Inject(ARTEFACTS_REPOSITORY)
    private readonly artefactsRepository: IArtefactsRepository
  ) {}

  async getInit(
    userId: string,
    role: UserRole,
    platform?: string,
    appVersion?: string
  ): Promise<InitResponse> {
    const [
      userResult,
      dashboardResult,
      quotaResult,
      updatePolicyResult,
      noticesResult,
      latestAckResult,
      guestLimitResult,
    ] = await Promise.allSettled([
      this.authService.getCurrentUser(userId),
      this.dashboardService.getDashboard(userId),
      this.quotaService.getQuotaStatus(userId, role),
      this.versionPolicyService.evaluate(platform, appVersion),
      this.noticesService.getNoticesForUser(userId, role),
      this.acknowledgementsRepository.findAcknowledgedVersions(userId),
      this.computeGuestArtefactLimitReached(userId, role),
    ]);

    if (userResult.status === 'rejected') {
      throw userResult.reason;
    }

    let dashboard: InitResponse['dashboard'] = null;
    if (dashboardResult.status === 'fulfilled') {
      dashboard = dashboardResult.value;
    } else {
      this.logger.warn(`Dashboard fetch failed for user ${userId}: ${dashboardResult.reason}`);
    }

    let quota: InitResponse['quota'] = null;
    if (quotaResult.status === 'fulfilled') {
      quota = quotaResult.value;
    } else {
      this.logger.warn(`Quota fetch failed for user ${userId}: ${quotaResult.reason}`);
    }

    let updatePolicy: InitResponse['updatePolicy'] = null;
    if (updatePolicyResult.status === 'fulfilled') {
      updatePolicy = updatePolicyResult.value;
    } else {
      this.logger.warn(
        `Version policy eval failed for user ${userId}: ${updatePolicyResult.reason}`
      );
    }

    let notices: InitResponse['notices'] = [];
    if (noticesResult.status === 'fulfilled') {
      notices = noticesResult.value;
    } else {
      this.logger.warn(`Notices fetch failed for user ${userId}: ${noticesResult.reason}`);
    }

    const acknowledgement = this.resolveAcknowledgement(userId, latestAckResult);

    let guestArtefactLimitReached = false;
    if (guestLimitResult.status === 'fulfilled') {
      guestArtefactLimitReached = guestLimitResult.value;
    } else {
      this.logger.warn(
        `Guest artefact limit check failed for user ${userId}: ${guestLimitResult.reason}`
      );
    }

    return {
      user: userResult.value,
      dashboard,
      quota,
      updatePolicy,
      notices,
      acknowledgement,
      guestArtefactLimitReached,
    };
  }

  private async computeGuestArtefactLimitReached(
    userId: string,
    role: UserRole
  ): Promise<boolean> {
    if (role !== UserRole.USER_GUEST) return false;

    const result = await this.artefactsRepository.countByUser(userId);
    if (isErr(result)) {
      this.logger.warn(`Guest artefact count failed for ${userId}: ${result.error.message}`);
      return false;
    }
    return isGuestAtArtefactLimit(role, result.value);
  }

  private resolveAcknowledgement(
    userId: string,
    latestAckResult: PromiseSettledResult<
      Awaited<ReturnType<AcknowledgementsRepository['findAcknowledgedVersions']>>
    >
  ): InitResponse['acknowledgement'] {
    if (latestAckResult.status !== 'fulfilled' || isErr(latestAckResult.value)) {
      const reason =
        latestAckResult.status === 'rejected'
          ? String(latestAckResult.reason)
          : 'repository error';
      this.logger.warn(`Ack lookup failed for user ${userId}; failing closed (${reason})`);
      return { needs: true, document: NOTICE_REGISTRY.active };
    }

    const versions = latestAckResult.value.value;
    const result = computeNeedsReAck(versions);

    if (result.needs) {
      if (result.reason === 'unknown_version') {
        this.logger.warn(
          `User ${userId} has no acked version in registry (acked: ${versions.join(', ')}); prompting active`
        );
      }
      return { needs: true, document: result.document };
    }
    return { needs: false };
  }
}
