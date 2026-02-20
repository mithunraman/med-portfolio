import { ArtefactTemplate } from '@acme/shared';

// ---------------------------------------------------------------------------
// Template 1: CCR (Clinical Case Review)
// Used by: CLINICAL_CASE_REVIEW, OUT_OF_HOURS
// ---------------------------------------------------------------------------
export const CCR_TEMPLATE: ArtefactTemplate = {
  id: 'CCR_TEMPLATE',
  name: 'Clinical Case Review',
  wordCountRange: { min: 150, max: 300 },
  sections: [
    {
      id: 'presentation',
      label: 'Clinical Presentation',
      required: true,
      description:
        'Patient demographics (anonymised), presenting complaint, relevant history, context of consultation.',
      promptHint:
        'Describe the clinical scenario concisely. Include age, gender, setting, and presenting complaint. Keep anonymised.',
      extractionQuestion: 'Can you describe the patient and what they presented with?',
      weight: 0.15,
    },
    {
      id: 'clinical_findings',
      label: 'Clinical Findings',
      required: false,
      description: 'Examination findings, investigation results, observations.',
      promptHint: 'Summarise relevant positive and negative findings.',
      extractionQuestion: 'What did you find on examination or investigation?',
      weight: 0.1,
    },
    {
      id: 'clinical_reasoning',
      label: 'Clinical Reasoning',
      required: true,
      description:
        'Differential diagnosis considered, why the working diagnosis was reached, what was considered and ruled out.',
      promptHint:
        'Explain the thought process behind the diagnosis. Include what was considered and why alternatives were excluded.',
      extractionQuestion:
        'What differentials did you consider, and what led you to your working diagnosis?',
      weight: 0.2,
    },
    {
      id: 'management',
      label: 'Management & Actions',
      required: true,
      description:
        'Treatment given, investigations ordered, referrals made, safety-netting advice, follow-up plan.',
      promptHint: 'Detail the management plan and the rationale behind each decision.',
      extractionQuestion: 'What management plan did you put in place?',
      weight: 0.15,
    },
    {
      id: 'outcome',
      label: 'Patient Outcome',
      required: true,
      description: 'What happened to the patient, follow-up results, resolution or ongoing plan.',
      promptHint: 'Describe how the patient responded and any follow-up.',
      extractionQuestion: 'What was the outcome for this patient?',
      weight: 0.1,
    },
    {
      id: 'reflection',
      label: 'Reflection & Learning',
      required: true,
      description:
        'What went well, what could be improved, what was learned, how this changes future practice. Should demonstrate critical thinking, not just description.',
      promptHint:
        'Reflect on personal learning and impact on future practice. Address: What will I maintain, improve, or stop?',
      extractionQuestion:
        'What did you learn from this case, and would you do anything differently?',
      weight: 0.25,
    },
    {
      id: 'ethical_legal',
      label: 'Ethical / Legal Considerations',
      required: false,
      description: 'Consent, capacity, confidentiality, safeguarding concerns if relevant.',
      promptHint: 'Note any ethical, legal, or safeguarding dimensions if applicable.',
      extractionQuestion: null,
      weight: 0.05,
    },
  ],
};

