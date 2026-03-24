import type {
  CoverageResponse,
  CoverageSummary,
  DomainCoverage,
  ReviewPeriod as ReviewPeriodDto,
  ReviewPeriodListResponse,
} from '@acme/shared';
import { ArtefactStatus, ReviewPeriodStatus } from '@acme/shared';
import { InjectModel } from '@nestjs/mongoose';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { startOfDay } from 'date-fns';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../auth/schemas/user.schema';
import {
  ARTEFACTS_REPOSITORY,
  IArtefactsRepository,
} from '../artefacts/artefacts.repository.interface';
import { AppLruCache } from '../common/cache';
import { ARTEFACT_STATE_CHANGED, type ArtefactStateChangedEvent } from '../common/events';
import { isErr } from '../common/utils/result.util';
import { getSpecialtyConfig } from '../specialties/specialty.registry';
import {
  IReviewPeriodsRepository,
  REVIEW_PERIODS_REPOSITORY,
} from './review-periods.repository.interface';
import type { ReviewPeriod } from './schemas/review-period.schema';

@Injectable()
export class ReviewPeriodsService {
  private readonly coverageCache = new AppLruCache<string, CoverageResponse>({
    maxSize: 2000,
  });

  constructor(
    @Inject(REVIEW_PERIODS_REPOSITORY)
    private readonly reviewPeriodsRepository: IReviewPeriodsRepository,
    @Inject(ARTEFACTS_REPOSITORY)
    private readonly artefactsRepository: IArtefactsRepository,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>
  ) {}

  async createReviewPeriod(
    userId: string,
    dto: { name: string; startDate: string; endDate: string }
  ): Promise<ReviewPeriodDto> {
    const userObjectId = new Types.ObjectId(userId);
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    // Validate: endDate must be in the future
    const today = startOfDay(new Date());
    if (endDate <= today) {
      throw new BadRequestException('End date must be in the future');
    }

    // Validate: endDate must be after startDate
    if (endDate <= startDate) {
      throw new BadRequestException('End date must be after start date');
    }

    // Check for existing active review period
    const activeResult = await this.reviewPeriodsRepository.findActiveByUserId(userObjectId);
    if (isErr(activeResult)) {
      throw new InternalServerErrorException(activeResult.error.message);
    }
    if (activeResult.value) {
      throw new ConflictException(
        'An active review period already exists. Archive it before creating a new one.'
      );
    }

    const createResult = await this.reviewPeriodsRepository.create({
      userId: userObjectId,
      name: dto.name,
      startDate,
      endDate,
    });

    if (isErr(createResult)) {
      throw new InternalServerErrorException(createResult.error.message);
    }

    return this.toDto(createResult.value);
  }

  async getReviewPeriod(userId: string, xid: string): Promise<ReviewPeriodDto> {
    const doc = await this.findOrThrow(userId, xid);
    return this.toDto(doc);
  }

  async listReviewPeriods(userId: string): Promise<ReviewPeriodListResponse> {
    const result = await this.reviewPeriodsRepository.findByUserId(new Types.ObjectId(userId));

    if (isErr(result)) {
      throw new InternalServerErrorException(result.error.message);
    }

    return {
      reviewPeriods: result.value.map((rp) => this.toDto(rp)),
    };
  }

  async updateReviewPeriod(
    userId: string,
    xid: string,
    dto: { name?: string; startDate?: string; endDate?: string }
  ): Promise<ReviewPeriodDto> {
    const existing = await this.findOrThrow(userId, xid);

    if (existing.status === ReviewPeriodStatus.ARCHIVED) {
      throw new BadRequestException('Cannot update an archived review period');
    }

    const updateData: { name?: string; startDate?: Date; endDate?: Date } = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.startDate !== undefined) updateData.startDate = new Date(dto.startDate);
    if (dto.endDate !== undefined) updateData.endDate = new Date(dto.endDate);

    // Validate dates if either is being updated
    const effectiveStart = updateData.startDate ?? existing.startDate;
    const effectiveEnd = updateData.endDate ?? existing.endDate;
    if (effectiveEnd <= effectiveStart) {
      throw new BadRequestException('End date must be after start date');
    }

    const result = await this.reviewPeriodsRepository.updateByXid(
      xid,
      new Types.ObjectId(userId),
      updateData
    );

    if (isErr(result)) {
      throw new InternalServerErrorException(result.error.message);
    }
    if (!result.value) {
      throw new NotFoundException('Review period not found');
    }

    // Invalidate coverage cache for this user
    this.invalidateCoverageCache(userId);

