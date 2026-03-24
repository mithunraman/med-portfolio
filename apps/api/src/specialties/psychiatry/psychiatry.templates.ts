import { ArtefactTemplate } from '@acme/shared';

// ---------------------------------------------------------------------------
// Template 1: PSY_ACE (Assessment of Clinical Expertise / Clinical Case Review)
// Used by: CLINICAL_CASE_REVIEW
// ---------------------------------------------------------------------------
export const PSY_ACE_TEMPLATE: ArtefactTemplate = {
  id: 'PSY_ACE_TEMPLATE',
  name: 'Clinical Case Review (ACE)',
  wordCountRange: { min: 200, max: 400 },
  sections: [
    {
      id: 'presentation',
      label: 'Clinical Presentation',
      required: true,
      description:
        'Anonymised patient demographics, setting (inpatient/community/crisis/liaison), reason for referral or presentation, relevant psychiatric and medical history.',
      promptHint:
        'Describe the clinical scenario concisely. Include age, gender, setting, referral pathway, and presenting complaint. Keep anonymised.',
      extractionQuestion: 'Can you describe the patient and the context of the assessment?',
      weight: 0.1,
    },
    {
      id: 'psychiatric_assessment',
      label: 'Psychiatric Assessment & MSE',
      required: true,
      description:
        'Key findings from psychiatric history taking and Mental State Examination. Relevant positive and negative findings, capacity assessment if applicable.',
      promptHint:
        'Summarise the key psychiatric history findings and MSE. Highlight relevant positive and negative features. Note capacity assessment if applicable.',
      extractionQuestion:
        'What were the key findings from your psychiatric assessment and mental state examination?',
      weight: 0.15,
    },
    {
      id: 'formulation',
      label: 'Formulation',
      required: true,
      description:
        'Psycho-bio-social formulation using an appropriate framework. Predisposing, precipitating, perpetuating, and protective factors. Differential diagnosis.',
      promptHint:
        'Present a structured formulation covering biological, psychological, and social factors. Include predisposing, precipitating, perpetuating, and protective factors.',
      extractionQuestion:
        'How would you formulate this case? What were the key biological, psychological, and social factors?',
      weight: 0.2,
    },
    {
      id: 'risk_assessment',
      label: 'Risk Assessment',
      required: true,
      description:
        'Assessment of risk to self (self-harm, suicide), risk to others, risk from others (vulnerability, exploitation), and any safeguarding concerns. Safety plan if applicable.',
      promptHint:
        'Describe the risk assessment including risk to self, risk to others, and vulnerability. Note any safety plan put in place.',
      extractionQuestion:
        'What was your risk assessment? Were there any safety concerns and how did you address them?',
      weight: 0.15,
    },
    {
      id: 'management',
      label: 'Management Plan',
      required: true,
      description:
        'Treatment plan including pharmacological and non-pharmacological interventions, referrals, legal considerations (MHA if applicable), and follow-up arrangements.',
      promptHint:
        'Detail the management plan including medication decisions, psychological interventions, legal framework, and follow-up.',
      extractionQuestion: 'What management plan did you put in place?',
      weight: 0.15,
    },
    {
      id: 'reflection',
      label: 'Reflection & Learning',
      required: true,
      description:
        'What went well, what could be improved, what was learned, emotional impact on the trainee, and how this changes future practice.',
      promptHint:
        'Reflect on clinical learning and personal impact. Address: What will I maintain, improve, or stop? Consider the emotional impact of the case.',
      extractionQuestion:
        'What did you learn from this case, and how did it affect you personally?',
      weight: 0.2,
    },
    {
      id: 'ethical_legal',
      label: 'Ethical & Legal Considerations',
      required: false,
      description:
        'Consent, capacity, MHA powers, confidentiality, safeguarding, human rights balancing if relevant.',
      promptHint:
        'Note any ethical, legal, or safeguarding dimensions. Include MHA considerations if applicable.',
      extractionQuestion: null,
      weight: 0.05,
    },
  ],
};

