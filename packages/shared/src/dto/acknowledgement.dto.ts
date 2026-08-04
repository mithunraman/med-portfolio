import { z } from 'zod';

export const acknowledgementIdSchema = z.enum([
  'patient_anon_duty',
  // UK GDPR Art 9(2)(a) explicit consent. Deliberately separate from
  // `accept_privacy_terms`: consent bundled into terms acceptance is not
  // consent, so these two must never be merged into a single checkbox.
  'health_data_consent',
  // Carries BOTH the eligibility warranty and acceptance of the Terms and
  // Privacy Policy. Combining them is safe precisely because neither is consent
  // — the unbundling rule in Art 7 constrains consent, not contract mechanics,
  // so non-consent items may be combined with each other freely. The id is kept
  // narrow for continuity; the legally operative text is the LABEL, recoverable
  // from the frozen notice document that `noticeVersion` resolves to.
  'accept_privacy_terms',
]);
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
  //
  // This is a judgement about MATERIALITY, not a formatting flag: set it true
  // whenever a new version changes what the user is actually agreeing to — new
  // processing, a new purpose, a new recipient, or any change to the Art 9
  // consent item. Typo fixes and reworded prose do not qualify. Getting it wrong
  // in the false direction means users are bound by terms they never saw.
  // v1.0 = false (no prior versions exist, so nobody can be stale against it).
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
    .refine((arr) => new Set(arr.map((a) => a.id)).size === arr.length, {
      message: 'acknowledgements must contain unique ids',
    }),
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
