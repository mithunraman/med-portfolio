import { ArtefactTemplate } from '@acme/shared';

// ---------------------------------------------------------------------------
// Template 1: IM_MINIEX (Mini-CEX / Clinical Case Review)
// Used by: CLINICAL_CASE_REVIEW
// ---------------------------------------------------------------------------
export const IM_MINIEX_TEMPLATE: ArtefactTemplate = {
  id: 'IM_MINIEX_TEMPLATE',
  name: 'Clinical Case Review (Mini-CEX)',
  wordCountRange: { min: 200, max: 400 },
  sections: [
    {
      id: 'presentation',
      label: 'Clinical Presentation',
      required: true,
      description:
        'Anonymised patient demographics, setting (acute take/ward/clinic), presenting complaint, relevant medical history and comorbidities.',
      promptHint:
        'Describe the clinical scenario concisely. Include age, gender, setting, presenting complaint, and relevant comorbidities. Keep anonymised.',
      extractionQuestion: 'Can you describe the patient and what they presented with?',
      weight: 0.1,
    },
    {
      id: 'clinical_findings',
      label: 'Clinical Findings & Investigations',
      required: true,
      description:
        'Key findings from history, examination, and investigations. Relevant positive and negative findings that informed the differential diagnosis.',
      promptHint:
        'Summarise key history, examination findings, and investigation results. Highlight findings that narrowed the differential.',
      extractionQuestion: 'What did you find on examination and investigation?',
      weight: 0.15,
    },
    {
      id: 'clinical_reasoning',
      label: 'Clinical Reasoning & Differential Diagnosis',
      required: true,
      description:
        'Differential diagnosis considered, reasoning behind the working diagnosis, management of diagnostic uncertainty, when specialist input was sought.',
      promptHint:
        'Explain your clinical reasoning. Include differentials considered, how you managed uncertainty, and whether you sought specialist input.',
      extractionQuestion:
        'What differentials did you consider, and how did you reach your working diagnosis?',
      weight: 0.2,
    },
    {
      id: 'management',
      label: 'Management & Decision-Making',
      required: true,
      description:
        'Treatment plan, prescribing decisions, referrals, escalation or de-escalation of care, shared decision-making with patient and family.',
      promptHint:
        'Detail the management plan including prescribing rationale, referrals, and how you involved the patient in decisions.',
      extractionQuestion: 'What management plan did you put in place?',
      weight: 0.15,
    },
    {
      id: 'comorbidities',
      label: 'Comorbidity & Complexity Management',
      required: false,
      description:
        'How comorbidities, polypharmacy, frailty, or cognitive impairment were managed alongside the primary presentation.',
      promptHint:
        'If relevant, describe how you managed the interaction between the primary problem and existing comorbidities.',
      extractionQuestion: 'Were there comorbidities or complexities that affected your management?',
      weight: 0.1,
    },
    {
      id: 'reflection',
      label: 'Reflection & Learning',
      required: true,
      description:
        'What went well, what could be improved, what was learned about clinical reasoning, prescribing, or communication. Impact on future practice.',
      promptHint:
        'Reflect on clinical learning and decision-making. Address: What will I maintain, improve, or stop?',
      extractionQuestion: 'What did you learn from this case, and would you do anything differently?',
      weight: 0.25,
    },
    {
      id: 'ethical_legal',
      label: 'Ethical & Legal Considerations',
      required: false,
      description:
        'Consent, capacity, DNACPR decisions, safeguarding, resource allocation, or confidentiality issues if relevant.',
      promptHint: 'Note any ethical, legal, or safeguarding dimensions if applicable.',
      extractionQuestion: null,
      weight: 0.05,
    },
  ],
};