    return this.toDto(result.value);
  }

  async archiveReviewPeriod(userId: string, xid: string): Promise<ReviewPeriodDto> {
    const existing = await this.findOrThrow(userId, xid);

    if (existing.status === ReviewPeriodStatus.ARCHIVED) {
      throw new BadRequestException('Review period is already archived');
    }

    const result = await this.reviewPeriodsRepository.updateByXid(xid, new Types.ObjectId(userId), {
      status: ReviewPeriodStatus.ARCHIVED,
    });

    if (isErr(result)) {
      throw new InternalServerErrorException(result.error.message);
    }
    if (!result.value) {
      throw new NotFoundException('Review period not found');
    }

    this.invalidateCoverageCache(userId);

    return this.toDto(result.value);
  }

  async getCoverage(userId: string, xid: string): Promise<CoverageResponse> {
    const period = await this.findOrThrow(userId, xid);
    return this.computeOrGetCachedCoverage(userId, period);
  }

  /**
   * Get coverage summary for the active review period.
   * Returns null if no active period exists.
   */
  async getActiveCoverageSummary(
    userId: string
  ): Promise<{ period: ReviewPeriodDto; coverage: CoverageSummary } | null> {
    const result = await this.reviewPeriodsRepository.findActiveByUserId(
      new Types.ObjectId(userId)
    );

    if (isErr(result)) {
      throw new InternalServerErrorException(result.error.message);
    }

    if (!result.value) {
      return null;
    }

    const coverageResponse = await this.computeOrGetCachedCoverage(userId, result.value);

    return {
      period: this.toDto(result.value),
      coverage: coverageResponse.summary,
    };
  }

  @OnEvent(ARTEFACT_STATE_CHANGED)
  handleArtefactStateChanged(event: ArtefactStateChangedEvent): void {
    this.invalidateCoverageCache(event.userId);
  }

  invalidateCoverageCache(userId: string): void {
    this.coverageCache.deleteBy((key) => key.startsWith(`coverage:${userId}:`));
  }

  // --- Private helpers ---

  private async findOrThrow(userId: string, xid: string): Promise<ReviewPeriod> {
    const result = await this.reviewPeriodsRepository.findByXid(xid, new Types.ObjectId(userId));

    if (isErr(result)) {
      throw new InternalServerErrorException(result.error.message);
    }
    if (!result.value) {
      throw new NotFoundException('Review period not found');
    }

    return result.value;
  }

  private async computeOrGetCachedCoverage(
    userId: string,
    period: ReviewPeriod
  ): Promise<CoverageResponse> {
    const cacheKey = `coverage:${userId}:${period.xid}`;
    const cached = this.coverageCache.get(cacheKey);
    if (cached) return cached;

    const coverage = await this.computeCoverage(userId, period);
    this.coverageCache.set(cacheKey, coverage);
    return coverage;
  }

  private async computeCoverage(userId: string, period: ReviewPeriod): Promise<CoverageResponse> {
    // Look up user's specialty to get the correct config
    const user = await this.userModel.findById(new Types.ObjectId(userId)).lean();
    if (!user?.specialty) {
      throw new InternalServerErrorException('User has no specialty set');
    }
    const config = getSpecialtyConfig(user.specialty);

    // Query completed artefacts within the review period date range
    const result = await this.artefactsRepository.listArtefacts({
      userId: new Types.ObjectId(userId),
      status: ArtefactStatus.COMPLETED,
      limit: 1000, // Get all completed artefacts — coverage needs full picture
    });

    if (isErr(result)) {
      throw new InternalServerErrorException(result.error.message);
    }

    // Filter to artefacts completed within the period
    const artefactsInPeriod = result.value.artefacts.filter((a) => {
      if (!a.completedAt) return false;
      return a.completedAt >= period.startDate && a.completedAt <= period.endDate;
    });

    // Count entries per capability
    const capabilityCounts = new Map<string, number>();
    for (const artefact of artefactsInPeriod) {
      if (!artefact.capabilities) continue;
      for (const cap of artefact.capabilities) {
        capabilityCounts.set(cap.code, (capabilityCounts.get(cap.code) ?? 0) + 1);
      }
    }

    // Build domain-grouped coverage
    const domainMap = new Map<string, DomainCoverage>();

    for (const capDef of config.capabilities) {
      const domainCode = capDef.domainCode ?? 'uncategorised';
      const domainName = capDef.domainName ?? 'Uncategorised';

      if (!domainMap.has(domainCode)) {
        domainMap.set(domainCode, {
          code: domainCode,
          name: domainName,
          coveredCount: 0,
          totalCount: 0,
          capabilities: [],
        });
      }

      const domain = domainMap.get(domainCode)!;
      const entryCount = capabilityCounts.get(capDef.code) ?? 0;
      const status = entryCount > 0 ? 'covered' : 'missing';

      domain.capabilities.push({
        code: capDef.code,
        name: capDef.name,
        entryCount,
        status,
      });

      domain.totalCount++;
      if (status === 'covered') domain.coveredCount++;
    }

    const domains = Array.from(domainMap.values());
    const totalCapabilities = config.capabilities.length;
    const coveredCount = domains.reduce((sum, d) => sum + d.coveredCount, 0);
    const coveragePercent =
      totalCapabilities > 0 ? Math.round((coveredCount / totalCapabilities) * 100) : 0;

    const gaps = config.capabilities
      .filter((c) => (capabilityCounts.get(c.code) ?? 0) === 0)
      .map((c) => c.code);

    const coverageResponse: CoverageResponse = {
      period: this.toDto(period),
      summary: { totalCapabilities, coveredCount, coveragePercent },
      domains,
      gaps,
    };

    return coverageResponse;
  }

  private toDto(doc: ReviewPeriod): ReviewPeriodDto {
    return {
      id: doc.xid,
      name: doc.name,
      startDate: doc.startDate.toISOString(),
      endDate: doc.endDate.toISOString(),
      status: doc.status,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }
}
