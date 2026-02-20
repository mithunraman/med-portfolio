# Artefact Templates

8 unique templates for 10 entry types. Each template defines the sections required for a complete portfolio entry, what the trainee needs to provide, and how the app generates and checks content.

Template mapping:
- `CLINICAL_CASE_REVIEW` → CCR Template
- `OUT_OF_HOURS` → CCR Template (reused)
- `SIGNIFICANT_EVENT` → SEA Template
- `LEARNING_EVENT` → LEA Template
- `ACADEMIC_ACTIVITY` → LEA Template (reused)
- `FEEDBACK_REFLECTION` → Feedback Template
- `LEADERSHIP_ACTIVITY` → Leadership Template
- `QI_PROJECT` → QIP Template
- `QI_ACTIVITY` → QIA Template
- `PRESCRIBING` → Prescribing Template

---

## Section field reference

Each section in a template uses this structure:

```
id:                  Unique identifier for the section
label:               Human-readable heading (shown in generated entry)
required:            Whether this section must be present for ARCP
description:         What this section should contain (used by LLM for generation)
promptHint:          Instruction for the LLM when writing this section
extractionQuestion:  What to ask the trainee if this section's info is missing
weight:              Relative importance for quality scoring (all weights in a template sum to 1.0)
```

---

## Template 1: CCR (Clinical Case Review)

_Used by: CLINICAL_CASE_REVIEW, OUT_OF_HOURS_

The workhorse entry. 36 required per year. Must be about a real patient the trainee personally saw. For OUT_OF_HOURS entries, the same structure applies but in an urgent/unscheduled care setting.

| id | label | required | description | promptHint | extractionQuestion | weight |
|----|-------|----------|-------------|------------|-------------------|--------|
| `presentation` | Clinical Presentation | yes | Patient demographics (anonymised), presenting complaint, relevant history, context of consultation | Describe the clinical scenario concisely. Include age, gender, setting, and presenting complaint. Keep anonymised. | Can you describe the patient and what they presented with? | 0.15 |
| `clinical_findings` | Clinical Findings | no | Examination findings, investigation results, observations | Summarise relevant positive and negative findings | What did you find on examination or investigation? | 0.10 |
| `clinical_reasoning` | Clinical Reasoning | yes | Differential diagnosis considered, why the working diagnosis was reached, what was considered and ruled out | Explain the thought process behind the diagnosis. Include what was considered and why alternatives were excluded. | What differentials did you consider, and what led you to your working diagnosis? | 0.20 |
| `management` | Management & Actions | yes | Treatment given, investigations ordered, referrals made, safety-netting advice, follow-up plan | Detail the management plan and the rationale behind each decision | What management plan did you put in place? | 0.15 |
| `outcome` | Patient Outcome | yes | What happened to the patient, follow-up results, resolution or ongoing plan | Describe how the patient responded and any follow-up | What was the outcome for this patient? | 0.10 |
| `reflection` | Reflection & Learning | yes | What went well, what could be improved, what was learned, how this changes future practice. Should demonstrate critical thinking, not just description. | Reflect on personal learning and impact on future practice. Address: What will I maintain, improve, or stop? | What did you learn from this case, and would you do anything differently? | 0.25 |
| `ethical_legal` | Ethical / Legal Considerations | no | Consent, capacity, confidentiality, safeguarding concerns if relevant | Note any ethical, legal, or safeguarding dimensions if applicable | _(not asked — only included if naturally present)_ | 0.05 |

**Quality standard:** A good CCR demonstrates critical thinking and analysis (not just description), self-awareness, and evidence of learning with concrete plans for practice change.

**Minimum requirements:** 36 per year. Should cover a range of patient types and clinical settings. Must link to relevant capabilities with justification.

---

## Template 2: SEA (Significant Event Analysis)

_Used by: SIGNIFICANT_EVENT_

Required when an event meets the GMC threshold for harm. At least 1 per 6 months. Must demonstrate root cause analysis and systemic change, not just personal reflection.

