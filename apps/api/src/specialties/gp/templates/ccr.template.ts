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
      'Adequate = at least one CONCRETE management action the trainee took or planned — specific analgesia or activity advice, an investigation, a referral, explicit safety-netting instructions given, or a defined follow-up/review — even if the rationale is thin. ' +
      'Shallow = a vague gesture at a plan ("treated and reviewed"), OR generic explanation/reassurance with no concrete clinical action, OR a reflective remark that management was inadequate (e.g. "I should have safety-netted better") without stating what was actually done.',
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
      'Adequate = the outcome stated with some detail; OR, for a self-limiting presentation with no planned follow-up, an explicit statement that no follow-up was required and (where known) the patient did not re-present — a reasoned "assumed resolved" counts. ' +
      'Shallow = a bare verdict ("patient was fine") with no results, current status, or — where follow-up was expected — any account of what happened.',
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
      // Synthesise the five factual probes into one flowing vignette. The Brief
      // Description exists to set up the reflection (RCGP: 3–5 sentences, context
      // not a full case presentation), so a single call that sees the whole is
      // what keeps it tight — concatenating the probes independently cannot.
      composePrompt:
        'Combine the probes into one flowing case vignette of at most 5 sentences, in ' +
        'this order: presentation → clinical findings → clinical reasoning → management → ' +
        'outcome. It exists only to give enough context for the reflection that follows, ' +
        'so keep it tight and factual — context, not a full case presentation. Omit any ' +
        'probe with no content. Add nothing that is not already in the probes. ' +
        "When tightening, preserve the STRENGTH and MODALITY of the trainee's clinical " +
        'reasoning and evaluative judgements: do NOT weaken an assertive clinical stance ' +
        'into a tentative one (e.g. "you have to assume a GI cause until proven otherwise" ' +
        'must NOT become "prompting me to consider a GI cause"), and do not drop the ' +
        'reasoning that discriminated between differentials. Compress wording, never the ' +
        'force of the judgement.',
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
          requiresStatedIntent: true,
          descriptorCriteria:
            'A learning need (a DEN — Doctor\'s Educational Need) is a knowledge or skill gap the case revealed, closed by a LEARNING ACTIVITY: reading, studying, looking it up, a course/module, asking or sitting in with a colleague, discussing with a trainer, or a PDP goal. A plan to do something differently in practice that the trainee already knew how to do (e.g. "I\'ll always ask about X", "I\'ll safety-net better") is a REFLECTION action, not a learning need. ' +
            'Strong = names a specific knowledge/skill gap AND a concrete learning activity to close it (a specific resource, course, or linked learning entry). ' +
            'Adequate = names a specific gap AND an explicitly STATED intent to LEARN — a forward-looking direction to read, study, look up, discuss, or otherwise acquire the missing knowledge/skill — even if the plan is not yet concrete. ' +
            'Shallow = a retrospective EVALUATION with no plan to learn ("the real gap was the prescribing decision", "I should have safety-netted better"); OR only a BEHAVIOURAL practice change with no learning activity ("I\'ll always ask about access to means from now on") — that is reflection, not a learning need; OR a vague, generic gap ("read more around the topic") with no specific need.',
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
