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
      label: 'I will anonymise patient identifiers in my reflections.',
      required: true,
    },
  ],
  ctaLabel: 'Continue',
  ctaDisclaimer: 'By tapping Continue you agree to the Privacy Policy and Terms of Service.',
} as const;
