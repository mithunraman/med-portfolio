import { EntryTypeDefinition } from '@acme/shared';

export enum GpEntryType {
  CLINICAL_CASE_REVIEW = 'CLINICAL_CASE_REVIEW',
  /**
   * Covers both a full Significant Event and a no-harm Learning Event. They were
   * separate types once, but both resolved to LEA_SEA_TEMPLATE — identical sections,
   * probes, rubrics and word range — so the trainee was being asked to make a
   * GMC-threshold judgement that changed nothing downstream. One type, one form,
   * matching how FourteenFish handles it.
   */
  SIGNIFICANT_EVENT = 'SIGNIFICANT_EVENT',
  FEEDBACK_REFLECTION = 'FEEDBACK_REFLECTION',
  LEADERSHIP_ACTIVITY = 'LEADERSHIP_ACTIVITY',
  ACADEMIC_ACTIVITY = 'ACADEMIC_ACTIVITY',
  OUT_OF_HOURS = 'OUT_OF_HOURS',
  QI_PROJECT = 'QI_PROJECT',
  QI_ACTIVITY = 'QI_ACTIVITY',
  PRESCRIBING = 'PRESCRIBING',
}

export const GP_ENTRY_TYPES: EntryTypeDefinition[] = [
  {
    code: GpEntryType.CLINICAL_CASE_REVIEW,
    label: 'Clinical Case Review',
    description:
      'Reflection on a patient case personally seen. The core learning log entry for clinical encounters.',
    templateId: 'CCR_TEMPLATE',
  },
  {
    code: GpEntryType.SIGNIFICANT_EVENT,
    label: 'Significant Event / Learning event analysis',
    description:
      'Analysis of an event worth learning from, whether or not it met the GMC threshold for harm. Focus on root cause and what changed as a result.',
    templateId: 'LEA_SEA_TEMPLATE',
  },
  {
    code: GpEntryType.FEEDBACK_REFLECTION,
    label: 'Reflection on Feedback',
    description:
      'Reflection on feedback received from colleagues (MSF), patients (PSQ), or exam results.',
    templateId: 'FEEDBACK_TEMPLATE',
  },
  {
    code: GpEntryType.LEADERSHIP_ACTIVITY,
    label: 'Leadership Activity',
    description:
      'Reflective entry on a leadership, management, or organisational activity undertaken.',
    templateId: 'LEADERSHIP_TEMPLATE',
  },
  {
    code: GpEntryType.ACADEMIC_ACTIVITY,
    label: 'Academic Activity',
    description:
      'Reflection on an academic activity such as research, teaching, journal club, or literature review.',
    templateId: 'GENERIC_REFLECTIVE_TEMPLATE',
  },
  {
    code: GpEntryType.OUT_OF_HOURS,
    label: 'Out of Hours / Urgent Care',
    description:
      'Reflection on cases seen during out-of-hours or unscheduled urgent care sessions.',
    templateId: 'CCR_TEMPLATE',
  },
  {
    code: GpEntryType.QI_PROJECT,
    label: 'Quality Improvement Project',
    description:
      'A structured quality improvement project with PDSA cycles, data collection, and sustainability plan.',
    templateId: 'QIP_TEMPLATE',
  },
  {
    code: GpEntryType.QI_ACTIVITY,
    label: 'Quality Improvement Activity',
    description:
      'A smaller-scale quality improvement activity demonstrating ability to identify and act on quality issues.',
    templateId: 'QIA_TEMPLATE',
  },
  {
    code: GpEntryType.PRESCRIBING,
    label: 'Prescribing Assessment',
    description:
      'Reflection on prescribing practice based on a review of prescriptions against GP prescribing proficiencies.',
    templateId: 'PRESCRIBING_TEMPLATE',
  },
];