// ---------------------------------------------------------------------------
// Template 2: PSY_CBD (Case-Based Discussion)
// Used by: CASE_BASED_DISCUSSION
// ---------------------------------------------------------------------------
export const PSY_CBD_TEMPLATE: ArtefactTemplate = {
  id: 'PSY_CBD_TEMPLATE',
  name: 'Case-Based Discussion (CbD)',
  wordCountRange: { min: 200, max: 400 },
  sections: [
    {
      id: 'case_summary',
      label: 'Case Summary',
      required: true,
      description:
        'Anonymised summary of the case discussed including presentation, key psychiatric features, and the clinical question or challenge.',
      promptHint:
        'Summarise the case concisely, focusing on the clinical question that prompted the discussion.',
      extractionQuestion: 'Can you summarise the case you discussed with your supervisor?',
      weight: 0.15,
    },
    {
      id: 'clinical_reasoning',
      label: 'Clinical Reasoning',
      required: true,
      description:
        'Differential diagnosis, formulation, and the reasoning behind clinical decisions. Evidence base for the approach taken.',
      promptHint:
        'Explain your clinical reasoning including differentials considered and evidence base for decisions.',
      extractionQuestion: 'What was your clinical reasoning? What differentials did you consider?',
      weight: 0.2,
    },
    {
      id: 'risk_management',
      label: 'Risk Management',
      required: true,
      description:
        'How risk was assessed and managed. Any use of mental health legislation. Balancing therapeutic risk with safety.',
      promptHint:
        'Describe how risk was assessed and managed, including any legal framework applied.',
      extractionQuestion: 'How did you approach risk management in this case?',
      weight: 0.15,
    },
    {
      id: 'discussion_points',
      label: 'Key Discussion Points',
      required: true,
      description:
        'Main points raised during the discussion with the supervisor. Alternative approaches considered, feedback received, areas of agreement and disagreement.',
      promptHint:
        'Capture the key points from the supervisor discussion. What alternative approaches were considered?',
      extractionQuestion:
        'What were the main points that came up in the discussion with your supervisor?',
      weight: 0.2,
    },
    {
      id: 'reflection',
      label: 'Reflection & Learning',
      required: true,
      description:
        'What was learned from the discussion. How it changed the approach to the case or future practice.',
      promptHint:
        'Reflect on what you learned from the discussion and how it will influence your practice.',
      extractionQuestion: 'What did you take away from this discussion?',
      weight: 0.2,
    },
    {
      id: 'action_plan',
      label: 'Action Plan',
      required: false,
      description:
        'Specific follow-up actions arising from the discussion — further reading, guideline review, or changes to management.',
      promptHint: 'Note any specific actions you committed to following the discussion.',
      extractionQuestion: null,
      weight: 0.1,
    },
  ],
};

