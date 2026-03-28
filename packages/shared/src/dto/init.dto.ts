import { z } from 'zod';
import { AuthUserSchema } from './auth.dto';
import { DashboardResponseSchema } from './dashboard.dto';

export const InitResponseSchema = z.object({
  user: AuthUserSchema,
  dashboard: DashboardResponseSchema.nullable(),
});

export type InitResponse = z.infer<typeof InitResponseSchema>;
