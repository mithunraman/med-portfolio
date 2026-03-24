import { CapabilityDefinition } from '@acme/shared';

export const IM_CAPABILITIES: CapabilityDefinition[] = [
  // Domain 1: Generic CiPs — Professional Behaviour & Trust
  {
    code: 'GCiP-1',
    name: 'NHS Organisational & Management Systems',
    description:
      'Functioning within NHS organisational and management systems. Clinical leadership, career planning, dealing with complexity and uncertainty, resource stewardship.',
    domainCode: 'GD-01',
    domainName: 'Professional Behaviour & Trust',
  },
  {
    code: 'GCiP-2',
    name: 'Ethical & Legal Issues',
    description:
      'Dealing with ethical and legal issues related to clinical practice. Safeguarding, medico-legal considerations, duty of candour, capacity and consent.',
    domainCode: 'GD-01',
    domainName: 'Professional Behaviour & Trust',
  },

  // Domain 2: Generic CiPs — Communication, Teamwork & Leadership
  {
    code: 'GCiP-3',
    name: 'Communication & Shared Decision-Making',
    description:
      'Communicating effectively and sharing decision-making with patients, carers and colleagues. Situational awareness, managing barriers to communication, consultation skills.',
    domainCode: 'GD-02',
    domainName: 'Communication, Teamwork & Leadership',
  },

  // Domain 3: Generic CiPs — Safety & Quality
  {
    code: 'GCiP-4',
    name: 'Patient Safety & Quality Improvement',
    description:
      'Focused on patient safety and delivering effective quality improvement. Human factors, non-technical skills, crisis resource management, working within competence limits.',
    domainCode: 'GD-03',
    domainName: 'Safety & Quality',
  },

  // Domain 4: Generic CiPs — Wider Professional Practice
  {
    code: 'GCiP-5',
    name: 'Research & Data Management',
    description:
      'Carrying out research and managing data appropriately. Critical appraisal, evidence-based practice, research ethics, clinical informatics, genomics awareness.',
    domainCode: 'GD-04',
    domainName: 'Wider Professional Practice',
  },
  {
    code: 'GCiP-6',
    name: 'Clinical Teaching & Supervision',
    description:
      'Acting as a clinical teacher and clinical supervisor. Teaching medical students and junior doctors, providing feedback with action plans, supervising procedures.',
    domainCode: 'GD-04',
    domainName: 'Wider Professional Practice',
  },

  // Domain 5: Clinical CiPs — Acute & Emergency Care
  {
    code: 'CCiP-1',
    name: 'Managing an Acute Unselected Take',
    description:
      'Managing patients presenting acutely with undifferentiated medical problems. History taking, clinical examination, differential diagnosis, investigation, initial management, and appropriate referral.',
    domainCode: 'CD-01',
    domainName: 'Acute & Emergency Care',
  },
  {
    code: 'CCiP-2',
    name: 'Managing Acute Care within a Specialty Service',
    description:
      'Managing patients referred acutely to a specialised medical service. Specialty-specific acute assessment, continuing management of acute illness in a specialty setting.',
    domainCode: 'CD-01',
    domainName: 'Acute & Emergency Care',
  },
  {
    code: 'CCiP-7',
    name: 'Resuscitation & the Deteriorating Patient',
    description:
      'Delivering effective resuscitation and managing the acutely deteriorating patient. Prompt assessment, CPR team leadership, DNACPR decisions, ALS competence.',
    domainCode: 'CD-01',
    domainName: 'Acute & Emergency Care',
  },

  // Domain 6: Clinical CiPs — Inpatient & Continuity Care
  {
    code: 'CCiP-3',
    name: 'Continuity of Care for Medical Inpatients',
    description:
      'Providing continuity of care to medical inpatients including management of comorbidities, cognitive impairment, and the deteriorating patient. Ward-based decision-making and escalation.',
    domainCode: 'CD-02',
    domainName: 'Inpatient & Continuity Care',
  },
  {
    code: 'CCiP-6',
    name: 'Managing a Multidisciplinary Team & Discharge',
    description:
      'Managing a multidisciplinary team including effective discharge planning. Teamwork, handover, length of stay estimation, coordination with primary care.',
    domainCode: 'CD-02',
    domainName: 'Inpatient & Continuity Care',
  },

  // Domain 7: Clinical CiPs — Outpatient & Long-Term Conditions
  {
    code: 'CCiP-4',
    name: 'Outpatient, Ambulatory & Community Care',
    description:
      'Managing patients in outpatient clinic, ambulatory or community settings including long-term conditions. Consultation skills, comorbidity management, patient experience.',
    domainCode: 'CD-03',
    domainName: 'Outpatient & Long-Term Conditions',
  },
  {
    code: 'CCiP-5',
    name: 'Medical Problems in Other Specialties',
    description:
      'Managing medical problems in patients under the care of other specialties and special cases. Cross-specialty liaison, perioperative medicine, pregnancy-related medical issues.',
    domainCode: 'CD-03',
    domainName: 'Outpatient & Long-Term Conditions',
  },

  // Domain 8: Clinical CiPs — Palliative & End of Life
  {
    code: 'CCiP-8',
    name: 'End of Life & Palliative Care',
    description:
      'Managing end of life and applying palliative care skills. Recognising limited reversibility, symptom control, advance care planning, syringe pump use, specialist palliative care referral.',
    domainCode: 'CD-04',
    domainName: 'Palliative & End of Life Care',
  },
];