// ---------------------------------------------------------------------------
// Template 3: PSY_SEA (Significant Event Analysis)
// Used by: SIGNIFICANT_EVENT
// ---------------------------------------------------------------------------
export const PSY_SEA_TEMPLATE: ArtefactTemplate = {
  id: 'PSY_SEA_TEMPLATE',
  name: 'Significant Event Analysis',
  wordCountRange: { min: 300, max: 500 },
  sections: [
    {
      id: 'event_description',
      label: 'What Happened',
      required: true,
      description:
        'Factual, chronological, anonymised account of the event. Context within the psychiatric setting (ward, community, crisis team).',
      promptHint:
        'Describe the event objectively and chronologically. Include the psychiatric setting and people involved. Keep anonymised.',
      extractionQuestion: 'Can you walk me through exactly what happened?',
      weight: 0.15,
    },
    {
      id: 'what_went_well',
      label: 'What Went Well',
      required: true,
      description:
        'Aspects handled correctly — appropriate escalation, use of legal powers, team communication, de-escalation.',
      promptHint: 'Identify positive aspects — what was done correctly, what worked.',
      extractionQuestion: 'Was there anything that was handled well during this event?',
      weight: 0.1,
    },
    {
      id: 'what_could_improve',
      label: 'What Could Have Been Done Differently',
      required: true,
      description:
        'Honest assessment of where things could have been better. Communication, risk assessment, observation levels, team coordination.',
      promptHint:
        'Describe specific actions or decisions that could have been different. Be honest but balanced.',
      extractionQuestion:
        'Looking back, is there anything you or the team could have done differently?',
      weight: 0.15,
    },
    {
      id: 'root_cause',
      label: 'Why It Happened',
      required: true,
      description:
        'Root cause analysis — system factors, staffing, communication breakdown, observation policy, handover quality, environmental factors.',
      promptHint:
        'Analyse the contributing factors. Consider system issues, staffing, communication, and environmental factors. Avoid individual blame.',
      extractionQuestion:
        'What do you think contributed to this happening? Were there any system or team factors?',
      weight: 0.2,
    },
    {
      id: 'emotional_impact',
      label: 'Emotional Impact',
      required: true,
      description:
        'Impact on the trainee, the team, other patients, and families. How the emotional response was managed, including use of supervision and debrief.',
      promptHint:
        'Describe the emotional impact honestly — on yourself, the team, and others. How did you process this? Did you access support?',
      extractionQuestion:
        'How did this event affect you personally? How did you and the team cope?',
      weight: 0.15,
    },
    {
      id: 'changes_made',
      label: 'Changes Made',
      required: true,
      description:
        'Concrete actions taken or proposed — policy changes, protocol review, team debriefing, supervision changes, environmental modifications.',
      promptHint:
        'Detail specific changes implemented or planned. Include who is responsible and timelines.',
      extractionQuestion: 'What has been done or changed as a result of this event?',
      weight: 0.15,
    },
    {
      id: 'personal_learning',
      label: 'Personal Learning',
      required: true,
      description:
        'What the trainee personally learned. How it shapes future practice and professional development. Link to wellbeing and resilience.',
      promptHint:
        'Connect to personal professional development and wellbeing. Address: What will I maintain, improve, or stop?',
      extractionQuestion: 'What did you personally take away from this experience?',
      weight: 0.1,
    },
  ],
};

// ---------------------------------------------------------------------------
// Template 4: PSY_REFLECTION (Reflective Practice Entry)
// Used by: REFLECTIVE_PRACTICE
// ---------------------------------------------------------------------------
export const PSY_REFLECTION_TEMPLATE: ArtefactTemplate = {
  id: 'PSY_REFLECTION_TEMPLATE',
  name: 'Reflective Practice Entry',
  wordCountRange: { min: 200, max: 400 },
  sections: [
    {
      id: 'experience',
      label: 'The Experience',
      required: true,
      description:
        'Description of the clinical or professional experience that prompted reflection. Setting, people involved, what happened.',
      promptHint:
        'Describe the experience that prompted this reflection. Include setting and context.',
      extractionQuestion: 'What experience are you reflecting on?',
      weight: 0.15,
    },
    {
      id: 'thoughts_feelings',
      label: 'Thoughts & Feelings',
      required: true,
      description:
        'What the trainee thought and felt during and after the experience. Self-awareness of emotional response, countertransference, and personal reactions.',
      promptHint:
        'Explore your thoughts and feelings honestly. Consider countertransference and what this experience stirred in you.',
      extractionQuestion: 'What were you thinking and feeling during and after this experience?',
      weight: 0.2,
    },
    {
      id: 'analysis',
      label: 'Analysis',
      required: true,
      description:
        'Deeper analysis of why the experience was significant. What influenced the situation, what unconscious dynamics may have been at play, what the literature or theory says.',
      promptHint:
        'Analyse the experience at a deeper level. Consider unconscious dynamics, theoretical frameworks, and wider influences.',
      extractionQuestion:
        'Why do you think this experience felt significant? What deeper factors might have been at play?',
      weight: 0.25,
    },
    {
      id: 'learning',
      label: 'Learning & Insight',
      required: true,
      description:
        'What was learned about the self, the patient, the therapeutic relationship, or the system. New understanding gained.',
      promptHint:
        'Describe what you learned about yourself, the patient, or the system. What new insight did you gain?',
      extractionQuestion: 'What did you learn from this experience?',
      weight: 0.2,
    },
    {
      id: 'action',
      label: 'Impact on Practice',
      required: true,
      description:
        'How this reflection changes future practice. Specific actions planned or approaches adjusted.',
      promptHint:
        'Describe how this experience will change your approach going forward. Be specific.',
      extractionQuestion: 'How will this change your practice going forward?',
      weight: 0.15,
    },
    {
      id: 'supervision',
      label: 'Supervision Discussion',
      required: false,
      description:
        'Whether and how this was discussed in clinical or educational supervision, or Balint group.',
      promptHint:
        'If applicable, note whether this was discussed in supervision or Balint group and what emerged.',
      extractionQuestion: 'Did you discuss this in supervision or a Balint group?',
      weight: 0.05,
    },
  ],
};

