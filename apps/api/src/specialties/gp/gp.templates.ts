import { ArtefactTemplate, flatSections } from '@acme/shared';

// ---------------------------------------------------------------------------
// Template 3: LEA (Learning Event Analysis)
// Used by: LEARNING_EVENT, ACADEMIC_ACTIVITY
// ---------------------------------------------------------------------------
export const LEA_TEMPLATE: ArtefactTemplate = {
  id: 'LEA_TEMPLATE',
  name: 'Learning Event Analysis',
  wordCountRange: { min: 200, max: 400 },
  sections: flatSections([
    {
      id: 'event_description',
      label: 'What Happened',
      required: true,
      descriptorCriteria:
        'Strong = a clear account of the event or learning opportunity stating what occurred, who was involved, and the setting. ' +
        'Adequate = the event described with some context. ' +
        'Shallow = a vague one-liner with no detail about what happened or where.',
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
      descriptorCriteria:
        'Strong = what specifically made this event notable AND why it matters for professional development (what could have gone differently). ' +
        'Adequate = a genuine reason the event was significant. ' +
        'Shallow = a generic statement that it was "interesting" or "useful" with no specific reason it mattered.',
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
      descriptorCriteria:
        'Strong = specific knowledge, skills, or attitudes gained AND a link to relevant evidence or guidelines. ' +
        'Adequate = a concrete learning point stated. ' +
        'Shallow = a vague claim of having learnt something with no specific knowledge or skill named.',
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
      descriptorCriteria:
        "Strong = specifically how this learning will change or has changed the trainee's day-to-day practice (what they will do differently). " +
        'Adequate = a genuine practice change stated with some substance. ' +
        'Shallow = a generic intention ("I\'ll apply this") with no specific change to practice.',
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
  ]),
};

// ---------------------------------------------------------------------------
// Template 4: Feedback Reflection
// Used by: FEEDBACK_REFLECTION
// ---------------------------------------------------------------------------
export const FEEDBACK_TEMPLATE: ArtefactTemplate = {
  id: 'FEEDBACK_TEMPLATE',
  name: 'Reflection on Feedback',
  wordCountRange: { min: 200, max: 400 },
  sections: flatSections([
    {
      id: 'feedback_source',
      label: 'Feedback Source',
      required: true,
      descriptorCriteria:
        'Strong = the specific type of feedback (MSF, PSQ, exam results, informal) AND when it was received and the context. ' +
        'Adequate = the feedback source named with some context. ' +
        'Shallow = a vague mention of "feedback" with no source type or timing.',
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
      descriptorCriteria:
        'Strong = the main themes, scores, or comments summarised honestly, covering both strengths AND areas for development. ' +
        'Adequate = the key points summarised with some balance. ' +
        'Shallow = a one-sided or vague summary ("mostly positive") with no specific themes or development areas.',
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
      descriptorCriteria:
        "Strong = what the feedback means for the trainee's development AND a reasoned position on where they agree or disagree and why. " +
        'Adequate = some interpretation of what the feedback tells them. ' +
        'Shallow = bare acceptance or rejection ("the feedback was fair") with no analysis of what it means.',
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
      descriptorCriteria:
        'Strong = specific, concrete steps taken or planned in response AND time-bound, SMART detail linking each step to the feedback. ' +
        'Adequate = a concrete action stated with some substance. ' +
        'Shallow = a vague intention ("I\'ll work on it") with no specific or time-bound step.',
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
  ]),
};

// ---------------------------------------------------------------------------
// Template 5: Leadership
// Used by: LEADERSHIP_ACTIVITY
// ---------------------------------------------------------------------------
export const LEADERSHIP_TEMPLATE: ArtefactTemplate = {
  id: 'LEADERSHIP_TEMPLATE',
  name: 'Leadership Activity',
  wordCountRange: { min: 200, max: 400 },
  sections: flatSections([
    {
      id: 'activity_description',
      label: 'Activity Description',
      required: true,
      descriptorCriteria:
        "Strong = what the leadership activity was, its context, AND the trainee's specific role within it. " +
        'Adequate = the activity and role described with some context. ' +
        'Shallow = a vague mention of an activity with no clear role or setting.',
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
      descriptorCriteria:
        'Strong = why the activity was undertaken AND the specific problem or opportunity it addressed. ' +
        'Adequate = a genuine reason for the activity stated. ' +
        'Shallow = a vague justification ("it seemed useful") with no specific need or opportunity.',
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
      descriptorCriteria:
        'Strong = the specific steps taken AND how others were engaged and what challenges arose along the way. ' +
        'Adequate = the approach described with some sequence and detail. ' +
        'Shallow = a vague account ("I organised it") with no steps, people, or challenges.',
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
      descriptorCriteria:
        'Strong = what was specifically achieved and its impact on the team, patients, or system, AND an honest account of limitations. ' +
        'Adequate = a genuine outcome stated with some impact. ' +
        'Shallow = a vague claim of success ("it went well") with no measurable impact or limitations.',
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
      descriptorCriteria:
        'Strong = specific leadership competencies (communication, delegation, decision-making, conflict resolution, change management) named AND tied to concrete examples from the activity. ' +
        'Adequate = a genuine leadership skill identified with some example. ' +
        'Shallow = a bare list of skill labels with no example of how they were used.',
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
      descriptorCriteria:
        'Strong = a specific insight about themselves as a leader AND how it will change their future leadership practice. ' +
        'Adequate = a genuine reflection on their leadership with one clear takeaway. ' +
        'Shallow = a bare verdict on how it went, with no personal leadership learning.',
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
  ]),
};

// ---------------------------------------------------------------------------
// Template 6: QIP (Quality Improvement Project)
// Used by: QI_PROJECT
// ---------------------------------------------------------------------------
export const QIP_TEMPLATE: ArtefactTemplate = {
  id: 'QIP_TEMPLATE',
  name: 'Quality Improvement Project',
  wordCountRange: { min: 500, max: 800 },
  sections: flatSections([
    {
      id: 'rationale',
      label: 'Rationale & Problem Statement',
      required: true,
      descriptorCriteria:
        'Strong = a clearly defined problem AND why it matters locally, grounded in evidence or guidance. ' +
        'Adequate = an identified problem with some justification of its importance. ' +
        'Shallow = a vague topic with no stated need or rationale.',
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
      descriptorCriteria:
        'Strong = a specific, measurable aim with a clear target AND how success would be measured. ' +
        'Adequate = a stated aim with some sense of the improvement sought. ' +
        'Shallow = a vague intention with no measurable target.',
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
      descriptorCriteria:
        'Strong = a clear method with the data collection approach AND PDSA cycles described. ' +
        'Adequate = a described approach with some method detail. ' +
        'Shallow = a bare mention of "doing an audit" with no method.',
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
      descriptorCriteria:
        'Strong = who was involved AND how they were engaged, distinguishing personal contribution from collaborative work. ' +
        'Adequate = the people involved named with some sense of how they were engaged. ' +
        'Shallow = a bare mention that others were involved, with no detail.',
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
      descriptorCriteria:
        'Strong = specific findings with key data points or trends, including what did and did not change. ' +
        'Adequate = results stated with some concrete data. ' +
        'Shallow = a vague claim of improvement with no data.',
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
      descriptorCriteria:
        'Strong = specific changes made from the data AND how they were embedded in practice. ' +
        'Adequate = a described change linked to the findings. ' +
        'Shallow = a bare statement that "things changed" with no specifics.',
      description: 'What changes were made based on the data. How they were embedded in practice.',
      promptHint: 'Describe specific changes made and how they were embedded in ongoing practice.',
      extractionQuestion: 'What changes were made as a result of your findings?',
      weight: 0.1,
    },
    {
      id: 'sustainability',
      label: 'Sustainability',
      required: true,
      descriptorCriteria:
        'Strong = a concrete plan for maintaining the change AND who is responsible. ' +
        'Adequate = some plan for how the improvement will continue. ' +
        'Shallow = a bare assertion it will be sustained, with no mechanism or owner.',
      description: 'How changes will be maintained after the project ends. Who is responsible.',
      promptHint: 'Describe how the improvements will be sustained. Who will maintain oversight?',
      extractionQuestion: 'How will these changes be maintained going forward?',
      weight: 0.05,
    },
    {
      id: 'reflection',
      label: 'Reflection & Learning',
      required: true,
      descriptorCriteria:
        'Strong = a specific learning point about the improvement process or working with teams AND how it changes future practice. ' +
        'Adequate = one genuine learning point about the QI experience. ' +
        'Shallow = a bare verdict on the project with no learning.',
      description:
        'What the trainee learned about improvement methodology, working with teams, and their own development.',
      promptHint:
        "Reflect on the QI process itself — what worked, what you'd change, and what you learned about leading improvement.",
      extractionQuestion:
        'What did you learn about the improvement process? What would you do differently?',
      weight: 0.2,
    },
  ]),
};

// ---------------------------------------------------------------------------
// Template 7: QIA (Quality Improvement Activity)
// Used by: QI_ACTIVITY
// ---------------------------------------------------------------------------
export const QIA_TEMPLATE: ArtefactTemplate = {
  id: 'QIA_TEMPLATE',
  name: 'Quality Improvement Activity',
  wordCountRange: { min: 200, max: 400 },
  sections: flatSections([
    {
      id: 'title_context',
      label: 'Title & Context',
      required: true,
      descriptorCriteria:
        'Strong = the activity, the setting, AND the quality issue that prompted it, clearly stated. ' +
        'Adequate = the activity described with some context for why it was chosen. ' +
        'Shallow = a bare title with no context or trigger.',
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
      descriptorCriteria:
        'Strong = a specific goal AND the improvement targeted, clearly stated. ' +
        'Adequate = a stated aim with some sense of the intended improvement. ' +
        'Shallow = a vague intention with no clear goal.',
      description: 'The specific goal of the activity. What improvement was targeted.',
      promptHint: 'State clearly what you were trying to improve and why.',
      extractionQuestion: 'What were you trying to achieve?',
      weight: 0.15,
    },
    {
      id: 'engagement',
      label: 'How Did You Engage With Others',
      required: true,
      descriptorCriteria:
        'Strong = who was involved AND how the trainee collaborated with them in planning and delivery. ' +
        'Adequate = others named with some sense of how they worked together. ' +
        'Shallow = a bare mention that others were involved.',
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
      descriptorCriteria:
        'Strong = the changes actually made AND the resulting improvement, with evidence of impact. ' +
        'Adequate = a described change with some sense of its effect. ' +
        'Shallow = a bare claim that something changed, with no result.',
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
      descriptorCriteria:
        'Strong = a specific insight using maintain/improve/stop AND what they will do differently. ' +
        'Adequate = a genuine reflection identifying at least one thing to maintain, improve, or stop. ' +
        'Shallow = a bare verdict on the activity with no actionable learning.',
      description:
        'What worked well (maintain), what could be better (improve), what should be stopped.',
      promptHint: 'Reflect using the framework: What will I maintain, improve, or stop?',
      extractionQuestion: 'Reflecting on this activity, what would you maintain, improve, or stop?',
      weight: 0.25,
    },
  ]),
};

// ---------------------------------------------------------------------------
// Template 8: Prescribing
// Used by: PRESCRIBING
// ---------------------------------------------------------------------------
export const PRESCRIBING_TEMPLATE: ArtefactTemplate = {
  id: 'PRESCRIBING_TEMPLATE',
  name: 'Prescribing Assessment',
  wordCountRange: { min: 200, max: 400 },
  sections: flatSections([
    {
      id: 'prescribing_context',
      label: 'Prescribing Context',
      required: true,
      descriptorCriteria:
        'Strong = the scope of the review with number of prescriptions, setting, AND period covered. ' +
        'Adequate = the review context with some of these details. ' +
        'Shallow = a bare mention of reviewing prescriptions with no scope.',
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
      descriptorCriteria:
        'Strong = specific prescribing patterns named — drug classes or clinical scenarios — AND any habits noticed. ' +
        'Adequate = some patterns identified with a little detail. ' +
        'Shallow = a vague statement that patterns existed, with no specifics.',
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
      descriptorCriteria:
        'Strong = specific errors or near-misses identified AND what happened and why (or an honest, reasoned statement that none were found). ' +
        'Adequate = an error or near-miss noted with some detail. ' +
        'Shallow = a bare "no errors" with no evidence of having looked.',
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
      descriptorCriteria:
        'Strong = a self-assessment against specific prescribing proficiencies, naming both strengths AND development needs. ' +
        'Adequate = some honest assessment against the proficiencies. ' +
        'Shallow = a bare claim of competence with no reference to the proficiencies.',
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
      descriptorCriteria:
        'Strong = a specific learning point about their prescribing practice AND how it changes future practice. ' +
        'Adequate = one genuine learning point about their prescribing. ' +
        'Shallow = a bare verdict with no learning.',
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
      descriptorCriteria:
        'Strong = specific, concrete actions to improve prescribing, time-bound where possible. ' +
        'Adequate = at least one concrete development action stated. ' +
        'Shallow = a vague intention to "do better" with no specific action.',
      description:
        'Specific actions to improve prescribing. May include a Prescribing PDP if needed.',
      promptHint:
        'Detail specific actions to improve your prescribing. Make them concrete and time-bound.',
      extractionQuestion: 'What specific steps will you take to improve your prescribing?',
      weight: 0.1,
    },
  ]),
};
