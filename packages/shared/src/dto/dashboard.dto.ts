import { z } from 'zod';
import { ArtefactSchema, PdpActionSchema } from './artefact.dto';

export const DashboardStatsSchema = z.object({
  entriesThisWeek: z.number(),
  toReview: z.number(),
  capabilitiesCount: z.number(),
});

export type DashboardStats = z.infer<typeof DashboardStatsSchema>;

export const DashboardResponseSchema = z.object({
  recentEntries: z.object({
    total: z.number(),
    items: z.array(ArtefactSchema),
  }),
  pdpActionsDue: z.object({
    total: z.number(),
    items: z.array(PdpActionSchema),
  }),
  stats: DashboardStatsSchema,
});

export type DashboardResponse = z.infer<typeof DashboardResponseSchema>;