// ---------------------------------------------------------------------------
// Template 2: IM_CBD (Case-Based Discussion)
// Used by: CASE_BASED_DISCUSSION
// ---------------------------------------------------------------------------
export const IM_CBD_TEMPLATE: ArtefactTemplate = {
  id: 'IM_CBD_TEMPLATE',
  name: 'Case-Based Discussion (CbD)',
  wordCountRange: { min: 200, max: 400 },
  sections: [
    {
      id: 'case_summary',
      label: 'Case Summary',
      required: true,
      description:
        'Anonymised summary of the case discussed including presentation, key clinical features, comorbidities, and the clinical question or challenge.',
      promptHint:
        'Summarise the case concisely, focusing on the clinical question that prompted the discussion.',
      extractionQuestion: 'Can you summarise the case you discussed with your supervisor?',
      weight: 0.15,
    },
    {
      id: 'clinical_reasoning',
      label: 'Clinical Reasoning & Evidence Base',
      required: true,
      description:
        'Differential diagnosis, reasoning behind decisions, evidence base consulted (NICE guidelines, BNF, specialty guidelines), management of uncertainty.',
      promptHint:
        'Explain your clinical reasoning including differentials, evidence base, and how you managed uncertainty.',
      extractionQuestion: 'What was your clinical reasoning? What evidence or guidelines did you consult?',
      weight: 0.2,
    },
    {
      id: 'discussion_points',
      label: 'Key Discussion Points',
      required: true,
      description:
        'Main points raised by the supervisor. Alternative approaches considered, feedback received, areas of agreement and disagreement.',
      promptHint:
        'Capture the key points from the supervisor discussion. What alternative approaches were considered?',
      extractionQuestion: 'What were the main points from your discussion with your supervisor?',
      weight: 0.2,
    },
    {
      id: 'complexity',
      label: 'Complexity & Comorbidity',
      required: false,
      description:
        'How comorbidities, polypharmacy, frailty, or social factors added complexity to the clinical decision-making.',
      promptHint:
        'If relevant, describe how complexity factors influenced the discussion and decisions.',
      extractionQuestion: 'Were there any comorbidities or complexities that made this case challenging?',
      weight: 0.1,
    },
    {
      id: 'reflection',
      label: 'Reflection & Learning',
      required: true,
      description:
        'What was learned from the discussion and how it changes approach to similar cases.',
      promptHint:
        'Reflect on what you learned and how it will influence your practice.',
      extractionQuestion: 'What did you take away from this discussion?',
      weight: 0.25,
    },
    {
      id: 'action_plan',
      label: 'Action Plan',
      required: false,
      description: 'Specific follow-up actions — further reading, guideline review, or changes to management.',
      promptHint: 'Note any specific actions you committed to following the discussion.',
      extractionQuestion: null,
      weight: 0.1,
    },
  ],
};

