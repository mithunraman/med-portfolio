import { z } from 'zod';
import { ArtefactSchema, PdpGoalSchema } from './artefact.dto';
import { CoverageSummarySchema, ReviewPeriodSchema } from './review-period.dto';

export const ActiveReviewPeriodSummarySchema = z.object({
  period: ReviewPeriodSchema,
  coverage: CoverageSummarySchema,
});

export type ActiveReviewPeriodSummary = z.infer<typeof ActiveReviewPeriodSummarySchema>;

export const DashboardResponseSchema = z.object({
  recentEntries: z.object({
    total: z.number(),
    items: z.array(ArtefactSchema),
  }),
  pdpGoalsDue: z.object({
    total: z.number(),
    items: z.array(PdpGoalSchema),
  }),
  activeReviewPeriod: ActiveReviewPeriodSummarySchema.nullable(),
});

export type DashboardResponse = z.infer<typeof DashboardResponseSchema>;