// ---------------------------------------------------------------------------
// Template 5: PSY_SAPE (Psychotherapy Case Reflection)
// Used by: PSYCHOTHERAPY_CASE
// ---------------------------------------------------------------------------
export const PSY_SAPE_TEMPLATE: ArtefactTemplate = {
  id: 'PSY_SAPE_TEMPLATE',
  name: 'Psychotherapy Case Reflection (SAPE)',
  wordCountRange: { min: 300, max: 500 },
  sections: [
    {
      id: 'case_overview',
      label: 'Case Overview & Modality',
      required: true,
      description:
        'Anonymised patient summary, therapeutic modality used (CBT, psychodynamic, CAT, DBT, systemic, etc.), treatment setting, session frequency and duration, supervision arrangements.',
      promptHint:
        'Describe the patient (anonymised), the modality used, and the therapy setting. Include session frequency and supervision structure.',
      extractionQuestion: 'Can you describe the patient and the therapeutic modality you used?',
      weight: 0.1,
    },
    {
      id: 'formulation',
      label: 'Psychotherapeutic Formulation',
      required: true,
      description:
        'Formulation using the relevant therapeutic model. Core beliefs, maintaining cycles, relational patterns, systemic factors, or attachment dynamics depending on modality.',
      promptHint:
        'Present the therapeutic formulation using the framework of your chosen modality.',
      extractionQuestion: 'How did you formulate this case within your therapeutic model?',
      weight: 0.2,
    },
    {
      id: 'therapeutic_process',
      label: 'Therapeutic Process',
      required: true,
      description:
        'Key developments in the therapy. Therapeutic alliance, interventions used, patient engagement, turning points, setbacks, endings.',
      promptHint:
        'Describe the arc of the therapy — key interventions, turning points, and how the alliance developed.',
      extractionQuestion:
        'Can you describe the key developments in the therapy? Any turning points or setbacks?',
      weight: 0.2,
    },
    {
      id: 'transference',
      label: 'Transference & Countertransference',
      required: true,
      description:
        'Reflections on the relational dynamics between therapist and patient. Transference patterns, countertransference reactions, how these were understood and used therapeutically.',
      promptHint:
        'Explore the transference and countertransference dynamics. How did you notice and use these therapeutically?',
      extractionQuestion:
        'Were you aware of any transference or countertransference dynamics? How did you manage them?',
      weight: 0.2,
    },
    {
      id: 'outcome',
      label: 'Outcome & Evaluation',
      required: true,
      description:
        'Progress made, outcome measures if used, patient perspective, areas of ongoing difficulty.',
      promptHint:
        'Describe the outcome of the therapy. Include any outcome measures and the patient perspective.',
      extractionQuestion: 'What was the outcome? Did the patient improve?',
      weight: 0.1,
    },
    {
      id: 'reflection',
      label: 'Reflection & Development',
      required: true,
      description:
        'What was learned about the modality, the therapeutic process, and the self as a therapist. Links to psychotherapy supervision.',
      promptHint:
        'Reflect on your development as a therapist. What did you learn about the modality and yourself?',
      extractionQuestion: 'What did you learn about yourself as a therapist through this case?',
      weight: 0.15,
    },
    {
      id: 'supervision_link',
      label: 'Supervision & Governance',
      required: false,
      description:
        'How supervision supported the therapy. Key themes from psychotherapy supervision. Medical Psychotherapy Tutor involvement.',
      promptHint:
        'Note how supervision supported your therapeutic work and any key themes that emerged.',
      extractionQuestion: null,
      weight: 0.05,
    },
  ],
};

