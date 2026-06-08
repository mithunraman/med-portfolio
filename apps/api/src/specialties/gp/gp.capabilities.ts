import { CapabilityDefinition } from '@acme/shared';

export const GP_CAPABILITIES: CapabilityDefinition[] = [
  // Domain 1: Knowing yourself and relating to others
  {
    code: 'C-01',
    name: 'Fitness to practise',
    description:
      'Maintaining professional standards, personal health and wellbeing, recognising limits of competence, seeking help when needed.',
    domainCode: 'D-01',
    domainName: 'Knowing yourself and relating to others',
  },
  {
    code: 'C-02',
    name: 'An ethical approach',
    description:
      'Applying ethical principles in clinical practice, consent, confidentiality, capacity, safeguarding, professional boundaries.',
    domainCode: 'D-01',
    domainName: 'Knowing yourself and relating to others',
  },
  {
    code: 'C-03',
    name: 'Communicating and consulting',
    description:
      'Effective communication with patients, shared decision-making, active listening, explaining complex information, telephone and video consulting.',
    descriptorCriteria:
      'Strong = describes a specific communication technique the trainee used (how they explained, checked understanding, or adapted to the patient) and its effect — not just that they "communicated well".',
    domainCode: 'D-01',
    domainName: 'Knowing yourself and relating to others',
  },

  // Domain 2: Applying clinical knowledge and skill
  {
    code: 'C-04',
    name: 'Data gathering and interpretation',
    description:
      'Taking focused histories, identifying relevant information, interpreting clinical data, using investigations appropriately.',
    descriptorCriteria:
      'Strong = names the specific history, examination, or investigation the trainee chose and how they interpreted the result to inform the diagnosis — not just that they "took a history".',
    domainCode: 'D-02',
    domainName: 'Applying clinical knowledge and skill',
  },
  {
    code: 'C-05',
    name: 'Clinical examination and procedural skills',
    description:
      'Performing targeted examinations, clinical procedures, intimate examinations, using equipment appropriately.',
    descriptorCriteria:
      'Strong = describes the specific examination or procedure the trainee performed and what it elicited or ruled out — adapted to the patient — not just that they "examined the patient".',
    domainCode: 'D-02',
    domainName: 'Applying clinical knowledge and skill',
  },
  {
    code: 'C-06',
    name: 'Decision-making and diagnosis',
    description:
      'Generating differential diagnoses, clinical reasoning, managing diagnostic uncertainty, using decision-support tools.',
    descriptorCriteria:
      'Strong = shows the trainee\'s reasoning toward a diagnosis or how they handled uncertainty (what they weighed, why) — not just that they "made a diagnosis".',
    domainCode: 'D-02',
    domainName: 'Applying clinical knowledge and skill',
  },
  {
    code: 'C-07',
    name: 'Clinical management',
    description:
      'Developing management plans, prescribing, referring, safety-netting, follow-up, shared care, continuity of care.',
    descriptorCriteria:
      'Strong = describes the specific management the trainee chose and the rationale (why this plan, what safety-netting or follow-up) — not just that they "managed the patient".',
    domainCode: 'D-02',
    domainName: 'Applying clinical knowledge and skill',
  },

  // Domain 3: Managing complex and long-term care
  {
    code: 'C-08',
    name: 'Medical complexity',
    description:
      'Managing multimorbidity, polypharmacy, frailty, undifferentiated presentations, chronic disease management.',
    domainCode: 'D-03',
    domainName: 'Managing complex and long-term care',
  },

  // Domain 4: Working well in organisations and systems
  {
    code: 'C-09',
    name: 'Team working',
    descriptorCriteria:
      'Strong = describes how the trainee worked with a colleague or team (what they communicated, handed over, or agreed) and why — not just that a colleague was "involved".',
    description:
      'Working effectively in multidisciplinary teams, delegation, handover, collaborative care, interprofessional communication.',
    domainCode: 'D-04',
    domainName: 'Working well in organisations and systems',
  },
  {
    code: 'C-10',
    name: 'Performance, learning and teaching',
    description:
      'Self-directed learning, teaching others, giving and receiving feedback, reflective practice, CPD.',
    domainCode: 'D-04',
    domainName: 'Working well in organisations and systems',
  },
  {
    code: 'C-11',
    name: 'Organisation, management and leadership',
    description:
      'Practice management, quality improvement, resource management, leadership skills, system navigation.',
    domainCode: 'D-04',
    domainName: 'Working well in organisations and systems',
  },

  // Domain 5: Caring for the whole person, community and environment
  {
    code: 'C-12',
    name: 'Holistic practice, health promotion and safeguarding',
    description:
      'Holistic patient care, health promotion, disease prevention, safeguarding children and adults, public health.',
    domainCode: 'D-05',
    domainName: 'Caring for the whole person, community and environment',
  },
  {
    code: 'C-13',
    name: 'Community health and environmental sustainability',
    description:
      'Population health, health inequalities, social determinants, environmental sustainability in healthcare.',
    domainCode: 'D-05',
    domainName: 'Caring for the whole person, community and environment',
  },
];
