import { ArtefactTemplate, flatSections } from '@acme/shared';

// ---------------------------------------------------------------------------
// LEA / SEA (Learning Event Analysis / Significant Event)
// Used by: LEARNING_EVENT, SIGNIFICANT_EVENT
// ---------------------------------------------------------------------------
// On the RCGP/FourteenFish ePortfolio these are a SINGLE combined log tool —
// "Learning Event Analysis/Significant Event" — not two separate entries. This
// template mirrors that one form (RCGP WPBA Learning-logs-worked-examples PDF),
// field-for-field, so the rendered entry pastes straight into the ePortfolio.
//
// The Learning-vs-Significant distinction is a GMC HARM THRESHOLD, not a
// different form: a Learning Event did NOT reach the threshold for harm but was
// a learning opportunity; a Significant Event "could or did lead to harm of one
// or more patients" (GMC) and must additionally be reported for revalidation
// (Form R / SOAR). On the live form, answering the threshold question "Yes"
// reveals extra boxes (how it was identified, how it made you feel).
//
// We have no conditional-field mechanism, so the Significant-Event-only fields
// are modelled as OPTIONAL probes (`required: false`): they never gate
// completeness and are never asked as follow-ups, and the reflect node drops
// them when empty — so they stay invisible for a no-harm LEA and light up only
// when the trainee actually describes harm/impact. That reproduces the form's
// "extra boxes appear if Yes" behaviour with the mechanism the repo already has.
// (If a hard severity gate is ever needed — flipping these to required for true
// SEAs — that branch belongs upstream in classification, via the separate
// SIGNIFICANT_EVENT entry type, not inside a static template.)
//
// Flat (one probe → one field): unlike CCR's single composed "Brief
// description", the FourteenFish LEA/SEA form has a separate box per question,
// so each field maps 1:1 to a probe.
//
// `threshold: 'strong'` is used sparingly, for the two assessment-critical
// probes the GMC singles out — the root-cause analysis ("why did it happen")
// and the reflection — since "reflection should focus on insight and learning
// and resulting changes to practice, not the facts or the number recorded".
export const LEA_SEA_TEMPLATE: ArtefactTemplate = {
  id: 'LEA_SEA_TEMPLATE',
  name: 'Learning Event Analysis / Significant Event',
  // A no-harm LEA sits at the lower end; a full Significant Event (with the
  // optional impact/emotional fields populated) at the upper end.
  wordCountRange: { min: 250, max: 450 },
  sections: flatSections([
    {
      id: 'event_description',
      label: 'What Happened',
      required: true,
      descriptorCriteria:
        'Strong = a clear, anonymised, chronological account of what occurred AND the ' +
        "trainee's own role in it, factually and without evaluation. " +
        'Adequate = a factual account with some sequence, context, and the role stated. ' +
        'Shallow = a vague one-liner with no chronology or role, or one that slips into ' +
        'judging what was done.',
      description:
        "Factual, chronological, anonymised account of the event and the trainee's own " +
        'role in it: what occurred, who was involved, when and where. State what was ' +
        'done, but do NOT evaluate whether it was good or bad here — that belongs in ' +
        'What Was Done Well and What Could Be Done Differently.',
      promptHint:
        'Describe the event objectively and chronologically, including your own role. ' +
        'State actions; do not praise or critique them yet. Keep anonymised.',
      extractionQuestion: 'Can you walk me through what happened, and what your role was?',
      weight: 0.1,
    },
    {
      id: 'why_it_happened',
      label: 'Why It Happened',
      required: true,
      threshold: 'strong',
      descriptorCriteria:
        'Strong = specific contributing system and human factors (workflow, ' +
        'communication, workload, knowledge gaps, alert design) AND how they combined to ' +
        'cause the event, analysed without individual blame. ' +
        'Adequate = a genuine contributing factor identified with some analysis. ' +
        'Shallow = a single surface cause or individual blame ("someone forgot") with no ' +
        'system-level analysis.',
      description:
        'Root-cause analysis — the contributing system and human factors that explain WHY ' +
        'it happened (workflow, communication breakdown, workload, resource issues, ' +
        'knowledge gaps), using a no-blame approach. Causes only: do NOT list the ' +
        'corrective actions (→ What Could Be Done Differently) or changes already made ' +
        '(→ Changes Made). Not about blaming individuals.',
      promptHint:
        'Analyse only the contributing factors — the "why". Consider system issues, ' +
        'communication, workload, and knowledge gaps. Do not list fixes here, and avoid ' +
        'individual blame.',
      extractionQuestion:
        'Why do you think this happened? Were there any system or team factors involved?',
      weight: 0.18,
    },
    {
      id: 'what_went_well',
      label: 'What Was Done Well',
      required: true,
      descriptorCriteria:
        'Strong = specific aspects that were handled correctly, including the ' +
        "trainee's own involvement, AND why they represent good practice worth " +
        'maintaining. ' +
        'Adequate = a genuine positive identified with some substance. ' +
        'Shallow = a generic affirmation ("the team did well") with no specific action, ' +
        'or content that drifts into what went wrong.',
      description:
        'Aspects that were handled correctly and good practice to maintain, including the ' +
        "trainee's own personal involvement. Positives only — do NOT include anything " +
        'that went wrong or could be improved (→ What Could Be Done Differently).',
      promptHint:
        'Identify positive aspects only — what was done correctly, and your own part in ' +
        'it. Leave shortcomings to the improvement section.',
      extractionQuestion:
        'Was there anything that was handled well, and what was your part in it?',
      weight: 0.07,
    },
    {
      id: 'what_could_improve',
      label: 'What Could Be Done Differently',
      required: true,
      descriptorCriteria:
        'Strong = specific counterfactual actions or decisions that should have been done ' +
        'differently at the time AND what should have happened instead, including the ' +
        "trainee's own involvement. " +
        'Adequate = a concrete improvement point identified. ' +
        'Shallow = a vague generalisation ("could have communicated better") with no ' +
        'specific action, or content that slips into causes or changes already made.',
      description:
        'The counterfactual: specific actions or decisions that, in hindsight, should have ' +
        "been done differently at the time, including the trainee's own. Specific, not " +
        'vague. Do NOT state the underlying causes (→ Why It Happened) or changes actually ' +
        'made since (→ Changes Made).',
      promptHint:
        'Describe specific corrective actions or decisions that should have been ' +
        'different, including your own. Stay on "what should have happened", not "why" or ' +
        '"what we changed afterwards". Avoid vague generalisations.',
      extractionQuestion:
        'Looking back, is there anything you or the team could have done differently?',
      weight: 0.1,
    },
    {
      // Evidence of collaborative, no-blame discussion — the analytical core of a
      // good SEA per RCGP. Optional: a short factual field that should be rendered
      // when given but should never gate completeness or trigger a follow-up.
      id: 'who_involved',
      label: 'Who Was Involved in the Discussion',
      required: false,
      description:
        'Who the event was discussed with — the team, colleagues, or the educational/' +
        'clinical supervisor (ES/CS). Evidence of a collaborative, no-blame discussion.',
      promptHint:
        'Note who you discussed this event with (team, colleagues, ES/CS) and the nature ' +
        'of that discussion.',
      extractionQuestion: 'Who did you discuss this event with?',
      weight: 0.03,
    },
    {
      id: 'team_learning',
      label: 'What You and the Team Learnt',
      required: true,
      descriptorCriteria:
        'Strong = specific knowledge, skills, or attitudes gained by the trainee and/or ' +
        'team AND a link to relevant evidence, guidelines, or wider practice. ' +
        'Adequate = a concrete learning point stated. ' +
        'Shallow = a vague claim of having learnt something with no specific knowledge or ' +
        'skill named.',
      description:
        'Specific knowledge, skills, or attitudes that the trainee and the team gained ' +
        'from the event. Link to evidence or guidelines where relevant.',
      promptHint:
        'Describe concrete learning points for you and the team. Reference relevant ' +
        'guidelines or evidence if applicable.',
      extractionQuestion: 'What did you and the team learn from this?',
      weight: 0.15,
    },
    {
      id: 'changes_made',
      label: 'Changes Made',
      required: true,
      descriptorCriteria:
        'Strong = concrete actions actually taken or formally proposed since the event ' +
        '(by the trainee or the organisation) AND who is responsible, with timelines or ' +
        'monitoring. ' +
        'Adequate = a specific change described with some detail. ' +
        'Shallow = a vague or hypothetical "should" with no concrete action, owner, or ' +
        'timeline.',
      description:
        'Concrete changes actually made or formally planned SINCE the event, as a ' +
        'consequence of this learning — by the trainee or the organisation (protocols ' +
        'changed, processes added, team briefings) — with who is responsible and how it ' +
        'is monitored. Do NOT include hypothetical "should haves" (→ What Could Be Done ' +
        'Differently).',
      promptHint:
        'Detail specific changes already implemented or formally planned, by you or the ' +
        'practice, with owner and timeline. Not hypothetical improvements.',
      extractionQuestion:
        'What changes have you or the organisation made as a result of this event?',
      weight: 0.15,
    },
    {
      // The standard RCGP reflective prompt, graded against the capability word
      // descriptors. The GMC centres SEA/LEA assessment on insight + change, so
      // this is one of the two strong-gated probes.
      id: 'reflection',
      label: 'Reflection',
      required: true,
      threshold: 'strong',
      descriptorCriteria:
        'Strong = genuine insight into the trainee\'s own practice AND a concrete forward ' +
        'commitment framed as what to maintain, improve, or stop, and why. ' +
        'Adequate = one genuine evaluative point with some forward-looking action. ' +
        'Shallow = a bare verdict with no evaluation ("it went ok", "nothing I would ' +
        'change").',
      description:
        'The standard RCGP reflective prompt — "what will I maintain, improve, or stop?" — ' +
        'demonstrating insight into the trainee\'s own practice and how it will change, ' +
        'not just description. Personal growth, distinct from the system changes in ' +
        'Changes Made.',
      promptHint:
        'Reflect on what this means for your own practice. Address: what will I maintain, ' +
        'improve, or stop, and why?',
      extractionQuestion: 'Looking back, what will you maintain, improve, or stop, and why?',
      weight: 0.15,
    },
    {
      // Significant-Event-only: the harm/impact that takes an event over the GMC
      // threshold, plus how it came to light. Optional, so it stays empty (and
      // is dropped from the rendered entry) for a no-harm Learning Event and
      // populates only when the trainee describes actual or potential harm.
      id: 'significant_event_impact',
      label: 'Impact (Significant Event)',
      required: false,
      description:
        'For events that reached the threshold of significant harm: the actual or ' +
        'potential harm to the patient and the effect on others involved (carer, family, ' +
        'trainee, team, practice), and how the event was identified. Leave empty for a ' +
        'no-harm learning event.',
      promptHint:
        'If the event caused or could have caused harm to a patient, describe that impact ' +
        'honestly — on the patient and on those involved — and how it came to light.',
      extractionQuestion:
        'Did this event cause, or could it have caused, harm to a patient? What was the ' +
        'impact, and how was it identified?',
      weight: 0.04,
    },
    {
      // Maps the FourteenFish "how did this make you feel?" box and the Enhanced
      // SEA personal/emotional phase. Optional for the same reason as above.
      id: 'emotional_impact',
      label: 'Personal & Emotional Impact',
      required: false,
      description:
        'How being involved in the event affected the trainee personally and emotionally. ' +
        'Most relevant for a significant event; leave empty if not applicable.',
      promptHint:
        'If relevant, describe honestly how this event made you feel and how you have ' +
        'processed it.',
      extractionQuestion: 'How did being involved in this event affect you?',
      weight: 0.03,
    },
  ]),
};