// ---------------------------------------------------------------------------
// Template 3: IM_ACAT (Acute Care Assessment Tool)
// Used by: ACUTE_CARE_ASSESSMENT
// ---------------------------------------------------------------------------
export const IM_ACAT_TEMPLATE: ArtefactTemplate = {
  id: 'IM_ACAT_TEMPLATE',
  name: 'Acute Care Assessment (ACAT)',
  wordCountRange: { min: 250, max: 450 },
  sections: [
    {
      id: 'clinical_context',
      label: 'Clinical Context',
      required: true,
      description:
        'Setting (acute take, on-call, specialty take), time of day, volume of patients, staffing. The overall context of the acute episode.',
      promptHint:
        'Describe the acute setting — were you on take, on-call, or responding to a deterioration? What was the context?',
      extractionQuestion: 'What was the acute situation you were managing?',
      weight: 0.1,
    },
    {
      id: 'assessment_management',
      label: 'Assessment & Management',
      required: true,
      description:
        'How patients were assessed, prioritised, and managed. Key clinical decisions, investigations ordered, treatments initiated, referrals made.',
      promptHint:
        'Describe your assessment and management approach. How did you prioritise? What key decisions did you make?',
      extractionQuestion: 'How did you assess and manage the patients? What decisions did you make?',
      weight: 0.2,
    },
    {
      id: 'escalation',
      label: 'Escalation & Handover',
      required: true,
      description:
        'Decisions about escalation (to HDU/ICU), de-escalation, ceiling of care, DNACPR. Quality of handover to incoming team.',
      promptHint:
        'Describe any escalation or handover decisions. How did you communicate with the incoming team?',
      extractionQuestion: 'Did you need to escalate any patients or hand over? How did that go?',
      weight: 0.15,
    },
    {
      id: 'team_leadership',
      label: 'Team Working & Leadership',
      required: true,
      description:
        'How you worked with the MDT, delegated tasks, coordinated care, resolved conflicts, and led the team during the acute episode.',
      promptHint:
        'Describe your role in the team. How did you coordinate care and lead during the episode?',
      extractionQuestion: 'How did you work with the team? Did you delegate or coordinate care?',
      weight: 0.15,
    },
    {
      id: 'reflection',
      label: 'Reflection & Learning',
      required: true,
      description:
        'What went well, what could be improved, key learning about acute management, prioritisation, or team leadership.',
      promptHint:
        'Reflect on the acute episode. What worked well? What would you do differently?',
      extractionQuestion: 'What did you learn from this experience?',
      weight: 0.25,
    },
    {
      id: 'patient_safety',
      label: 'Patient Safety Considerations',
      required: false,
      description:
        'Any patient safety issues encountered — staffing concerns, system failures, near-misses, or good catches.',
      promptHint: 'Note any patient safety issues or near-misses if applicable.',
      extractionQuestion: null,
      weight: 0.15,
    },
  ],
};

// ---------------------------------------------------------------------------
// Template 4: IM_SEA (Significant Event Analysis)
// Used by: SIGNIFICANT_EVENT
// ---------------------------------------------------------------------------
export const IM_SEA_TEMPLATE: ArtefactTemplate = {
  id: 'IM_SEA_TEMPLATE',
  name: 'Significant Event Analysis',
  wordCountRange: { min: 300, max: 500 },
  sections: [
    {
      id: 'event_description',
      label: 'What Happened',
      required: true,
      description:
        'Factual, chronological account of the event. Setting, people involved, what occurred.',
      promptHint: 'Describe the event objectively and chronologically. Keep anonymised.',
      extractionQuestion: 'Can you walk me through exactly what happened?',
      weight: 0.15,
    },
    {
      id: 'what_went_well',
      label: 'What Went Well',
      required: true,
      description: 'Aspects handled correctly — appropriate escalation, good communication, timely intervention.',
      promptHint: 'Identify positive aspects — what was done correctly.',
      extractionQuestion: 'Was there anything that was handled well?',
      weight: 0.1,
    },
    {
      id: 'what_could_improve',
      label: 'What Could Have Been Done Differently',
      required: true,
      description: 'Honest assessment of where things could have been better.',
      promptHint: 'Describe specific actions or decisions that could have been different.',
      extractionQuestion: 'Looking back, is there anything you or the team could have done differently?',
      weight: 0.15,
    },
    {
      id: 'root_cause',
      label: 'Why It Happened',
      required: true,
      description:
        'Root cause analysis — system factors, staffing, communication, handover quality, workload.',
      promptHint: 'Analyse contributing factors. Consider system issues and human factors. Avoid individual blame.',
      extractionQuestion: 'What contributed to this happening? Were there system or team factors?',
      weight: 0.2,
    },
    {
      id: 'changes_made',
      label: 'Changes Made',
      required: true,
      description: 'Concrete actions taken or proposed — protocol changes, team briefings, system improvements.',
      promptHint: 'Detail specific changes implemented or planned.',
      extractionQuestion: 'What has been done or changed as a result?',
      weight: 0.2,
    },
    {
      id: 'personal_learning',
      label: 'Personal Learning',
      required: true,
      description: 'What was personally learned and how it shapes future practice.',
      promptHint: 'Connect to personal professional development. What will you maintain, improve, or stop?',
      extractionQuestion: 'What did you personally take away from this experience?',
      weight: 0.2,
    },
  ],
};

