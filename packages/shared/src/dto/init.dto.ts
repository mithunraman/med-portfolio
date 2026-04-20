import { z } from 'zod';
import { AuthUserSchema } from './auth.dto';
import { DashboardResponseSchema } from './dashboard.dto';
import { AppNoticeSchema } from './notice.dto';
import { QuotaStatusSchema } from './quota.dto';
import { UpdatePolicySchema } from './version-policy.dto';

export const InitResponseSchema = z.object({
  user: AuthUserSchema,
  dashboard: DashboardResponseSchema.nullable(),
  quota: QuotaStatusSchema.nullable(),
  updatePolicy: UpdatePolicySchema.nullable(),
  notices: z.array(AppNoticeSchema),
});

export type InitResponse = z.infer<typeof InitResponseSchema>;