| id | label | required | description | promptHint | extractionQuestion | weight |
|----|-------|----------|-------------|------------|-------------------|--------|
| `event_description` | What Happened | yes | Factual, chronological, anonymised account of the event. Who was involved, what occurred, when and where. | Describe the event objectively and chronologically without judgment. Keep anonymised. | Can you walk me through exactly what happened? | 0.15 |
| `what_went_well` | What Went Well | yes | Aspects of the situation that were handled correctly. Good practice that should be maintained. | Identify positive aspects — what was done correctly, what worked | Was there anything that was handled well during this event? | 0.10 |
| `what_could_improve` | What Could Have Been Done Differently | yes | Honest assessment of where things went wrong or could have been better. Specific, not vague. | Describe specific actions or decisions that could have been different. Avoid vague generalisations. | Looking back, is there anything you or the team could have done differently? | 0.15 |
| `root_cause` | Why It Happened | yes | Root cause analysis — system factors, human factors, communication breakdown, resource issues. Not about blaming individuals. | Analyse the contributing factors. Consider system issues, communication, workload, knowledge gaps. Avoid individual blame. | What do you think contributed to this happening? Were there any system or team factors? | 0.20 |
| `impact` | Impact | yes | Effect on the patient, the trainee, the team, and/or the wider system | Describe the consequences honestly — for the patient, yourself, and the team | What was the impact on the patient and/or your team? | 0.10 |
| `changes_made` | Changes Made | yes | Concrete actions taken or proposed — protocols changed, guidelines reviewed, team briefings, new processes. Must be specific. | Detail specific changes implemented or planned. Include who is responsible and timelines. | What has been done or changed as a result of this event? | 0.20 |
| `personal_learning` | Personal Learning | yes | What the trainee personally took away. How it shapes their practice going forward. Link to professional development. | Connect to personal professional development. Address: What will I maintain, improve, or stop? | What did you personally take away from this experience? | 0.10 |

**Quality standard:** A good SEA has honest root cause analysis (not superficial), demonstrates team discussion where possible, shows concrete systemic changes (not just "I will be more careful"), and links to professional development.

**Key distinction from LEA:** The event met the GMC threshold for harm (actual harm occurred, or a serious near-miss). If no harm occurred, it should be an LEA instead.

---

## Template 3: LEA (Learning Event Analysis)

_Used by: LEARNING_EVENT, ACADEMIC_ACTIVITY_

At least 1 per training year. For events that present a learning opportunity but didn't cause GMC-threshold harm. For ACADEMIC_ACTIVITY entries, the same structure applies but the trigger is an academic event (research, teaching, journal club, literature review).

| id | label | required | description | promptHint | extractionQuestion | weight |
|----|-------|----------|-------------|------------|-------------------|--------|
| `event_description` | What Happened | yes | Description of the event or learning opportunity. What occurred, who was involved, the setting. | Describe the event or learning opportunity concisely. Include context and setting. | Can you describe what happened or what the learning opportunity was? | 0.15 |
| `learning_opportunity` | Why This Was a Learning Opportunity | yes | What made this event notable. What could have gone differently. Why it matters for professional development. | Explain why this event is significant for learning. What could have gone wrong, or what insight did it offer? | What made this event stand out as a learning opportunity? | 0.20 |
| `what_learned` | What Was Learned | yes | Specific knowledge, skills, or attitudes gained. Link to evidence or guidelines where relevant. | Describe concrete learning points. Reference relevant guidelines or evidence if applicable. | What specifically did you learn from this? | 0.25 |
| `application` | Application to Practice | yes | How this learning will change or has changed the trainee's practice. Specific, not generic. | Describe how this learning applies to your day-to-day practice. Be specific about what will change. | How will this change your practice going forward? | 0.25 |
| `team_sharing` | Team Sharing | no | Whether and how the learning was shared with the team. Evidence of collaborative learning. | Note if and how this learning was shared with colleagues or the wider team. | Did you share this learning with your team? | 0.05 |
| `evidence_of_change` | Evidence of Change | no | Concrete examples showing the learning has been applied. Linked entries, follow-up cases, etc. | If applicable, describe specific examples where you've applied this learning since. | Can you give an example of how you've applied this learning since? | 0.10 |

**Quality standard:** A good LEA goes beyond description to analyse why the event matters and demonstrates concrete application to practice. Should show reflective depth.

**Key distinction from SEA:** No GMC-threshold harm occurred. If harm occurred, it should be an SEA instead.

---

## Template 4: Feedback Reflection

_Used by: FEEDBACK_REFLECTION_

Required after each feedback cycle (MSF, PSQ, exam results). Demonstrates the trainee can receive feedback constructively and act on it.