// ---------------------------------------------------------------------------
// Template 6: PSY_DONCS (Direct Observation of Non-Clinical Skills)
// Used by: DONCS
// ---------------------------------------------------------------------------
export const PSY_DONCS_TEMPLATE: ArtefactTemplate = {
  id: 'PSY_DONCS_TEMPLATE',
  name: 'Direct Observation of Non-Clinical Skills (DONCS)',
  wordCountRange: { min: 150, max: 300 },
  sections: [
    {
      id: 'activity_description',
      label: 'Activity Observed',
      required: true,
      description:
        'What non-clinical activity was observed — MDT meeting, family meeting, CPA review, tribunal, teaching session, inter-agency liaison.',
      promptHint: 'Describe the activity, setting, and your role within it.',
      extractionQuestion: 'What activity was observed, and what was your role?',
      weight: 0.15,
    },
    {
      id: 'skills_demonstrated',
      label: 'Skills Demonstrated',
      required: true,
      description:
        'Specific non-clinical skills demonstrated — communication, leadership, teamwork, negotiation, conflict resolution, teaching, chairing.',
      promptHint: 'Identify which non-clinical skills you demonstrated and give specific examples.',
      extractionQuestion: 'What skills did you demonstrate during this activity?',
      weight: 0.2,
    },
    {
      id: 'team_dynamics',
      label: 'Team Dynamics & Interprofessional Working',
      required: true,
      description:
        'How the trainee worked with the MDT, other agencies, or family members. Power dynamics, unconscious group processes, collaborative decision-making.',
      promptHint:
        'Describe the interprofessional dynamics. How did you navigate different perspectives and any tensions?',
      extractionQuestion:
        'How did you work with the team or other people involved? Were there any tensions?',
      weight: 0.2,
    },
    {
      id: 'feedback',
      label: 'Feedback Received',
      required: false,
      description: 'Feedback from the observer or other participants on performance.',
      promptHint: 'Note any feedback you received on your performance.',
      extractionQuestion: 'Did you receive any feedback on your performance?',
      weight: 0.15,
    },
    {
      id: 'reflection',
      label: 'Reflection & Learning',
      required: true,
      description:
        'What went well, what could be improved, lessons for future non-clinical activities.',
      promptHint:
        'Reflect on your non-clinical skills. What will you maintain, improve, or approach differently?',
      extractionQuestion: 'What did you learn from this experience?',
      weight: 0.25,
    },
    {
      id: 'wellbeing',
      label: 'Team Wellbeing',
      required: false,
      description: 'How the activity considered team wellbeing, morale, or staff support.',
      promptHint: 'If relevant, note how team wellbeing was addressed during the activity.',
      extractionQuestion: null,
      weight: 0.05,
    },
  ],
};

