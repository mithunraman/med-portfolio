import { EntryTypeDefinition } from '@acme/shared';

export enum PsychiatryEntryType {
  CLINICAL_CASE_REVIEW = 'CLINICAL_CASE_REVIEW',
  CASE_BASED_DISCUSSION = 'CASE_BASED_DISCUSSION',
  SIGNIFICANT_EVENT = 'SIGNIFICANT_EVENT',
  REFLECTIVE_PRACTICE = 'REFLECTIVE_PRACTICE',
  PSYCHOTHERAPY_CASE = 'PSYCHOTHERAPY_CASE',
  DONCS = 'DONCS',
  MHA_APPLICATION = 'MHA_APPLICATION',
  TEACHING_ACTIVITY = 'TEACHING_ACTIVITY',
  QI_PROJECT = 'QI_PROJECT',
  FEEDBACK_REFLECTION = 'FEEDBACK_REFLECTION',
}

export const PSYCHIATRY_ENTRY_TYPES: EntryTypeDefinition[] = [
  {
    code: PsychiatryEntryType.CLINICAL_CASE_REVIEW,
    label: 'Clinical Case Review (ACE)',
    description:
      'Reflection on a psychiatric assessment personally conducted. The core entry type for clinical encounters including history, MSE, formulation, risk assessment, and management plan.',
    templateId: 'PSY_ACE_TEMPLATE',
  },
  {
    code: PsychiatryEntryType.CASE_BASED_DISCUSSION,
    label: 'Case-Based Discussion (CbD)',
    description:
      'Structured discussion of a case with a supervisor focusing on clinical reasoning, risk management, ethical considerations, and application of the Mental Health Act.',
    templateId: 'PSY_CBD_TEMPLATE',
  },
  {
    code: PsychiatryEntryType.SIGNIFICANT_EVENT,
    label: 'Significant Event Analysis',
    description:
      'Analysis of a significant event such as patient suicide, serious self-harm, safeguarding concern, restraint incident, or near-miss. Focus on root cause and systemic learning.',
    templateId: 'PSY_SEA_TEMPLATE',
  },
  {
    code: PsychiatryEntryType.REFLECTIVE_PRACTICE,
    label: 'Reflective Practice Entry',
    description:
      'General reflection on a clinical or professional experience. Broader than a case review, suited to exploring emotional impact, professional development, and the therapeutic relationship.',
    templateId: 'PSY_REFLECTION_TEMPLATE',
  },
  {
    code: PsychiatryEntryType.PSYCHOTHERAPY_CASE,
    label: 'Psychotherapy Case Reflection (SAPE)',
    description:
      'Reflection on psychotherapy delivered under supervision. Covers therapeutic modality, process, formulation, transference/countertransference, and outcomes. Required: minimum two modalities during core training.',
    templateId: 'PSY_SAPE_TEMPLATE',
  },
  {
    code: PsychiatryEntryType.DONCS,
    label: 'Direct Observation of Non-Clinical Skills (DONCS)',
    description:
      'Reflection on observed non-clinical skills such as chairing an MDT meeting, family meeting facilitation, teaching delivery, or inter-agency liaison.',
    templateId: 'PSY_DONCS_TEMPLATE',
  },
  {
    code: PsychiatryEntryType.MHA_APPLICATION,
    label: 'Mental Health Act Application',
    description:
      'Reflection on use of mental health legislation including detention, capacity assessment, community treatment orders, or emergency powers. Covers legal reasoning, human rights balancing, and ethical considerations.',
    templateId: 'PSY_MHA_TEMPLATE',
  },
  {
    code: PsychiatryEntryType.TEACHING_ACTIVITY,
    label: 'Teaching & Education Activity',
    description:
      'Reflection on planning and delivering teaching, or supervising junior colleagues. Covers teaching methods, feedback received, and impact on learners.',
    templateId: 'PSY_TEACHING_TEMPLATE',
  },
  {
    code: PsychiatryEntryType.QI_PROJECT,
    label: 'Quality Improvement Project',
    description:
      'A structured quality improvement project within a psychiatric service, with PDSA cycles, data collection, and sustainability plan.',
    templateId: 'PSY_QIP_TEMPLATE',
  },
  {
    code: PsychiatryEntryType.FEEDBACK_REFLECTION,
    label: 'Reflection on Feedback (MSF)',
    description:
      'Reflection on multi-source feedback (MSF), patient feedback, exam results (MRCPsych), or supervisor feedback.',
    templateId: 'PSY_FEEDBACK_TEMPLATE',
  },
];