| id | label | required | description | promptHint | extractionQuestion | weight |
|----|-------|----------|-------------|------------|-------------------|--------|
| `feedback_source` | Feedback Source | yes | What type of feedback was received (MSF, PSQ, exam results, informal feedback) and when | Identify the feedback source and context. Include when it was received. | What feedback did you receive, and from what source (MSF, PSQ, exam, etc.)? | 0.10 |
| `feedback_summary` | Key Findings | yes | Summary of the main themes, scores, or comments. Both positive and areas for development. | Summarise the key themes honestly. Include strengths as well as areas for improvement. | What were the main points or themes from the feedback? | 0.20 |
| `emotional_response` | Initial Response | no | How the trainee felt receiving the feedback. Demonstrates self-awareness and emotional intelligence. | Reflect honestly on your initial reaction to the feedback. | How did you feel when you first received this feedback? | 0.10 |
| `analysis` | Analysis & Interpretation | yes | What the feedback means in the context of the trainee's development. Areas of agreement/disagreement with the feedback. | Analyse what the feedback tells you about your practice. Where do you agree or disagree, and why? | Do you agree with the feedback? What does it tell you about your development? | 0.25 |
| `action_plan` | Actions Taken or Planned | yes | Specific, concrete steps taken or planned in response to the feedback. Should be SMART where possible. | Detail specific actions you have taken or plan to take in response. Be concrete and time-bound. | What have you done or plan to do in response to this feedback? | 0.25 |
| `follow_up` | Impact & Follow-up | no | Evidence that actions have been taken and their effect. Linked entries or subsequent feedback. | If applicable, describe the impact of changes you've made since receiving the feedback. | Have you noticed any changes since acting on this feedback? | 0.10 |

**Quality standard:** A good feedback reflection demonstrates genuine engagement with the feedback (not defensive dismissal), honest self-assessment, and concrete action planning.

---

## Template 5: Leadership

_Used by: LEADERSHIP_ACTIVITY_

Required in ST3. Must demonstrate leadership, management, or organisational skills in a real workplace context. Assessed against the "Organisation, Management and Leadership" capability (C-11).

| id | label | required | description | promptHint | extractionQuestion | weight |
|----|-------|----------|-------------|------------|-------------------|--------|
| `activity_description` | Activity Description | yes | What the leadership activity was, the context, the trainee's specific role. Examples: chairing a meeting, leading a QI initiative, managing a team conflict, presenting to colleagues, organising a teaching session. | Describe the activity and your specific role within it. Include context and setting. | What was the leadership activity, and what was your role? | 0.15 |
| `rationale` | Rationale | yes | Why this activity was chosen or undertaken. What problem or opportunity it addressed. | Explain why this activity was needed and why you took it on. | Why did you undertake this activity? What need or opportunity did it address? | 0.10 |
| `approach` | Approach & Process | yes | How the trainee approached the activity. Steps taken, people involved, challenges encountered. | Describe your approach step by step. How did you engage others? What challenges arose? | How did you go about it? Who was involved and what challenges did you face? | 0.20 |
| `outcomes` | Outcomes | yes | What was achieved. Impact on the team, patients, or system. Include both successes and limitations. | Describe what was achieved and any measurable impact. Be honest about limitations. | What was the outcome? What impact did it have? | 0.15 |
| `leadership_skills` | Leadership Skills Demonstrated | yes | Specific leadership competencies demonstrated: communication, delegation, decision-making, conflict resolution, change management, teamwork. | Identify which leadership skills you used and how. Link to specific examples from the activity. | What leadership skills did you draw on during this activity? | 0.15 |
| `reflection` | Reflection & Learning | yes | What worked, what didn't, what the trainee learned about themselves as a leader. How they will contribute to team wellbeing in future roles. | Reflect on your leadership approach. What would you do differently? How will this shape your future practice as a leader? | What did you learn about yourself as a leader? | 0.20 |
| `wellbeing` | Team Wellbeing | no | How the activity considered or contributed to colleague wellbeing. | If relevant, note how the activity addressed team wellbeing or morale. | _(not asked — only included if naturally present)_ | 0.05 |

**Quality standard:** A good leadership entry shows genuine leadership initiative (not just participation), demonstrates specific skills, and includes honest reflection on setbacks as learning opportunities.

---

## Template 6: QIP (Quality Improvement Project)

_Used by: QI_PROJECT_