// ---------------------------------------------------------------------------
// Template 7: PSY_MHA (Mental Health Act Application)
// Used by: MHA_APPLICATION
// ---------------------------------------------------------------------------
export const PSY_MHA_TEMPLATE: ArtefactTemplate = {
  id: 'PSY_MHA_TEMPLATE',
  name: 'Mental Health Act Application',
  wordCountRange: { min: 250, max: 450 },
  sections: [
    {
      id: 'clinical_context',
      label: 'Clinical Context',
      required: true,
      description:
        'Anonymised patient summary, setting, reason the MHA was being considered, relevant psychiatric presentation.',
      promptHint:
        'Describe the clinical scenario that led to considering use of the Mental Health Act. Keep anonymised.',
      extractionQuestion:
        'What was the clinical situation that led to considering the Mental Health Act?',
      weight: 0.15,
    },
    {
      id: 'legal_framework',
      label: 'Legal Framework Applied',
      required: true,
      description:
        'Which section of the MHA (or equivalent legislation) was applied or considered. Statutory criteria and how they were met. Involvement of AMHP, nearest relative.',
      promptHint:
        'Detail the specific legal framework used, statutory criteria met, and who was involved in the decision.',
      extractionQuestion:
        'Which section of the Mental Health Act did you apply or consider, and what criteria were met?',
      weight: 0.2,
    },
    {
      id: 'capacity_assessment',
      label: 'Capacity & Consent',
      required: true,
      description:
        'Capacity assessment findings. Whether the patient consented or not, and how this was managed. Consideration of least restrictive option.',
      promptHint:
        'Describe the capacity assessment and how consent was approached. Address the principle of least restriction.',
      extractionQuestion:
        "Did you assess the patient's capacity? Was the least restrictive option considered?",
      weight: 0.15,
    },
    {
      id: 'human_rights',
      label: 'Human Rights & Ethical Reasoning',
      required: true,
      description:
        'How the trainee balanced duty of care with restriction of human rights. Proportionality, necessity, and therapeutic purpose.',
      promptHint:
        'Reflect on the ethical tension between protection and autonomy. How did you ensure proportionality?',
      extractionQuestion:
        "How did you balance the duty of care with the patient's rights and autonomy?",
      weight: 0.15,
    },
    {
      id: 'outcome',
      label: 'Outcome',
      required: true,
      description:
        'What happened — was the patient detained, did they agree to informal admission, was the assessment discontinued? Follow-up plan.',
      promptHint: 'Describe the outcome and any follow-up arrangements.',
      extractionQuestion: 'What was the outcome?',
      weight: 0.1,
    },
    {
      id: 'reflection',
      label: 'Reflection & Learning',
      required: true,
      description:
        'What was learned about the application of mental health legislation. Emotional impact of detaining a patient. How this shapes future practice.',
      promptHint:
        'Reflect on the experience of using legal powers. Consider the emotional impact and what you learned about balancing care with coercion.',
      extractionQuestion:
        'What did you learn from this experience? How did it feel to be involved in detaining someone?',
      weight: 0.2,
    },
    {
      id: 'supervision_debrief',
      label: 'Supervision & Debrief',
      required: false,
      description: 'Whether this was discussed in supervision and any key points arising.',
      promptHint: 'Note if this was debriefed in supervision and any learning that emerged.',
      extractionQuestion: null,
      weight: 0.05,
    },
  ],
};

// ---------------------------------------------------------------------------
// Template 8: PSY_TEACHING (Teaching & Education Activity)
// Used by: TEACHING_ACTIVITY
// ---------------------------------------------------------------------------
export const PSY_TEACHING_TEMPLATE: ArtefactTemplate = {
  id: 'PSY_TEACHING_TEMPLATE',
  name: 'Teaching & Education Activity',
  wordCountRange: { min: 150, max: 300 },
  sections: [
    {
      id: 'activity_description',
      label: 'Activity Description',
      required: true,
      description:
        'What was taught, to whom, in what setting. The teaching format (lecture, small group, bedside, simulation, journal club).',
      promptHint: 'Describe the teaching activity, the audience, and the format used.',
      extractionQuestion: 'What did you teach, and to whom?',
      weight: 0.15,
    },
    {
      id: 'preparation',
      label: 'Preparation & Planning',
      required: true,
      description:
        'How the session was planned. Learning objectives, resources used, pedagogical approach.',
      promptHint:
        'Describe your preparation including learning objectives and teaching methods chosen.',
      extractionQuestion: 'How did you prepare for the session?',
      weight: 0.15,
    },
    {
      id: 'delivery',
      label: 'Delivery & Engagement',
      required: true,
      description:
        'How the session went. Learner engagement, questions raised, challenges encountered, adjustments made.',
      promptHint:
        'Describe how the session went in practice. How did learners engage? What went well or less well?',
      extractionQuestion: 'How did the session go? How did learners respond?',
      weight: 0.2,
    },
    {
      id: 'feedback',
      label: 'Feedback Received',
      required: false,
      description: 'Feedback from learners or observers. Formal or informal.',
      promptHint: 'Note any feedback you received on your teaching.',
      extractionQuestion: 'Did you receive any feedback from learners?',
      weight: 0.15,
    },
    {
      id: 'reflection',
      label: 'Reflection & Development',
      required: true,
      description:
        'What was learned about teaching and education. What would be done differently next time.',
      promptHint: 'Reflect on your development as an educator. What would you change next time?',
      extractionQuestion: 'What did you learn about teaching from this experience?',
      weight: 0.25,
    },
    {
      id: 'impact',
      label: 'Impact on Learners',
      required: false,
      description:
        'Evidence of impact on learners — changes in practice, subsequent feedback, assessment results.',
      promptHint: 'If known, describe any impact your teaching had on the learners.',
      extractionQuestion: null,
      weight: 0.1,
    },
  ],
};

