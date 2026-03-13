import type {
  CoverageResponse,
  ReviewPeriod,
  ReviewPeriodListResponse,
} from '@acme/shared';
import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateReviewPeriodDto, UpdateReviewPeriodDto } from './dto';
import { ReviewPeriodsService } from './review-periods.service';

@Controller('review-periods')
export class ReviewPeriodsController {
  constructor(private readonly reviewPeriodsService: ReviewPeriodsService) {}

  @Post()
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateReviewPeriodDto
  ): Promise<ReviewPeriod> {
    return this.reviewPeriodsService.createReviewPeriod(user.userId, dto);
  }

  @Get()
  async list(@CurrentUser() user: CurrentUserPayload): Promise<ReviewPeriodListResponse> {
    return this.reviewPeriodsService.listReviewPeriods(user.userId);
  }

  @Get(':xid')
  async get(
    @CurrentUser() user: CurrentUserPayload,
    @Param('xid') xid: string
  ): Promise<ReviewPeriod> {
    return this.reviewPeriodsService.getReviewPeriod(user.userId, xid);
  }

  @Patch(':xid')
  async update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('xid') xid: string,
    @Body() dto: UpdateReviewPeriodDto
  ): Promise<ReviewPeriod> {
    return this.reviewPeriodsService.updateReviewPeriod(user.userId, xid, dto);
  }

  @Delete(':xid')
  async archive(
    @CurrentUser() user: CurrentUserPayload,
    @Param('xid') xid: string
  ): Promise<ReviewPeriod> {
    return this.reviewPeriodsService.archiveReviewPeriod(user.userId, xid);
  }

  @Get(':xid/coverage')
  async getCoverage(
    @CurrentUser() user: CurrentUserPayload,
    @Param('xid') xid: string
  ): Promise<CoverageResponse> {
    return this.reviewPeriodsService.getCoverage(user.userId, xid);
  }
}