At least 1 required during primary care placements. A structured, sustained project using improvement methodology (typically PDSA cycles). Larger in scope than a QIA.

| id | label | required | description | promptHint | extractionQuestion | weight |
|----|-------|----------|-------------|------------|-------------------|--------|
| `rationale` | Rationale & Problem Statement | yes | Why this topic was chosen. Identified need in the training practice. Brief summary of current evidence/guidance. | Describe the problem identified and why it matters. Reference relevant guidelines or evidence. | What problem did you identify, and why did it matter? | 0.15 |
| `aims` | Aims & Objectives | yes | SMART aims for the project. What improvement was targeted and how it would be measured. | State the project aims using SMART criteria (Specific, Measurable, Achievable, Relevant, Time-defined). | What were you trying to achieve? How would you measure success? | 0.10 |
| `methodology` | Methodology | yes | How the project was conducted. Data collection method, sample size, PDSA cycles used. At least two PDSA cycles expected. | Describe your methodology including data collection approach and PDSA cycles. | How did you go about the project? What methodology did you use? | 0.15 |
| `stakeholders` | Team & Stakeholder Engagement | yes | Who was involved and how they were engaged. Collaborative elements vs personal contribution. | Describe who was involved, how you engaged stakeholders, and what was collaborative vs your personal contribution. | Who did you work with on this, and how did you engage them? | 0.10 |
| `results` | Results & Data | yes | What the data showed. Presented clearly (run charts recommended). Both quantitative and qualitative findings. | Present the results clearly. Include key data points and trends. Note both improvements and areas that didn't change. | What did your data show? | 0.15 |
| `changes` | Changes Implemented | yes | What changes were made based on the data. How they were embedded in practice. | Describe specific changes made and how they were embedded in ongoing practice. | What changes were made as a result of your findings? | 0.10 |
| `sustainability` | Sustainability | yes | How changes will be maintained after the project ends. Who is responsible. | Describe how the improvements will be sustained. Who will maintain oversight? | How will these changes be maintained going forward? | 0.05 |
| `reflection` | Reflection & Learning | yes | What the trainee learned about improvement methodology, working with teams, and their own development. What they would do differently. | Reflect on the QI process itself — what worked, what you'd change, and what you learned about leading improvement. | What did you learn about the improvement process? What would you do differently? | 0.20 |

**Quality standard:** A good QIP demonstrates structured methodology (PDSA), clear data presentation, team engagement, and honest reflection on the process. Must show at least two improvement cycles.

---

## Template 7: QIA (Quality Improvement Activity)

_Used by: QI_ACTIVITY_

At least 1 per training year. Smaller scale than a QIP. A focused, practical improvement activity demonstrating the trainee can identify and act on quality issues.

| id | label | required | description | promptHint | extractionQuestion | weight |
|----|-------|----------|-------------|------------|-------------------|--------|
| `title_context` | Title & Context | yes | What the activity was, the setting, and why it was identified as an improvement opportunity. | Describe the activity and the context that prompted it. | What was the quality improvement activity, and what prompted it? | 0.15 |
| `aims` | What Were You Trying to Accomplish | yes | The specific goal of the activity. What improvement was targeted. | State clearly what you were trying to improve and why. | What were you trying to achieve? | 0.15 |
| `engagement` | How Did You Engage With Others | yes | Who was involved in planning and delivery. How the trainee collaborated with the team. | Describe how you involved others in planning and carrying out the activity. | Who else was involved, and how did you work together? | 0.15 |
| `changes` | What Changes Have Taken Place | yes | What was actually done. What improvements resulted. Include evidence of impact where possible. | Describe the changes that were implemented and their effect. Include evidence if available. | What changes were made, and what was the result? | 0.30 |
| `reflection` | Reflection: Maintain, Improve, or Stop | yes | What worked well (maintain), what could be better (improve), what should be stopped. | Reflect using the framework: What will I maintain, improve, or stop? | Reflecting on this activity, what would you maintain, improve, or stop? | 0.25 |

**Quality standard:** A good QIA is "robust, systematic and relevant" with demonstrable action and measurable change. It should be distinct from a learning analysis — the focus is on doing, not just learning.

---

## Template 8: Prescribing

_Used by: PRESCRIBING_

Required in ST3. Based on a review of 50 consecutive prescriptions, mapped against potential errors and the GP prescribing proficiencies.