// ---------------------------------------------------------------------------
// Template 2: SEA (Significant Event Analysis)
// Used by: SIGNIFICANT_EVENT
// ---------------------------------------------------------------------------
export const SEA_TEMPLATE: ArtefactTemplate = {
  id: 'SEA_TEMPLATE',
  name: 'Significant Event Analysis',
  wordCountRange: { min: 300, max: 500 },
  sections: [
    {
      id: 'event_description',
      label: 'What Happened',
      required: true,
      description:
        'Factual, chronological, anonymised account of the event. Who was involved, what occurred, when and where.',
      promptHint:
        'Describe the event objectively and chronologically without judgment. Keep anonymised.',
      extractionQuestion: 'Can you walk me through exactly what happened?',
      weight: 0.15,
    },
    {
      id: 'what_went_well',
      label: 'What Went Well',
      required: true,
      description:
        'Aspects of the situation that were handled correctly. Good practice that should be maintained.',
      promptHint: 'Identify positive aspects — what was done correctly, what worked.',
      extractionQuestion: 'Was there anything that was handled well during this event?',
      weight: 0.1,
    },
    {
      id: 'what_could_improve',
      label: 'What Could Have Been Done Differently',
      required: true,
      description:
        'Honest assessment of where things went wrong or could have been better. Specific, not vague.',
      promptHint:
        'Describe specific actions or decisions that could have been different. Avoid vague generalisations.',
      extractionQuestion:
        'Looking back, is there anything you or the team could have done differently?',
      weight: 0.15,
    },
    {
      id: 'root_cause',
      label: 'Why It Happened',
      required: true,
      description:
        'Root cause analysis — system factors, human factors, communication breakdown, resource issues. Not about blaming individuals.',
      promptHint:
        'Analyse the contributing factors. Consider system issues, communication, workload, knowledge gaps. Avoid individual blame.',
      extractionQuestion:
        'What do you think contributed to this happening? Were there any system or team factors?',
      weight: 0.2,
    },
    {
      id: 'impact',
      label: 'Impact',
      required: true,
      description: 'Effect on the patient, the trainee, the team, and/or the wider system.',
      promptHint: 'Describe the consequences honestly — for the patient, yourself, and the team.',
      extractionQuestion: 'What was the impact on the patient and/or your team?',
      weight: 0.1,
    },
    {
      id: 'changes_made',
      label: 'Changes Made',
      required: true,
      description:
        'Concrete actions taken or proposed — protocols changed, guidelines reviewed, team briefings, new processes. Must be specific.',
      promptHint:
        'Detail specific changes implemented or planned. Include who is responsible and timelines.',
      extractionQuestion: 'What has been done or changed as a result of this event?',
      weight: 0.2,
    },
    {
      id: 'personal_learning',
      label: 'Personal Learning',
      required: true,
      description:
        'What the trainee personally took away. How it shapes their practice going forward. Link to professional development.',
      promptHint:
        'Connect to personal professional development. Address: What will I maintain, improve, or stop?',
      extractionQuestion: 'What did you personally take away from this experience?',
      weight: 0.1,
    },
  ],
};

// ---------------------------------------------------------------------------
// Template 3: LEA (Learning Event Analysis)
// Used by: LEARNING_EVENT, ACADEMIC_ACTIVITY
// ---------------------------------------------------------------------------
export const LEA_TEMPLATE: ArtefactTemplate = {
  id: 'LEA_TEMPLATE',
  name: 'Learning Event Analysis',
  wordCountRange: { min: 200, max: 400 },
  sections: [
    {
      id: 'event_description',
      label: 'What Happened',
      required: true,
      description:
        'Description of the event or learning opportunity. What occurred, who was involved, the setting.',
      promptHint:
        'Describe the event or learning opportunity concisely. Include context and setting.',
      extractionQuestion: 'Can you describe what happened or what the learning opportunity was?',
      weight: 0.15,
    },
    {
      id: 'learning_opportunity',
      label: 'Why This Was a Learning Opportunity',
      required: true,
      description:
        'What made this event notable. What could have gone differently. Why it matters for professional development.',
      promptHint:
        'Explain why this event is significant for learning. What could have gone wrong, or what insight did it offer?',
      extractionQuestion: 'What made this event stand out as a learning opportunity?',
      weight: 0.2,
    },
    {
      id: 'what_learned',
      label: 'What Was Learned',
      required: true,
      description:
        'Specific knowledge, skills, or attitudes gained. Link to evidence or guidelines where relevant.',
      promptHint:
        'Describe concrete learning points. Reference relevant guidelines or evidence if applicable.',
      extractionQuestion: 'What specifically did you learn from this?',
      weight: 0.25,
    },
    {
      id: 'application',
      label: 'Application to Practice',
      required: true,
      description:
        "How this learning will change or has changed the trainee's practice. Specific, not generic.",
      promptHint:
        'Describe how this learning applies to your day-to-day practice. Be specific about what will change.',
      extractionQuestion: 'How will this change your practice going forward?',
      weight: 0.25,
    },
    {
      id: 'team_sharing',
      label: 'Team Sharing',
      required: false,
      description:
        'Whether and how the learning was shared with the team. Evidence of collaborative learning.',
      promptHint: 'Note if and how this learning was shared with colleagues or the wider team.',
      extractionQuestion: 'Did you share this learning with your team?',
      weight: 0.05,
    },
    {
      id: 'evidence_of_change',
      label: 'Evidence of Change',
      required: false,
      description:
        'Concrete examples showing the learning has been applied. Linked entries, follow-up cases.',
      promptHint:
        "If applicable, describe specific examples where you've applied this learning since.",
      extractionQuestion: "Can you give an example of how you've applied this learning since?",
      weight: 0.1,
    },
  ],
};