// ---------------------------------------------------------------------------
// Template 9: PSY_QIP (Quality Improvement Project)
// Used by: QI_PROJECT
// ---------------------------------------------------------------------------
export const PSY_QIP_TEMPLATE: ArtefactTemplate = {
  id: 'PSY_QIP_TEMPLATE',
  name: 'Quality Improvement Project',
  wordCountRange: { min: 500, max: 800 },
  sections: [
    {
      id: 'rationale',
      label: 'Rationale & Problem Statement',
      required: true,
      description:
        'Why this topic was chosen within the psychiatric service. Identified need, evidence base, relevant guidelines or standards.',
      promptHint:
        'Describe the problem identified and why it matters in the psychiatric service context. Reference relevant guidelines.',
      extractionQuestion: 'What problem did you identify, and why did it matter?',
      weight: 0.15,
    },
    {
      id: 'aims',
      label: 'Aims & Objectives',
      required: true,
      description: 'SMART aims for the project. What improvement was targeted and how measured.',
      promptHint: 'State the project aims using SMART criteria.',
      extractionQuestion: 'What were you trying to achieve? How would you measure success?',
      weight: 0.1,
    },
    {
      id: 'methodology',
      label: 'Methodology',
      required: true,
      description:
        'How the project was conducted. Data collection, PDSA cycles, stakeholder engagement.',
      promptHint: 'Describe your methodology including data collection and PDSA cycles.',
      extractionQuestion: 'How did you go about the project? What methodology did you use?',
      weight: 0.15,
    },
    {
      id: 'stakeholders',
      label: 'Team & Stakeholder Engagement',
      required: true,
      description:
        'Who was involved — MDT members, patients, carers, managers. Service user involvement.',
      promptHint: 'Describe who was involved, including any patient or carer involvement.',
      extractionQuestion: 'Who did you work with on this project?',
      weight: 0.1,
    },
    {
      id: 'results',
      label: 'Results & Data',
      required: true,
      description: 'What the data showed. Quantitative and qualitative findings.',
      promptHint: 'Present the results clearly. Include data and key findings.',
      extractionQuestion: 'What did your data show?',
      weight: 0.15,
    },
    {
      id: 'changes',
      label: 'Changes Implemented',
      required: true,
      description: 'What changes were made and how they were embedded in the service.',
      promptHint: 'Describe specific changes made and how they were embedded.',
      extractionQuestion: 'What changes were made as a result?',
      weight: 0.1,
    },
    {
      id: 'sustainability',
      label: 'Sustainability',
      required: true,
      description: 'How changes will be maintained. Who is responsible.',
      promptHint: 'Describe how improvements will be sustained.',
      extractionQuestion: 'How will these changes be maintained?',
      weight: 0.05,
    },
    {
      id: 'reflection',
      label: 'Reflection & Learning',
      required: true,
      description: 'What was learned about QI methodology, team working, and personal development.',
      promptHint:
        'Reflect on the QI process — what worked, what you would change, and what you learned about leading improvement.',
      extractionQuestion: 'What did you learn from leading this project?',
      weight: 0.2,
    },
  ],
};

