import type {
  CoverageResponse,
  CreateReviewPeriodRequest,
  ReviewPeriod,
  ReviewPeriodListResponse,
  UpdateReviewPeriodRequest,
} from '@acme/shared';
import { BaseApiClient } from '../core/api-client';

export class ReviewPeriodsClient {
  constructor(private readonly client: BaseApiClient) {}

  async createReviewPeriod(data: CreateReviewPeriodRequest): Promise<ReviewPeriod> {
    return this.client.post<ReviewPeriod>('/review-periods', data);
  }

  async listReviewPeriods(): Promise<ReviewPeriodListResponse> {
    return this.client.get<ReviewPeriodListResponse>('/review-periods');
  }

  async getReviewPeriod(xid: string): Promise<ReviewPeriod> {
    return this.client.get<ReviewPeriod>(`/review-periods/${xid}`);
  }

  async updateReviewPeriod(xid: string, data: UpdateReviewPeriodRequest): Promise<ReviewPeriod> {
    return this.client.patch<ReviewPeriod>(`/review-periods/${xid}`, data);
  }

  async archiveReviewPeriod(xid: string): Promise<ReviewPeriod> {
    return this.client.delete<ReviewPeriod>(`/review-periods/${xid}`);
  }

  async getCoverage(xid: string): Promise<CoverageResponse> {
    return this.client.get<CoverageResponse>(`/review-periods/${xid}/coverage`);
  }
}