// ---------------------------------------------------------------------------
// Template 4: Feedback Reflection
// Used by: FEEDBACK_REFLECTION
// ---------------------------------------------------------------------------
export const FEEDBACK_TEMPLATE: ArtefactTemplate = {
  id: 'FEEDBACK_TEMPLATE',
  name: 'Reflection on Feedback',
  wordCountRange: { min: 200, max: 400 },
  sections: [
    {
      id: 'feedback_source',
      label: 'Feedback Source',
      required: true,
      description:
        'What type of feedback was received (MSF, PSQ, exam results, informal feedback) and when.',
      promptHint: 'Identify the feedback source and context. Include when it was received.',
      extractionQuestion:
        'What feedback did you receive, and from what source (MSF, PSQ, exam, etc.)?',
      weight: 0.1,
    },
    {
      id: 'feedback_summary',
      label: 'Key Findings',
      required: true,
      description:
        'Summary of the main themes, scores, or comments. Both positive and areas for development.',
      promptHint:
        'Summarise the key themes honestly. Include strengths as well as areas for improvement.',
      extractionQuestion: 'What were the main points or themes from the feedback?',
      weight: 0.2,
    },
    {
      id: 'emotional_response',
      label: 'Initial Response',
      required: false,
      description:
        'How the trainee felt receiving the feedback. Demonstrates self-awareness and emotional intelligence.',
      promptHint: 'Reflect honestly on your initial reaction to the feedback.',
      extractionQuestion: 'How did you feel when you first received this feedback?',
      weight: 0.1,
    },
    {
      id: 'analysis',
      label: 'Analysis & Interpretation',
      required: true,
      description:
        "What the feedback means in the context of the trainee's development. Areas of agreement/disagreement.",
      promptHint:
        'Analyse what the feedback tells you about your practice. Where do you agree or disagree, and why?',
      extractionQuestion:
        'Do you agree with the feedback? What does it tell you about your development?',
      weight: 0.25,
    },
    {
      id: 'action_plan',
      label: 'Actions Taken or Planned',
      required: true,
      description:
        'Specific, concrete steps taken or planned in response to the feedback. Should be SMART where possible.',
      promptHint:
        'Detail specific actions you have taken or plan to take in response. Be concrete and time-bound.',
      extractionQuestion: 'What have you done or plan to do in response to this feedback?',
      weight: 0.25,
    },
    {
      id: 'follow_up',
      label: 'Impact & Follow-up',
      required: false,
      description:
        'Evidence that actions have been taken and their effect. Linked entries or subsequent feedback.',
      promptHint:
        "If applicable, describe the impact of changes you've made since receiving the feedback.",
      extractionQuestion: 'Have you noticed any changes since acting on this feedback?',
      weight: 0.1,
    },
  ],
};

