import { z } from 'zod';

export const QuotaWindowSchema = z.object({
  used: z.number(),
  limit: z.number(),
  resetsAt: z.string().datetime().nullable(),
  windowType: z.enum(['rolling', 'fixed']),
});

export type QuotaWindow = z.infer<typeof QuotaWindowSchema>;

export const QuotaStatusSchema = z.object({
  shortWindow: QuotaWindowSchema,
  weeklyWindow: QuotaWindowSchema,
});

export type QuotaStatus = z.infer<typeof QuotaStatusSchema>;

export const CreditInfoItemSchema = z.object({
  title: z.string(),
  description: z.string(),
});

export type CreditInfoItem = z.infer<typeof CreditInfoItemSchema>;

export const CreditInfoResponseSchema = z.array(CreditInfoItemSchema);

export type CreditInfoResponse = z.infer<typeof CreditInfoResponseSchema>;