// ---------------------------------------------------------------------------
// Template 10: PSY_FEEDBACK (Reflection on Feedback)
// Used by: FEEDBACK_REFLECTION
// ---------------------------------------------------------------------------
export const PSY_FEEDBACK_TEMPLATE: ArtefactTemplate = {
  id: 'PSY_FEEDBACK_TEMPLATE',
  name: 'Reflection on Feedback',
  wordCountRange: { min: 200, max: 400 },
  sections: [
    {
      id: 'feedback_source',
      label: 'Feedback Source',
      required: true,
      description:
        'Type of feedback received (MSF, patient feedback, MRCPsych exam results, supervisor feedback) and when.',
      promptHint: 'Identify the feedback source and context.',
      extractionQuestion: 'What feedback did you receive, and from what source?',
      weight: 0.1,
    },
    {
      id: 'feedback_summary',
      label: 'Key Findings',
      required: true,
      description:
        'Summary of main themes, scores, or comments. Both strengths and areas for development.',
      promptHint: 'Summarise key themes honestly. Include strengths and areas for improvement.',
      extractionQuestion: 'What were the main points or themes from the feedback?',
      weight: 0.2,
    },
    {
      id: 'emotional_response',
      label: 'Initial Response',
      required: false,
      description:
        'How the trainee felt receiving the feedback. Self-awareness and emotional intelligence.',
      promptHint: 'Reflect honestly on your initial reaction to the feedback.',
      extractionQuestion: 'How did you feel when you first received this feedback?',
      weight: 0.1,
    },
    {
      id: 'analysis',
      label: 'Analysis & Interpretation',
      required: true,
      description: 'What the feedback means for development. Areas of agreement and disagreement.',
      promptHint:
        'Analyse what the feedback tells you about your practice. Where do you agree or disagree?',
      extractionQuestion: 'Do you agree with the feedback? What does it tell you?',
      weight: 0.25,
    },
    {
      id: 'action_plan',
      label: 'Actions Taken or Planned',
      required: true,
      description: 'Specific steps taken or planned in response. SMART where possible.',
      promptHint: 'Detail specific actions taken or planned. Be concrete and time-bound.',
      extractionQuestion: 'What have you done or plan to do in response?',
      weight: 0.25,
    },
    {
      id: 'follow_up',
      label: 'Impact & Follow-up',
      required: false,
      description: 'Evidence of actions taken and their effect.',
      promptHint: 'If applicable, describe the impact of changes since the feedback.',
      extractionQuestion: 'Have you noticed any changes since acting on this feedback?',
      weight: 0.1,
    },
  ],
};

// ---------------------------------------------------------------------------
// All templates and mapping
// ---------------------------------------------------------------------------
export const PSYCHIATRY_TEMPLATES: Record<string, ArtefactTemplate> = {
  PSY_ACE_TEMPLATE,
  PSY_CBD_TEMPLATE,
  PSY_SEA_TEMPLATE,
  PSY_REFLECTION_TEMPLATE,
  PSY_SAPE_TEMPLATE,
  PSY_DONCS_TEMPLATE,
  PSY_MHA_TEMPLATE,
  PSY_TEACHING_TEMPLATE,
  PSY_QIP_TEMPLATE,
  PSY_FEEDBACK_TEMPLATE,
};

export const PSYCHIATRY_ENTRY_TYPE_TO_TEMPLATE: Record<string, string> = {
  CLINICAL_CASE_REVIEW: 'PSY_ACE_TEMPLATE',
  CASE_BASED_DISCUSSION: 'PSY_CBD_TEMPLATE',
  SIGNIFICANT_EVENT: 'PSY_SEA_TEMPLATE',
  REFLECTIVE_PRACTICE: 'PSY_REFLECTION_TEMPLATE',
  PSYCHOTHERAPY_CASE: 'PSY_SAPE_TEMPLATE',
  DONCS: 'PSY_DONCS_TEMPLATE',
  MHA_APPLICATION: 'PSY_MHA_TEMPLATE',
  TEACHING_ACTIVITY: 'PSY_TEACHING_TEMPLATE',
  QI_PROJECT: 'PSY_QIP_TEMPLATE',
  FEEDBACK_REFLECTION: 'PSY_FEEDBACK_TEMPLATE',
};