// ---------------------------------------------------------------------------
// Template 5: Leadership
// Used by: LEADERSHIP_ACTIVITY
// ---------------------------------------------------------------------------
export const LEADERSHIP_TEMPLATE: ArtefactTemplate = {
  id: 'LEADERSHIP_TEMPLATE',
  name: 'Leadership Activity',
  wordCountRange: { min: 200, max: 400 },
  sections: [
    {
      id: 'activity_description',
      label: 'Activity Description',
      required: true,
      description: "What the leadership activity was, the context, the trainee's specific role.",
      promptHint:
        'Describe the activity and your specific role within it. Include context and setting.',
      extractionQuestion: 'What was the leadership activity, and what was your role?',
      weight: 0.15,
    },
    {
      id: 'rationale',
      label: 'Rationale',
      required: true,
      description:
        'Why this activity was chosen or undertaken. What problem or opportunity it addressed.',
      promptHint: 'Explain why this activity was needed and why you took it on.',
      extractionQuestion:
        'Why did you undertake this activity? What need or opportunity did it address?',
      weight: 0.1,
    },
    {
      id: 'approach',
      label: 'Approach & Process',
      required: true,
      description:
        'How the trainee approached the activity. Steps taken, people involved, challenges encountered.',
      promptHint:
        'Describe your approach step by step. How did you engage others? What challenges arose?',
      extractionQuestion:
        'How did you go about it? Who was involved and what challenges did you face?',
      weight: 0.2,
    },
    {
      id: 'outcomes',
      label: 'Outcomes',
      required: true,
      description:
        'What was achieved. Impact on the team, patients, or system. Include both successes and limitations.',
      promptHint:
        'Describe what was achieved and any measurable impact. Be honest about limitations.',
      extractionQuestion: 'What was the outcome? What impact did it have?',
      weight: 0.15,
    },
    {
      id: 'leadership_skills',
      label: 'Leadership Skills Demonstrated',
      required: true,
      description:
        'Specific leadership competencies demonstrated: communication, delegation, decision-making, conflict resolution, change management, teamwork.',
      promptHint:
        'Identify which leadership skills you used and how. Link to specific examples from the activity.',
      extractionQuestion: 'What leadership skills did you draw on during this activity?',
      weight: 0.15,
    },
    {
      id: 'reflection',
      label: 'Reflection & Learning',
      required: true,
      description:
        "What worked, what didn't, what the trainee learned about themselves as a leader.",
      promptHint:
        'Reflect on your leadership approach. What would you do differently? How will this shape your future practice as a leader?',
      extractionQuestion: 'What did you learn about yourself as a leader?',
      weight: 0.2,
    },
    {
      id: 'wellbeing',
      label: 'Team Wellbeing',
      required: false,
      description: 'How the activity considered or contributed to colleague wellbeing.',
      promptHint: 'If relevant, note how the activity addressed team wellbeing or morale.',
      extractionQuestion: null,
      weight: 0.05,
    },
  ],
};

// ---------------------------------------------------------------------------
// Template 6: QIP (Quality Improvement Project)
// Used by: QI_PROJECT
// ---------------------------------------------------------------------------
export const QIP_TEMPLATE: ArtefactTemplate = {
  id: 'QIP_TEMPLATE',
  name: 'Quality Improvement Project',
  wordCountRange: { min: 500, max: 800 },
  sections: [
    {
      id: 'rationale',
      label: 'Rationale & Problem Statement',
      required: true,
      description:
        'Why this topic was chosen. Identified need in the training practice. Brief summary of current evidence/guidance.',
      promptHint:
        'Describe the problem identified and why it matters. Reference relevant guidelines or evidence.',
      extractionQuestion: 'What problem did you identify, and why did it matter?',
      weight: 0.15,
    },
    {
      id: 'aims',
      label: 'Aims & Objectives',
      required: true,
      description:
        'SMART aims for the project. What improvement was targeted and how it would be measured.',
      promptHint:
        'State the project aims using SMART criteria (Specific, Measurable, Achievable, Relevant, Time-defined).',
      extractionQuestion: 'What were you trying to achieve? How would you measure success?',
      weight: 0.1,
    },
    {
      id: 'methodology',
      label: 'Methodology',
      required: true,
      description:
        'How the project was conducted. Data collection method, sample size, PDSA cycles used. At least two PDSA cycles expected.',
      promptHint: 'Describe your methodology including data collection approach and PDSA cycles.',
      extractionQuestion: 'How did you go about the project? What methodology did you use?',
      weight: 0.15,
    },
    {
      id: 'stakeholders',
      label: 'Team & Stakeholder Engagement',
      required: true,
      description:
        'Who was involved and how they were engaged. Collaborative elements vs personal contribution.',
      promptHint:
        'Describe who was involved, how you engaged stakeholders, and what was collaborative vs your personal contribution.',
      extractionQuestion: 'Who did you work with on this, and how did you engage them?',
      weight: 0.1,
    },
    {
      id: 'results',
      label: 'Results & Data',
      required: true,
      description: 'What the data showed. Both quantitative and qualitative findings.',
      promptHint:
        "Present the results clearly. Include key data points and trends. Note both improvements and areas that didn't change.",
      extractionQuestion: 'What did your data show?',
      weight: 0.15,
    },
    {
      id: 'changes',
      label: 'Changes Implemented',
      required: true,
      description: 'What changes were made based on the data. How they were embedded in practice.',
      promptHint: 'Describe specific changes made and how they were embedded in ongoing practice.',
      extractionQuestion: 'What changes were made as a result of your findings?',
      weight: 0.1,
    },
    {
      id: 'sustainability',
      label: 'Sustainability',
      required: true,
      description: 'How changes will be maintained after the project ends. Who is responsible.',
      promptHint: 'Describe how the improvements will be sustained. Who will maintain oversight?',
      extractionQuestion: 'How will these changes be maintained going forward?',
      weight: 0.05,
    },
    {
      id: 'reflection',
      label: 'Reflection & Learning',
      required: true,
      description:
        'What the trainee learned about improvement methodology, working with teams, and their own development.',
      promptHint:
        "Reflect on the QI process itself — what worked, what you'd change, and what you learned about leading improvement.",
      extractionQuestion:
        'What did you learn about the improvement process? What would you do differently?',
      weight: 0.2,
    },
  ],
};

