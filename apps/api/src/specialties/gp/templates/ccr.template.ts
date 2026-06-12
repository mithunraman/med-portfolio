import { ArtefactTemplate, Probe } from '@acme/shared';

// ---------------------------------------------------------------------------
// CCR (Clinical Case Review)
// Used by: CLINICAL_CASE_REVIEW, OUT_OF_HOURS
// ---------------------------------------------------------------------------
// CCR uses a true hierarchy: the five factual probes compose into one "Brief
// description" document field, matching the FourteenFish form, while the granular
// probes still drive targeted questions and per-dimension scoring.
const CCR_BRIEF_DESCRIPTION_PROBES: Probe[] = [
  {
    id: 'presentation',
    label: 'Clinical Presentation',
    required: true,
    descriptorCriteria:
      'Strong = an anonymised, situated picture of the patient (age, gender, setting) AND a specific presenting complaint with the relevant history and context that frames the consultation. ' +
      'Adequate = the patient and presenting complaint stated with some context. ' +
      'Shallow = a bare one-line mention of a symptom with no demographics, setting, or history.',
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
    weight: 0.05,
  },
  {
    id: 'clinical_reasoning',
    label: 'Clinical Reasoning',
    required: true,
    threshold: 'strong',
    descriptorCriteria:
      'Strong = names specific differentials AND the reasoning that discriminated between them (what pointed toward the working diagnosis, what was ruled out and why). ' +
      'Adequate = a diagnosis with some justification. ' +
      'Shallow = a bare diagnosis label with no reasoning.',
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
    descriptorCriteria:
      "Strong = the trainee's own specific actions (treatment started, investigations ordered, referrals, safety-netting, planned follow-up) AND the rationale behind each decision. " +
      'Adequate = a management plan stated with some justification. ' +
      'Shallow = a vague gesture at a plan ("treated and reviewed") with no specific actions or reasoning.',
    description:
      'Treatment the trainee gave or started, investigations they ordered, referrals they made, safety-netting advice, and the follow-up they themselves planned.',
    promptHint:
      "Detail the trainee's own management plan and the rationale behind each decision. Include only what the trainee personally did or planned. Investigation results that came back later, how the patient responded, and actions taken by other teams (e.g. a specialist clinic starting a drug) belong in Patient Outcome — do not place them here.",
    extractionQuestion: 'What management plan did you put in place?',
    weight: 0.15,
  },
  {
    id: 'outcome',
    label: 'Patient Outcome',
    required: true,
    descriptorCriteria:
      "Strong = a specific account of what happened after management (investigation results, how the patient responded, actions by other teams) AND the patient's current status. " +
      'Adequate = the outcome stated with some detail. ' +
      'Shallow = a bare verdict ("patient was fine") with no results or current status.',
    description:
      "What happened after the initial management: investigation results, how the patient responded, actions taken by other clinicians or services, and the patient's current status.",
    promptHint:
      "Describe results that came back, the patient's response, subsequent actions by other teams, and where things stand now. Do not restate the trainee's own management plan already covered in Management & Actions — only add what happened as a result.",
    extractionQuestion: 'What was the outcome for this patient?',
    weight: 0.1,
  },
];

export const CCR_TEMPLATE: ArtefactTemplate = {
  id: 'CCR_TEMPLATE',
  name: 'Clinical Case Review',
  wordCountRange: { min: 150, max: 300 },
  sections: [
    {
      id: 'brief_description',
      label: 'Brief Description',
      order: 0,
      required: true,
      probes: CCR_BRIEF_DESCRIPTION_PROBES,
    },
    {
      id: 'reflection',
      label: 'Reflection',
      order: 1,
      required: true,
      probes: [
        {
          id: 'reflection',
          label: 'Reflection',
          required: true,
          threshold: 'strong',
          descriptorCriteria:
            'Strong = identifies what went well and/or less well AND why, framed as concrete actions to maintain, improve, or stop in future practice. ' +
            'Adequate = one genuine evaluative point with some forward-looking action. ' +
            'Shallow = a bare verdict with no evaluation ("it went ok", "nothing I would change").',
          description:
            'Evaluation of how the case was handled: what went well and what could be improved, and why, expressed as what to maintain, improve, or stop. Should demonstrate critical thinking, not just description.',
          promptHint:
            'Reflect on how you handled the case. Address: What will I maintain, improve, or stop, and why?',
          extractionQuestion: 'Looking back, what would you maintain, improve, or stop, and why?',
          weight: 0.25,
        },
      ],
    },
    {
      // Learning needs (DENs — Doctor's Educational Needs) are a distinct field on the
      // FourteenFish CCR form, so they get their own output section — rendered as a
      // separate copy-paste block. Made compulsory here as a deliberate coaching choice:
      // the section is required (always rendered) and its probe is assessable, so it is
      // tier-graded and gates completeness — the follow-up loop will ask for a learning
      // need if one is missing or vague. (Note: this is stricter than the RCGP minimum,
      // which does not require a learning need on every entry.) Effective threshold is
      // 'adequate' (no `threshold` set), so a genuine, specific need clears the gate.
      id: 'learning',
      label: 'Learning Needs',
      order: 2,
      required: true,
      probes: [
        {
          id: 'learning_needs',
          label: 'Learning Needs',
          required: true,
          descriptorCriteria:
            'Strong = names a specific educational gap (DEN) the case revealed AND a concrete plan to address it (a topic to study, a skill to practise, or a linked learning entry). ' +
            'Adequate = a genuine, specific learning need identified. ' +
            'Shallow = a vague or generic gap ("read more around the topic") with no specific need or plan.',
          description:
            'A specific educational gap (DEN) the case revealed, and how it will be addressed — e.g. a topic to read up on or a follow-up learning entry.',
          promptHint:
            'Name the specific knowledge or skill gap this case revealed, and how you will address it.',
          extractionQuestion:
            'What specific learning need did this case highlight, and how will you address it?',
          weight: 0.1,
        },
      ],
    },
  ],
};
