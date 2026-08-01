import { EntryTypeDefinition } from '@acme/shared';

export enum ImEntryType {
  CLINICAL_CASE_REVIEW = 'CLINICAL_CASE_REVIEW',
  CASE_BASED_DISCUSSION = 'CASE_BASED_DISCUSSION',
  ACUTE_CARE_ASSESSMENT = 'ACUTE_CARE_ASSESSMENT',
  SIGNIFICANT_EVENT = 'SIGNIFICANT_EVENT',
  REFLECTIVE_PRACTICE = 'REFLECTIVE_PRACTICE',
  PROCEDURAL_SKILLS = 'PROCEDURAL_SKILLS',
  OUTPATIENT_ASSESSMENT = 'OUTPATIENT_ASSESSMENT',
  TEACHING_ACTIVITY = 'TEACHING_ACTIVITY',
  QI_PROJECT = 'QI_PROJECT',
  FEEDBACK_REFLECTION = 'FEEDBACK_REFLECTION',
}

export const IM_ENTRY_TYPES: EntryTypeDefinition[] = [
  {
    code: ImEntryType.CLINICAL_CASE_REVIEW,
    label: 'Clinical Case Review (Mini-CEX)',
    description:
      'Reflection on a clinical encounter personally assessed. The core entry type for bedside assessments covering history, examination, clinical reasoning, and management.',
    templateId: 'IM_MINIEX_TEMPLATE',
  },
  {
    code: ImEntryType.CASE_BASED_DISCUSSION,
    label: 'Case-Based Discussion (CbD)',
    description:
      'Structured discussion of a case with a supervisor focusing on clinical reasoning, diagnostic uncertainty, management of comorbidities, and evidence-based decision-making.',
    templateId: 'IM_CBD_TEMPLATE',
  },
  {
    code: ImEntryType.ACUTE_CARE_ASSESSMENT,
    label: 'Acute Care Assessment (ACAT)',
    description:
      'Reflection on management of an acute unselected or specialty take, or the care of an acutely deteriorating patient. Covers the full episode from presentation through to disposition.',
    templateId: 'IM_ACAT_TEMPLATE',
  },
  {
    code: ImEntryType.SIGNIFICANT_EVENT,
    label: 'Significant Event Analysis',
    description:
      'Analysis of a significant event such as a patient safety incident, unexpected deterioration, cardiac arrest, near-miss, or complaint. Focus on root cause and systemic learning.',
    templateId: 'IM_SEA_TEMPLATE',
  },
  {
    code: ImEntryType.REFLECTIVE_PRACTICE,
    label: 'Reflective Practice Entry',
    description:
      'General reflection on a clinical or professional experience. Suited to exploring diagnostic uncertainty, ethical dilemmas, communication challenges, or personal development.',
    templateId: 'IM_REFLECTION_TEMPLATE',
  },
  {
    code: ImEntryType.PROCEDURAL_SKILLS,
    label: 'Procedural Skills (DOPS)',
    description:
      'Reflection on performing or observing a practical procedure. Covers indication, consent, technique, complications, and supervision level.',
    templateId: 'IM_DOPS_TEMPLATE',
  },
  {
    code: ImEntryType.OUTPATIENT_ASSESSMENT,
    label: 'Outpatient Care Assessment (OPCAT)',
    description:
      'Reflection on managing patients in an outpatient, ambulatory, or community setting. Covers long-term condition management, clinic letters, and shared decision-making.',
    templateId: 'IM_OPCAT_TEMPLATE',
  },
  {
    code: ImEntryType.TEACHING_ACTIVITY,
    label: 'Teaching & Supervision Activity',
    description:
      'Reflection on planning and delivering teaching, or supervising junior colleagues. Covers teaching methods, feedback received, and impact on learners.',
    templateId: 'IM_TEACHING_TEMPLATE',
  },
  {
    code: ImEntryType.QI_PROJECT,
    label: 'Quality Improvement Project (QIPAT)',
    description:
      'A structured quality improvement project with PDSA cycles, data collection, and sustainability plan within a medical service.',
    templateId: 'IM_QIP_TEMPLATE',
  },
  {
    code: ImEntryType.FEEDBACK_REFLECTION,
    label: 'Reflection on Feedback (MSF)',
    description:
      'Reflection on multi-source feedback (MSF), patient survey (PS), MRCP exam results, or supervisor feedback.',
    templateId: 'IM_FEEDBACK_TEMPLATE',
  },
];