// ---------------------------------------------------------------------------
// Template 7: QIA (Quality Improvement Activity)
// Used by: QI_ACTIVITY
// ---------------------------------------------------------------------------
export const QIA_TEMPLATE: ArtefactTemplate = {
  id: 'QIA_TEMPLATE',
  name: 'Quality Improvement Activity',
  wordCountRange: { min: 200, max: 400 },
  sections: [
    {
      id: 'title_context',
      label: 'Title & Context',
      required: true,
      description:
        'What the activity was, the setting, and why it was identified as an improvement opportunity.',
      promptHint: 'Describe the activity and the context that prompted it.',
      extractionQuestion: 'What was the quality improvement activity, and what prompted it?',
      weight: 0.15,
    },
    {
      id: 'aims',
      label: 'What Were You Trying to Accomplish',
      required: true,
      description: 'The specific goal of the activity. What improvement was targeted.',
      promptHint: 'State clearly what you were trying to improve and why.',
      extractionQuestion: 'What were you trying to achieve?',
      weight: 0.15,
    },
    {
      id: 'engagement',
      label: 'How Did You Engage With Others',
      required: true,
      description:
        'Who was involved in planning and delivery. How the trainee collaborated with the team.',
      promptHint: 'Describe how you involved others in planning and carrying out the activity.',
      extractionQuestion: 'Who else was involved, and how did you work together?',
      weight: 0.15,
    },
    {
      id: 'changes',
      label: 'What Changes Have Taken Place',
      required: true,
      description:
        'What was actually done. What improvements resulted. Include evidence of impact where possible.',
      promptHint:
        'Describe the changes that were implemented and their effect. Include evidence if available.',
      extractionQuestion: 'What changes were made, and what was the result?',
      weight: 0.3,
    },
    {
      id: 'reflection',
      label: 'Reflection: Maintain, Improve, or Stop',
      required: true,
      description:
        'What worked well (maintain), what could be better (improve), what should be stopped.',
      promptHint: 'Reflect using the framework: What will I maintain, improve, or stop?',
      extractionQuestion: 'Reflecting on this activity, what would you maintain, improve, or stop?',
      weight: 0.25,
    },
  ],
};

