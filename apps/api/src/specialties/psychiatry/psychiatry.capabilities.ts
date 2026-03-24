import { CapabilityDefinition } from '@acme/shared';

export const PSYCHIATRY_CAPABILITIES: CapabilityDefinition[] = [
  // Domain 1: Professional Standards
  {
    code: 'PSY-01',
    name: 'Professional Relationships',
    description:
      'Working collaboratively with patients, families, carers and colleagues. Respecting autonomy, diversity and addressing systemic inequalities. Maintaining therapeutic optimism and boundaries.',
    domainCode: 'PD-01',
    domainName: 'Professional Standards',
  },
  {
    code: 'PSY-02',
    name: 'Professional Standards & Wellbeing',
    description:
      'Maintaining professional standards, managing emotional impact of work including suicide and homicide, duty of candour, supervision, reflective practice, Balint group participation, and sustainable psychiatric practice.',
    domainCode: 'PD-01',
    domainName: 'Professional Standards',
  },

  // Domain 2: Clinical Practice
  {
    code: 'PSY-03',
    name: 'Communication & Interpersonal Skills',
    description:
      'Advanced verbal and non-verbal communication, active listening, shared decision-making, report writing, communicating distressing information, working with interpreters and across cultures.',
    domainCode: 'PD-02',
    domainName: 'Clinical Practice',
  },
  {
    code: 'PSY-04',
    name: 'Clinical Assessment, Formulation & Management',
    description:
      'Psychiatric history taking, Mental State Examination, risk assessment, capacity assessment, diagnosis using classification systems, psycho-bio-social formulation, prescribing, physical health assessment, psychological therapies, and person-centred management plans.',
    domainCode: 'PD-02',
    domainName: 'Clinical Practice',
  },
  {
    code: 'PSY-05',
    name: 'Managing Complexity & Uncertainty',
    description:
      'Recognising and managing clinical uncertainty, transference and countertransference, unconscious dynamics, multimorbidity, polypharmacy, and varying from established pathways when clinically indicated.',
    domainCode: 'PD-02',
    domainName: 'Clinical Practice',
  },

  // Domain 3: Professional Knowledge
  {
    code: 'PSY-06',
    name: 'Legal Frameworks & Mental Health Act',
    description:
      'Application of mental health legislation including compulsory treatment, emergency powers, capacity law, human rights balancing, and statutory approval requirements across UK jurisdictions.',
    domainCode: 'PD-03',
    domainName: 'Professional Knowledge',
  },
  {
    code: 'PSY-07',
    name: 'NHS & Organisational Structures',
    description:
      'Working within and contributing to the development of NHS and wider health and social care services, understanding regulatory authorities and local service structures.',
    domainCode: 'PD-03',
    domainName: 'Professional Knowledge',
  },

  // Domain 4: Public Health & Prevention
  {
    code: 'PSY-08',
    name: 'Health Promotion & Illness Prevention',
    description:
      'Understanding health inequalities and social determinants of mental health, promoting mental wellbeing, challenging stigma, collaborative cross-agency working, physical health optimisation, and social prescribing.',
    domainCode: 'PD-04',
    domainName: 'Public Health & Prevention',
  },

  // Domain 5: Leadership & Teamwork
  {
    code: 'PSY-09',
    name: 'Team Working',
    description:
      'Understanding MDT roles and interfaces, team dynamics, conflict resolution, collaborative working with diverse colleagues, and managing unconscious dynamics within teams.',
    domainCode: 'PD-05',
    domainName: 'Leadership & Teamwork',
  },
  {
    code: 'PSY-10',
    name: 'Leadership',
    description:
      'Developing and applying leadership skills, inclusive leadership, managing hierarchy and power dynamics, leading and managing teams and services, providing consultation and specialist advice.',
    domainCode: 'PD-05',
    domainName: 'Leadership & Teamwork',
  },

  // Domain 6: Quality & Safety
  {
    code: 'PSY-11',
    name: 'Patient Safety',
    description:
      'Understanding clinical governance principles, promoting patient safety, learning from critical incidents and serious untoward incidents.',
    domainCode: 'PD-06',
    domainName: 'Quality & Safety',
  },
  {
    code: 'PSY-12',
    name: 'Quality Improvement',
    description:
      'Understanding QI methodology, leading and undertaking quality improvement activities, disseminating findings and implementing change.',
    domainCode: 'PD-06',
    domainName: 'Quality & Safety',
  },

  // Domain 7: Safeguarding
  {
    code: 'PSY-13',
    name: 'Safeguarding & Vulnerability',
    description:
      'Identifying individual and systemic vulnerability factors, working within safeguarding legislative frameworks, understanding victimisation, exploitation and trauma in vulnerable groups.',
    domainCode: 'PD-07',
    domainName: 'Safeguarding',
  },

  // Domain 8: Education & Research
  {
    code: 'PSY-14',
    name: 'Education, Training & Supervision',
    description:
      'Teaching and training in clinical and academic settings, providing clinical and educational supervision, creating safe learning environments, mentoring, and pursuing continuing professional development.',
    domainCode: 'PD-08',
    domainName: 'Education & Research',
  },
  {
    code: 'PSY-15',
    name: 'Research & Critical Appraisal',
    description:
      'Critical evaluation of research, meta-analyses and evidence-based guidelines, applying findings to clinical practice, understanding statistical methods, working within ethical research frameworks, and contributing to research studies.',
    domainCode: 'PD-08',
    domainName: 'Education & Research',
  },
];
