// FROZEN on activation. Do not edit. Ship a new vN.M.ts for any change.
import type { NoticeDocument } from '@acme/shared';

export const NOTICE_V1_0: NoticeDocument = {
  version: 'v1.0',
  requiresReAckFromPriorVersions: false,
  title: 'Before you start',
  subtitle: null,
  body: [
    {
      type: 'paragraph',
      text: 'Logdit helps UK trainee doctors turn clinical experiences into portfolio entries. Your reflections are transcribed and analysed by AI to help draft each entry.',
    },
    {
      type: 'links',
      items: [
        { label: 'Privacy Policy', url: 'https://logdit.app/privacy' },
        { label: 'Terms of Service', url: 'https://logdit.app/terms' },
      ],
    },
  ],
  acknowledgements: [
    { id: 'role_uk_trainee', label: 'I am a UK doctor in training', required: true },
    {
      id: 'patient_anon_duty',
      label: "I'll keep patients unidentifiable in what I record.",
      required: true,
    },
    {
      id: 'accept_privacy_terms',
      label: 'I have read and agree to the Privacy Policy and Terms of Service.',
      required: true,
    },
  ],
  ctaLabel: 'Continue',
  ctaDisclaimer: 'You must confirm the statements above to continue.',
} as const;
