import { z } from 'zod';
import { ArtefactSchema, PdpGoalSchema } from './artefact.dto';

export const DashboardResponseSchema = z.object({
  recentEntries: z.object({
    total: z.number(),
    items: z.array(ArtefactSchema),
  }),
  pdpGoalsDue: z.object({
    total: z.number(),
    items: z.array(PdpGoalSchema),
  }),
});

export type DashboardResponse = z.infer<typeof DashboardResponseSchema>;
