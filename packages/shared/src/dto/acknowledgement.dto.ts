import { z } from 'zod';

export const acknowledgementIdSchema = z.enum(['role_uk_trainee', 'patient_anon_duty']);
export type AcknowledgementId = z.infer<typeof acknowledgementIdSchema>;

export const acknowledgementCopySchema = z.object({
  id: acknowledgementIdSchema,
  label: z.string(),
  required: z.boolean(),
});
export type AcknowledgementCopy = z.infer<typeof acknowledgementCopySchema>;

export const noticeBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('paragraph'), text: z.string() }),
  z.object({
    type: z.literal('links'),
    items: z.array(z.object({ label: z.string(), url: z.string().url() })),
  }),
]);
export type NoticeBlock = z.infer<typeof noticeBlockSchema>;

export const noticeDocumentSchema = z.object({
  version: z.string(),
  // If true, users whose latest acceptance predates this version are re-prompted.
  // Set by counsel review per version. v1.0 = false (no prior versions exist).
  requiresReAckFromPriorVersions: z.boolean(),
  title: z.string(),
  subtitle: z.string().nullable(),
  body: z.array(noticeBlockSchema),
  acknowledgements: z.array(acknowledgementCopySchema),
  ctaLabel: z.string(),
  ctaDisclaimer: z.string(),
});
export type NoticeDocument = z.infer<typeof noticeDocumentSchema>;

export const initAcknowledgementSchema = z.discriminatedUnion('needs', [
  z.object({ needs: z.literal(false) }),
  z.object({ needs: z.literal(true), document: noticeDocumentSchema }),
]);
export type InitAcknowledgement = z.infer<typeof initAcknowledgementSchema>;

export const createAcknowledgementRequestSchema = z.object({
  noticeVersion: z.string(),
  acknowledgements: z
    .array(
      z.object({
        id: acknowledgementIdSchema,
        given: z.boolean(),
      })
    )
    .min(1)
    .max(20)
    .refine(
      (arr) => new Set(arr.map((a) => a.id)).size === arr.length,
      { message: 'acknowledgements must contain unique ids' }
    ),
});
export type CreateAcknowledgementRequest = z.infer<typeof createAcknowledgementRequestSchema>;

export const acknowledgementResponseSchema = z.object({
  xid: z.string(),
  noticeVersion: z.string(),
  recordedAt: z.string().datetime(),
  acknowledgements: z.array(
    z.object({
      id: acknowledgementIdSchema,
      given: z.boolean(),
    })
  ),
});
export type AcknowledgementResponse = z.infer<typeof acknowledgementResponseSchema>;