// ---------------------------------------------------------------------------
// Template 5: IM_REFLECTION (Reflective Practice)
// Used by: REFLECTIVE_PRACTICE
// ---------------------------------------------------------------------------
export const IM_REFLECTION_TEMPLATE: ArtefactTemplate = {
  id: 'IM_REFLECTION_TEMPLATE',
  name: 'Reflective Practice Entry',
  wordCountRange: { min: 200, max: 400 },
  sections: [
    {
      id: 'experience',
      label: 'The Experience',
      required: true,
      description: 'Description of the clinical or professional experience that prompted reflection.',
      promptHint: 'Describe the experience that prompted this reflection. Include setting and context.',
      extractionQuestion: 'What experience are you reflecting on?',
      weight: 0.15,
    },
    {
      id: 'analysis',
      label: 'Analysis',
      required: true,
      description:
        'Why the experience was significant. What clinical, ethical, or professional factors were at play. Link to evidence or guidelines.',
      promptHint: 'Analyse why this was significant. Consider clinical reasoning, ethics, and evidence base.',
      extractionQuestion: 'Why did this experience feel significant? What factors were at play?',
      weight: 0.25,
    },
    {
      id: 'learning',
      label: 'Learning & Insight',
      required: true,
      description: 'What was learned about clinical practice, communication, leadership, or self.',
      promptHint: 'Describe what you learned. What new insight did you gain?',
      extractionQuestion: 'What did you learn from this experience?',
      weight: 0.25,
    },
    {
      id: 'action',
      label: 'Impact on Practice',
      required: true,
      description: 'How this changes future practice. Specific actions planned.',
      promptHint: 'Describe how this will change your approach going forward. Be specific.',
      extractionQuestion: 'How will this change your practice?',
      weight: 0.2,
    },
    {
      id: 'evidence',
      label: 'Evidence & Guidelines',
      required: false,
      description: 'Relevant evidence, NICE guidelines, or literature consulted.',
      promptHint: 'Reference any guidelines or evidence you consulted.',
      extractionQuestion: 'Did you consult any guidelines or evidence?',
      weight: 0.15,
    },
  ],
};

// ---------------------------------------------------------------------------
// Template 6: IM_DOPS (Procedural Skills)
// Used by: PROCEDURAL_SKILLS
// ---------------------------------------------------------------------------
export const IM_DOPS_TEMPLATE: ArtefactTemplate = {
  id: 'IM_DOPS_TEMPLATE',
  name: 'Procedural Skills (DOPS)',
  wordCountRange: { min: 150, max: 300 },
  sections: [
    {
      id: 'procedure_context',
      label: 'Procedure & Context',
      required: true,
      description: 'Which procedure, clinical indication, patient context, setting, supervision level.',
      promptHint: 'Describe the procedure, why it was indicated, and the level of supervision.',
      extractionQuestion: 'What procedure did you perform, and what was the clinical indication?',
      weight: 0.15,
    },
    {
      id: 'consent_preparation',
      label: 'Consent & Preparation',
      required: true,
      description: 'Consent process, aseptic technique, analgesia/local anaesthesia, equipment preparation.',
      promptHint: 'Describe how you obtained consent and prepared for the procedure.',
      extractionQuestion: 'How did you obtain consent and prepare?',
      weight: 0.15,
    },
    {
      id: 'technique',
      label: 'Technique & Execution',
      required: true,
      description: 'How the procedure was performed. Any difficulties encountered, adaptations made.',
      promptHint: 'Describe the technique used and any challenges encountered.',
      extractionQuestion: 'How did the procedure go? Were there any difficulties?',
      weight: 0.2,
    },
    {
      id: 'complications',
      label: 'Complications & Management',
      required: false,
      description: 'Any complications encountered and how they were managed.',
      promptHint: 'Note any complications and how you responded.',
      extractionQuestion: 'Were there any complications?',
      weight: 0.15,
    },
    {
      id: 'reflection',
      label: 'Reflection & Learning',
      required: true,
      description: 'What was learned about the procedure, technique, or management of complications.',
      promptHint: 'Reflect on the procedure. What would you maintain, improve, or do differently?',
      extractionQuestion: 'What did you learn from performing this procedure?',
      weight: 0.25,
    },
    {
      id: 'supervision_level',
      label: 'Supervision Assessment',
      required: false,
      description: 'Self-assessment of supervision level needed — observed only, direct, indirect, or independent.',
      promptHint: 'Assess what level of supervision you currently need for this procedure.',
      extractionQuestion: null,
      weight: 0.1,
    },
  ],
};

