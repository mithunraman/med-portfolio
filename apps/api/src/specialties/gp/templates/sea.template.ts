import { ArtefactTemplate, flatSections } from '@acme/shared';

// ---------------------------------------------------------------------------
// SEA (Significant Event Analysis)
// Used by: SIGNIFICANT_EVENT
// ---------------------------------------------------------------------------
export const SEA_TEMPLATE: ArtefactTemplate = {
  id: 'SEA_TEMPLATE',
  name: 'Significant Event Analysis',
  wordCountRange: { min: 300, max: 500 },
  sections: flatSections([
    {
      id: 'event_description',
      label: 'What Happened',
      required: true,
      descriptorCriteria:
        'Strong = a clear chronological, anonymised account stating who was involved, what occurred, when and where, factually and without evaluation. ' +
        'Adequate = a factual account with some sequence and context. ' +
        'Shallow = a vague one-liner that gives no chronology or detail, or that slips into judging what was done.',
      description:
        'Factual, chronological, anonymised account of the event: who was involved, what occurred, when and where. State what was done, but do NOT evaluate whether it was good or bad here — that belongs in What Went Well and What Could Have Been Done Differently.',
      promptHint:
        'Describe the event objectively and chronologically without judgment. State actions; do not praise or critique them. Keep anonymised.',
      extractionQuestion: 'Can you walk me through exactly what happened?',
      weight: 0.15,
    },
    {
      id: 'what_went_well',
      label: 'What Went Well',
      required: true,
      descriptorCriteria:
        'Strong = specific aspects that were handled correctly AND why they represent good practice worth maintaining. ' +
        'Adequate = a genuine positive identified with some substance. ' +
        'Shallow = a generic affirmation ("the team did well") with no specific action, or content that drifts into what went wrong.',
      description:
        'Aspects that were handled correctly and good practice to maintain. Positives only — do NOT include anything that went wrong or could be improved (→ What Could Have Been Done Differently).',
      promptHint:
        'Identify positive aspects only — what was done correctly, what worked. Leave shortcomings to the improvement section.',
      extractionQuestion: 'Was there anything that was handled well during this event?',
      weight: 0.1,
    },
    {
      id: 'what_could_improve',
      label: 'What Could Have Been Done Differently',
      required: true,
      descriptorCriteria:
        'Strong = specific counterfactual actions or decisions that should have been done differently at the time AND what should have happened instead. ' +
        'Adequate = a concrete improvement point identified. ' +
        'Shallow = a vague generalisation ("could have communicated better") with no specific action, or content that slips into causes or changes already made.',
      description:
        'The counterfactual: specific actions or decisions that, in hindsight, should have been done differently at the time. Specific, not vague. Do NOT state the underlying causes of why it happened (→ Why It Happened), and do NOT describe changes actually made since (→ Changes Made).',
      promptHint:
        'Describe specific corrective actions or decisions that should have been different. Stay on "what should have happened", not "why it happened" or "what we changed afterwards". Avoid vague generalisations.',
      extractionQuestion:
        'Looking back, is there anything you or the team could have done differently?',
      weight: 0.15,
    },
    {
      id: 'root_cause',
      label: 'Why It Happened',
      required: true,
      descriptorCriteria:
        'Strong = specific contributing system and human factors (workflow, communication, workload, knowledge gaps) AND how they combined to cause the event, without individual blame. ' +
        'Adequate = a genuine contributing factor identified with some analysis. ' +
        'Shallow = a single surface cause or individual blame ("someone forgot") with no system-level analysis.',
      description:
        'Root cause analysis — the contributing system and human factors that explain WHY it happened (workflow, communication breakdown, alert design, workload, resource issues, knowledge gaps). Causes only: do NOT include the corrective actions you would take (→ What Could Have Been Done Differently) or changes already implemented (→ Changes Made). Not about blaming individuals.',
      promptHint:
        'Analyse only the contributing factors — the "why". Consider system issues, communication, workload, knowledge gaps. Do not list fixes or actions here. Avoid individual blame.',
      extractionQuestion:
        'What do you think contributed to this happening? Were there any system or team factors?',
      weight: 0.2,
    },
    {
      id: 'impact',
      label: 'Impact',
      required: true,
      descriptorCriteria:
        'Strong = the concrete effect on the patient AND on the trainee, team, or wider system, stated honestly. ' +
        'Adequate = a genuine consequence identified for at least one party. ' +
        'Shallow = a bare claim of no harm ("no harm came of it") with no honest consideration of effects.',
      description: 'Effect on the patient, the trainee, the team, and/or the wider system.',
      promptHint: 'Describe the consequences honestly — for the patient, yourself, and the team.',
      extractionQuestion: 'What was the impact on the patient and/or your team?',
      weight: 0.1,
    },
    {
      id: 'changes_made',
      label: 'Changes Made',
      required: true,
      descriptorCriteria:
        'Strong = concrete actions actually taken or formally proposed since the event AND who is responsible with timelines. ' +
        'Adequate = a specific change described with some detail. ' +
        'Shallow = a vague or hypothetical "should" with no concrete action, owner, or timeline.',
      description:
        'Concrete actions actually taken or formally proposed SINCE the event — protocols changed, guidelines reviewed, team briefings, new processes — with who is responsible and timelines. Must be specific. Do NOT include hypothetical "should haves" (→ What Could Have Been Done Differently) or personal mindset takeaways (→ Personal Learning).',
      promptHint:
        'Detail specific changes already implemented or formally planned, with owner and timeline. Not hypothetical improvements, not personal reflections.',
      extractionQuestion: 'What has been done or changed as a result of this event?',
      weight: 0.2,
    },
    {
      id: 'personal_learning',
      label: 'Personal Learning',
      required: true,
      descriptorCriteria:
        "Strong = a specific personal mindset shift or habit AND how it shapes the trainee's own practice going forward. " +
        'Adequate = one genuine personal learning point. ' +
        'Shallow = a generic takeaway ("I\'ll be more careful") with no personal growth, or a restatement of system changes.',
      description:
        'What the trainee personally took away — the mindset shift or personal habit that shapes their own practice going forward. Link to professional development. Do NOT restate the concrete system/practice changes (→ Changes Made); keep this to personal growth.',
      promptHint:
        'Connect to personal professional development — your own growth, not system changes. Address: What will I maintain, improve, or stop?',
      extractionQuestion: 'What did you personally take away from this experience?',
      weight: 0.1,
    },
  ]),
};