| id | label | required | description | promptHint | extractionQuestion | weight |
|----|-------|----------|-------------|------------|-------------------|--------|
| `prescribing_context` | Prescribing Context | yes | The scope of the review: how many prescriptions, which clinical setting, what period. | Describe the prescribing review context — how many prescriptions, over what period, in what setting. | Can you describe the scope of your prescribing review? | 0.10 |
| `patterns_identified` | Patterns Identified | yes | Key patterns in the trainee's prescribing: common drug classes, frequent clinical scenarios, any habits noticed. | Summarise the main patterns in your prescribing. What drug classes and clinical scenarios came up most? | What patterns did you notice in your prescribing? | 0.15 |
| `errors_near_misses` | Errors & Near-Misses | yes | Any prescribing errors or near-misses identified in the review. Honest self-assessment. | Describe any errors or near-misses identified. Be specific about what happened and why. | Did you identify any prescribing errors or near-misses? | 0.20 |
| `proficiencies_assessment` | Proficiencies Self-Assessment | yes | Assessment against the GP prescribing proficiencies: assessing risks/benefits, guideline adherence, antimicrobial stewardship, patient counselling, monitoring. | Reflect on your performance against the prescribing proficiencies. Where are you strong? Where do you need development? | How do you assess yourself against the GP prescribing proficiencies? | 0.20 |
| `guidelines_adherence` | Guideline Adherence | no | How well prescribing aligns with NICE/BNF/local guidelines. Any deviations and justification. | Note how your prescribing aligns with relevant guidelines. Explain any justified deviations. | How well did your prescribing align with guidelines? | 0.10 |
| `reflection` | Reflection & Learning | yes | What the trainee learned about their prescribing practice. Strengths and areas for development. | Reflect on your prescribing practice overall. What are your strengths? What needs development? | What did you learn about your prescribing? | 0.15 |
| `development_plan` | Development Plan | yes | Specific actions to improve prescribing. May include a Prescribing PDP if needed. | Detail specific actions to improve your prescribing. Make them concrete and time-bound. | What specific steps will you take to improve your prescribing? | 0.10 |

**Quality standard:** A good prescribing reflection demonstrates honest self-assessment, references the GP prescribing proficiencies, and includes a concrete development plan. Not pass/fail — the focus is on identifying areas for growth.

---

## Cross-template notes

### Shared reflective framework
All templates use a reflective structure aligned with the RCGP's preferred approach: **"What will I maintain, improve, or stop?"** This is simpler than full Gibbs (Description, Feelings, Evaluation, Analysis, Conclusion, Action Plan) but covers the same ground. The app should generate reflections using this framing.

### Capability linking
All entry types require the trainee to link to relevant RCGP capabilities (C-01 to C-13) with justification. This is handled by the `tag_capabilities` node, not within the templates themselves.

### Word count guidance
- CCR reflection sections: 150-300 words (concise but substantive)
- SEA/LEA full entries: 300-500 words
- QIP entries: 500-800 words (more structured, data-heavy)
- Other types: 200-400 words

### Quality over quantity
The RCGP explicitly states "quality is more important than quantity." Entries should demonstrate critical thinking and self-awareness, not just describe events. The `quality_check` node should assess depth of reflection, not just completeness.

---

## Sources

- [RCGP WPBA Learning Log](https://www.rcgp.org.uk/mrcgp-exams/wpba/learning-log)
- [RCGP WPBA Assessments](https://www.rcgp.org.uk/mrcgp-exams/wpba/assessments)
- [RCGP QIP](https://www.rcgp.org.uk/mrcgp-exams/wpba/qip)
- [RCGP QIA](https://www.rcgp.org.uk/mrcgp-exams/wpba/qia)
- [RCGP Prescribing Assessment](https://www.rcgp.org.uk/mrcgp-exams/wpba/prescribing-assessment)
- [RCGP Leadership Activity & MSF](https://www.rcgp.org.uk/mrcgp-exams/wpba/leadership-msf)
- [RCGP Learning Log Worked Examples](https://www.rcgp.org.uk/getmedia/1635b2eb-ee0f-46a8-a32c-3fb6a14b5ecf/Learning-logs-worked-examples.pdf)
- [Bradford VTS Significant Event Analysis](https://www.bradfordvts.co.uk/quality-improvement/significant-event-analysis/)
- [Bradford VTS Log Entries](https://www.bradfordvts.co.uk/mrcgp/eportfolio/log-entries/)