// ---------------------------------------------------------------------------
// Template 7: IM_OPCAT (Outpatient Care Assessment)
// Used by: OUTPATIENT_ASSESSMENT
// ---------------------------------------------------------------------------
export const IM_OPCAT_TEMPLATE: ArtefactTemplate = {
  id: 'IM_OPCAT_TEMPLATE',
  name: 'Outpatient Care Assessment (OPCAT)',
  wordCountRange: { min: 200, max: 350 },
  sections: [
    {
      id: 'clinic_context',
      label: 'Clinic & Patient Context',
      required: true,
      description: 'Type of clinic (specialty, general medicine, virtual), patient seen, presenting issue.',
      promptHint: 'Describe the clinic setting and the patient you are reflecting on.',
      extractionQuestion: 'What clinic were you in, and what patient did you see?',
      weight: 0.15,
    },
    {
      id: 'assessment_management',
      label: 'Assessment & Management',
      required: true,
      description: 'Clinical assessment, investigation plan, management decisions, shared decision-making with patient.',
      promptHint: 'Describe your assessment and management plan, including how you involved the patient.',
      extractionQuestion: 'How did you assess and manage this patient?',
      weight: 0.25,
    },
    {
      id: 'communication',
      label: 'Communication & Clinic Letter',
      required: true,
      description: 'How findings and plans were communicated to the patient and referring GP. Quality of clinic letter.',
      promptHint: 'Describe how you communicated with the patient and the referrer.',
      extractionQuestion: 'How did you communicate the plan to the patient and GP?',
      weight: 0.2,
    },
    {
      id: 'reflection',
      label: 'Reflection & Learning',
      required: true,
      description: 'What was learned about outpatient management, long-term conditions, or consultation skills.',
      promptHint: 'Reflect on your outpatient skills. What would you do differently?',
      extractionQuestion: 'What did you learn from this outpatient encounter?',
      weight: 0.25,
    },
    {
      id: 'follow_up',
      label: 'Follow-Up Plan',
      required: false,
      description: 'Arrangements for follow-up, safety-netting, or discharge back to GP.',
      promptHint: 'Note the follow-up arrangements.',
      extractionQuestion: null,
      weight: 0.15,
    },
  ],
};

// ---------------------------------------------------------------------------
// Template 8: IM_TEACHING (Teaching & Supervision)
// Used by: TEACHING_ACTIVITY
// ---------------------------------------------------------------------------
export const IM_TEACHING_TEMPLATE: ArtefactTemplate = {
  id: 'IM_TEACHING_TEMPLATE',
  name: 'Teaching & Supervision Activity',
  wordCountRange: { min: 150, max: 300 },
  sections: [
    {
      id: 'activity_description',
      label: 'Activity Description',
      required: true,
      description: 'What was taught, to whom, in what setting and format.',
      promptHint: 'Describe the teaching activity, audience, and format.',
      extractionQuestion: 'What did you teach, and to whom?',
      weight: 0.15,
    },
    {
      id: 'preparation',
      label: 'Preparation & Planning',
      required: true,
      description: 'How the session was planned. Learning objectives and methods chosen.',
      promptHint: 'Describe your preparation including learning objectives.',
      extractionQuestion: 'How did you prepare for the session?',
      weight: 0.15,
    },
    {
      id: 'delivery',
      label: 'Delivery & Engagement',
      required: true,
      description: 'How the session went. Learner engagement, questions, challenges.',
      promptHint: 'Describe how the session went in practice.',
      extractionQuestion: 'How did the session go? How did learners respond?',
      weight: 0.2,
    },
    {
      id: 'feedback',
      label: 'Feedback Received',
      required: false,
      description: 'Feedback from learners or observers.',
      promptHint: 'Note any feedback received on your teaching.',
      extractionQuestion: 'Did you receive any feedback?',
      weight: 0.15,
    },
    {
      id: 'reflection',
      label: 'Reflection & Development',
      required: true,
      description: 'What was learned about teaching. What would be done differently.',
      promptHint: 'Reflect on your development as an educator.',
      extractionQuestion: 'What did you learn about teaching from this experience?',
      weight: 0.25,
    },
    {
      id: 'impact',
      label: 'Impact on Learners',
      required: false,
      description: 'Evidence of impact on learners.',
      promptHint: 'If known, describe any impact your teaching had.',
      extractionQuestion: null,
      weight: 0.1,
    },
  ],
};