// ---------------------------------------------------------------------------
// Template 8: Prescribing
// Used by: PRESCRIBING
// ---------------------------------------------------------------------------
export const PRESCRIBING_TEMPLATE: ArtefactTemplate = {
  id: 'PRESCRIBING_TEMPLATE',
  name: 'Prescribing Assessment',
  wordCountRange: { min: 200, max: 400 },
  sections: [
    {
      id: 'prescribing_context',
      label: 'Prescribing Context',
      required: true,
      description:
        'The scope of the review: how many prescriptions, which clinical setting, what period.',
      promptHint:
        'Describe the prescribing review context — how many prescriptions, over what period, in what setting.',
      extractionQuestion: 'Can you describe the scope of your prescribing review?',
      weight: 0.1,
    },
    {
      id: 'patterns_identified',
      label: 'Patterns Identified',
      required: true,
      description:
        'Key patterns in prescribing: common drug classes, frequent clinical scenarios, any habits noticed.',
      promptHint:
        'Summarise the main patterns in your prescribing. What drug classes and clinical scenarios came up most?',
      extractionQuestion: 'What patterns did you notice in your prescribing?',
      weight: 0.15,
    },
    {
      id: 'errors_near_misses',
      label: 'Errors & Near-Misses',
      required: true,
      description:
        'Any prescribing errors or near-misses identified in the review. Honest self-assessment.',
      promptHint:
        'Describe any errors or near-misses identified. Be specific about what happened and why.',
      extractionQuestion: 'Did you identify any prescribing errors or near-misses?',
      weight: 0.2,
    },
    {
      id: 'proficiencies_assessment',
      label: 'Proficiencies Self-Assessment',
      required: true,
      description:
        'Assessment against GP prescribing proficiencies: assessing risks/benefits, guideline adherence, antimicrobial stewardship, patient counselling, monitoring.',
      promptHint:
        'Reflect on your performance against the prescribing proficiencies. Where are you strong? Where do you need development?',
      extractionQuestion: 'How do you assess yourself against the GP prescribing proficiencies?',
      weight: 0.2,
    },
    {
      id: 'guidelines_adherence',
      label: 'Guideline Adherence',
      required: false,
      description:
        'How well prescribing aligns with NICE/BNF/local guidelines. Any deviations and justification.',
      promptHint:
        'Note how your prescribing aligns with relevant guidelines. Explain any justified deviations.',
      extractionQuestion: 'How well did your prescribing align with guidelines?',
      weight: 0.1,
    },
    {
      id: 'reflection',
      label: 'Reflection & Learning',
      required: true,
      description:
        'What the trainee learned about their prescribing practice. Strengths and areas for development.',
      promptHint:
        'Reflect on your prescribing practice overall. What are your strengths? What needs development?',
      extractionQuestion: 'What did you learn about your prescribing?',
      weight: 0.15,
    },
    {
      id: 'development_plan',
      label: 'Development Plan',
      required: true,
      description:
        'Specific actions to improve prescribing. May include a Prescribing PDP if needed.',
      promptHint:
        'Detail specific actions to improve your prescribing. Make them concrete and time-bound.',
      extractionQuestion: 'What specific steps will you take to improve your prescribing?',
      weight: 0.1,
    },
  ],
};

// ---------------------------------------------------------------------------
// All templates and mapping
// ---------------------------------------------------------------------------
export const GP_TEMPLATES: Record<string, ArtefactTemplate> = {
  CCR_TEMPLATE,
  SEA_TEMPLATE,
  LEA_TEMPLATE,
  FEEDBACK_TEMPLATE,
  LEADERSHIP_TEMPLATE,
  QIP_TEMPLATE,
  QIA_TEMPLATE,
  PRESCRIBING_TEMPLATE,
};

export const GP_ENTRY_TYPE_TO_TEMPLATE: Record<string, string> = {
  CLINICAL_CASE_REVIEW: 'CCR_TEMPLATE',
  SIGNIFICANT_EVENT: 'SEA_TEMPLATE',
  LEARNING_EVENT: 'LEA_TEMPLATE',
  FEEDBACK_REFLECTION: 'FEEDBACK_TEMPLATE',
  LEADERSHIP_ACTIVITY: 'LEADERSHIP_TEMPLATE',
  ACADEMIC_ACTIVITY: 'LEA_TEMPLATE',
  OUT_OF_HOURS: 'CCR_TEMPLATE',
  QI_PROJECT: 'QIP_TEMPLATE',
  QI_ACTIVITY: 'QIA_TEMPLATE',
  PRESCRIBING: 'PRESCRIBING_TEMPLATE',
};
