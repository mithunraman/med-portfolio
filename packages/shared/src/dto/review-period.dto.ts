import { z } from 'zod';
import { ReviewPeriodStatus } from '../enums/review-period-status.enum';

// Review Period schemas
export const ReviewPeriodSchema = z.object({
  id: z.string(),
  name: z.string(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  status: z.nativeEnum(ReviewPeriodStatus),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ReviewPeriod = z.infer<typeof ReviewPeriodSchema>;

// Request schemas
export const CreateReviewPeriodRequestSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must not exceed 100 characters'),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

export type CreateReviewPeriodRequest = z.infer<typeof CreateReviewPeriodRequestSchema>;

export const UpdateReviewPeriodRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export type UpdateReviewPeriodRequest = z.infer<typeof UpdateReviewPeriodRequestSchema>;

// Coverage schemas
export const CapabilityCoverageSchema = z.object({
  code: z.string(),
  name: z.string(),
  entryCount: z.number(),
  status: z.enum(['covered', 'missing']),
});

export type CapabilityCoverage = z.infer<typeof CapabilityCoverageSchema>;

export const DomainCoverageSchema = z.object({
  code: z.string(),
  name: z.string(),
  coveredCount: z.number(),
  totalCount: z.number(),
  capabilities: z.array(CapabilityCoverageSchema),
});

export type DomainCoverage = z.infer<typeof DomainCoverageSchema>;

export const CoverageSummarySchema = z.object({
  totalCapabilities: z.number(),
  coveredCount: z.number(),
  coveragePercent: z.number(),
});

export type CoverageSummary = z.infer<typeof CoverageSummarySchema>;

export const CoverageResponseSchema = z.object({
  period: ReviewPeriodSchema,
  summary: CoverageSummarySchema,
  domains: z.array(DomainCoverageSchema),
  gaps: z.array(z.string()),
});

export type CoverageResponse = z.infer<typeof CoverageResponseSchema>;

// List response
export const ReviewPeriodListResponseSchema = z.object({
  reviewPeriods: z.array(ReviewPeriodSchema),
});

export type ReviewPeriodListResponse = z.infer<typeof ReviewPeriodListResponseSchema>;