// ---------------------------------------------------------------------------
// Template 9: IM_QIP (Quality Improvement Project)
// Used by: QI_PROJECT
// ---------------------------------------------------------------------------
export const IM_QIP_TEMPLATE: ArtefactTemplate = {
  id: 'IM_QIP_TEMPLATE',
  name: 'Quality Improvement Project (QIPAT)',
  wordCountRange: { min: 500, max: 800 },
  sections: [
    {
      id: 'rationale',
      label: 'Rationale & Problem Statement',
      required: true,
      description: 'Why this topic was chosen. Evidence base and relevant guidelines.',
      promptHint: 'Describe the problem and why it matters. Reference relevant guidelines.',
      extractionQuestion: 'What problem did you identify, and why did it matter?',
      weight: 0.15,
    },
    {
      id: 'aims',
      label: 'Aims & Objectives',
      required: true,
      description: 'SMART aims. What improvement was targeted and how measured.',
      promptHint: 'State the project aims using SMART criteria.',
      extractionQuestion: 'What were you trying to achieve?',
      weight: 0.1,
    },
    {
      id: 'methodology',
      label: 'Methodology',
      required: true,
      description: 'Data collection, PDSA cycles, stakeholder engagement.',
      promptHint: 'Describe your methodology including data collection and PDSA cycles.',
      extractionQuestion: 'How did you go about the project?',
      weight: 0.15,
    },
    {
      id: 'results',
      label: 'Results & Data',
      required: true,
      description: 'What the data showed. Quantitative and qualitative findings.',
      promptHint: 'Present results clearly with key data points.',
      extractionQuestion: 'What did your data show?',
      weight: 0.15,
    },
    {
      id: 'changes',
      label: 'Changes Implemented',
      required: true,
      description: 'What changes were made and how embedded in practice.',
      promptHint: 'Describe specific changes made.',
      extractionQuestion: 'What changes were made as a result?',
      weight: 0.1,
    },
    {
      id: 'sustainability',
      label: 'Sustainability',
      required: true,
      description: 'How changes will be maintained.',
      promptHint: 'Describe how improvements will be sustained.',
      extractionQuestion: 'How will these changes be maintained?',
      weight: 0.05,
    },
    {
      id: 'reflection',
      label: 'Reflection & Learning',
      required: true,
      description: 'What was learned about QI methodology and leading improvement.',
      promptHint: 'Reflect on the QI process — what worked, what would you change.',
      extractionQuestion: 'What did you learn from leading this project?',
      weight: 0.2,
    },
    {
      id: 'dissemination',
      label: 'Dissemination',
      required: false,
      description: 'How findings were shared — poster, presentation, publication.',
      promptHint: 'Note how you disseminated your findings.',
      extractionQuestion: null,
      weight: 0.1,
    },
  ],
};

// ---------------------------------------------------------------------------
// Template 10: IM_FEEDBACK (Reflection on Feedback)
// Used by: FEEDBACK_REFLECTION
// ---------------------------------------------------------------------------
export const IM_FEEDBACK_TEMPLATE: ArtefactTemplate = {
  id: 'IM_FEEDBACK_TEMPLATE',
  name: 'Reflection on Feedback',
  wordCountRange: { min: 200, max: 400 },
  sections: [
    {
      id: 'feedback_source',
      label: 'Feedback Source',
      required: true,
      description: 'Type of feedback (MSF, PS, MCR, MRCP results, supervisor) and when received.',
      promptHint: 'Identify the feedback source and context.',
      extractionQuestion: 'What feedback did you receive, and from what source?',
      weight: 0.1,
    },
    {
      id: 'feedback_summary',
      label: 'Key Findings',
      required: true,
      description: 'Summary of main themes. Both strengths and areas for development.',
      promptHint: 'Summarise key themes honestly.',
      extractionQuestion: 'What were the main points or themes from the feedback?',
      weight: 0.2,
    },
    {
      id: 'emotional_response',
      label: 'Initial Response',
      required: false,
      description: 'How the trainee felt receiving the feedback.',
      promptHint: 'Reflect honestly on your initial reaction.',
      extractionQuestion: 'How did you feel when you first received this feedback?',
      weight: 0.1,
    },
    {
      id: 'analysis',
      label: 'Analysis & Interpretation',
      required: true,
      description: 'What the feedback means for development. Agreement and disagreement.',
      promptHint: 'Analyse what the feedback tells you about your practice.',
      extractionQuestion: 'Do you agree with the feedback? What does it tell you?',
      weight: 0.25,
    },
    {
      id: 'action_plan',
      label: 'Actions Taken or Planned',
      required: true,
      description: 'Specific steps taken or planned in response.',
      promptHint: 'Detail specific actions. Be concrete and time-bound.',
      extractionQuestion: 'What have you done or plan to do in response?',
      weight: 0.25,
    },
    {
      id: 'follow_up',
      label: 'Impact & Follow-up',
      required: false,
      description: 'Evidence of actions taken and their effect.',
      promptHint: 'If applicable, describe the impact of changes.',
      extractionQuestion: 'Have you noticed any changes since acting on this feedback?',
      weight: 0.1,
    },
  ],
};

// ---------------------------------------------------------------------------
// All templates and mapping
// ---------------------------------------------------------------------------
export const IM_TEMPLATES: Record<string, ArtefactTemplate> = {
  IM_MINIEX_TEMPLATE,
  IM_CBD_TEMPLATE,
  IM_ACAT_TEMPLATE,
  IM_SEA_TEMPLATE,
  IM_REFLECTION_TEMPLATE,
  IM_DOPS_TEMPLATE,
  IM_OPCAT_TEMPLATE,
  IM_TEACHING_TEMPLATE,
  IM_QIP_TEMPLATE,
  IM_FEEDBACK_TEMPLATE,
};

export const IM_ENTRY_TYPE_TO_TEMPLATE: Record<string, string> = {
  CLINICAL_CASE_REVIEW: 'IM_MINIEX_TEMPLATE',
  CASE_BASED_DISCUSSION: 'IM_CBD_TEMPLATE',
  ACUTE_CARE_ASSESSMENT: 'IM_ACAT_TEMPLATE',
  SIGNIFICANT_EVENT: 'IM_SEA_TEMPLATE',
  REFLECTIVE_PRACTICE: 'IM_REFLECTION_TEMPLATE',
  PROCEDURAL_SKILLS: 'IM_DOPS_TEMPLATE',
  OUTPATIENT_ASSESSMENT: 'IM_OPCAT_TEMPLATE',
  TEACHING_ACTIVITY: 'IM_TEACHING_TEMPLATE',
  QI_PROJECT: 'IM_QIP_TEMPLATE',
  FEEDBACK_REFLECTION: 'IM_FEEDBACK_TEMPLATE',
};
