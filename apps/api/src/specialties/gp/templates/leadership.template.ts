import { ArtefactTemplate, flatSections } from '@acme/shared';

// ---------------------------------------------------------------------------
// Leadership, Management & Professionalism
// Used by: LEADERSHIP_ACTIVITY
// ---------------------------------------------------------------------------
// This is the RCGP WPBA learning log for documenting and reflecting on a
// leadership, management, or professionalism activity. In ST3 it is tied to a
// MANDATORY Leadership Activity — a discrete piece of leading change within the
// practice, agreed in advance with the ES/CS. Canonical examples: a "fresh pair
// of eyes" review, chairing a meeting, a wellbeing project, creating or reviewing
// a clinical protocol, or reviewing the practice leaflet/website. It is assessed
// against the Organisation, Management & Leadership capability descriptors (and
// often Working with colleagues and in teams) and pairs with the ST3 Leadership
// MSF.
//
// What makes this entry distinct: it has a PROJECT-LIKE ARC (opportunity →
// buy-in → lead → embed → reflect) but is graded on LEADERSHIP, not data. The
// RCGP names two quality markers for a strong entry: a TANGIBLE SYSTEMS
// IMPROVEMENT and SELF-AWARENESS OF ONE'S LEADERSHIP IMPACT. The template is
// built around eliciting and grading exactly those.
//
// Flat (one probe → one field): the entry is a sequence of distinct fields, so
// each probe maps 1:1 to a rendered section, the same shape as the LEA/SEA form.
//
// `threshold: 'strong'` is set on the two RCGP quality markers — `reflection`
// (self-awareness of leadership impact, the #1 marker) and `leadership_role`
// (the trainee's OWN leading actions). This kills the two classic failures: a
// bare verdict ("it was a good experience") with no leadership insight, and
// credit deflected to the team ("the team did well") with no personal leadership
// evidenced. Everything else clears at the default 'adequate'.
//
// MECE design — the collisions a leadership taxonomy must resolve, each given a
// tie-breaker in the owning probe's `promptHint`. The subtle, dangerous one is
// influencing-others vs. own-leading-actions:
//   - bringing people on board (consulting, persuading, handling resistance) →
//     `stakeholder_engagement`; running/delivering the activity (chairing,
//     presenting, deciding, coordinating) → `leadership_role`.
//   - the trainee's actions vs. the result → `leadership_role` vs. `outcome`.
//   - the result vs. the learning → `outcome` vs. `reflection`.
//
// Two CROSS-TEMPLATE boundaries — this is the entry most easily confused with
// others, so they are encoded explicitly:
//   - vs. QIP: a QIP is a MEASURED improvement (data + PDSA cycles); a Leadership
//     activity is leading PEOPLE/SYSTEMS through a change with NO measurement
//     requirement. Keeping this line sharp stops the classifier flip-flopping on
//     a borderline "I led a protocol change" transcript.
//   - vs. Reflection on Feedback: a full Leadership-MSF reflection belongs in the
//     Reflection on Feedback entry. Here, feedback is a LIGHT OPTIONAL note
//     (`feedback_received`) scoped to what bore on THIS activity, not the focus.
//
// `feedback_received` is OPTIONAL (`required: false`): feedback/MSF on the
// activity is expected eventually but often not yet received at writeup. Like
// LEA/SEA's conditional boxes it never gates completeness, is never asked as a
// follow-up, and is dropped from the rendered entry when empty — and it doubles
// as the overlap-avoidance valve with the Reflection on Feedback entry.
//
// Word count sits in the activity band (QIA 300-550), below the full QIP project
// (500-850): a focused leadership writeup with a project-like arc.
export const LEADERSHIP_TEMPLATE: ArtefactTemplate = {
  id: 'LEADERSHIP_TEMPLATE',
  name: 'Leadership, Management & Professionalism',
  wordCountRange: { min: 300, max: 550 },
  sections: flatSections([
    {
      id: 'activity_description',
      label: 'Activity & Context',
      required: true,
      descriptorCriteria:
        'Strong = what the leadership activity was and the situation or opportunity that ' +
        'prompted it AND the improvement the trainee set out to make, with the activity agreed ' +
        'with the supervisor. ' +
        'Adequate = the activity and its purpose stated with some context. ' +
        'Shallow = a vague mention of an activity with no context or intended change.',
      description:
        'What the leadership, management, or professionalism activity was (e.g. chairing a ' +
        'meeting, a "fresh pair of eyes" review, a wellbeing initiative, creating a protocol), ' +
        'the situation or opportunity that prompted it, and the improvement the trainee set out ' +
        'to make. Context and intent only: do NOT describe how others were brought on board ' +
        '(→ Engaging & Influencing Others) or what the trainee personally did to lead it ' +
        '(→ Your Leadership Role).',
      promptHint:
        'Set the scene: the activity, what prompted it, and what you were trying to improve. ' +
        'Keep the influencing of others and your own leading actions to their own sections.',
      extractionQuestion: 'What was the leadership activity, and what were you trying to improve?',
      weight: 0.12,
    },
    {
      id: 'stakeholder_engagement',
      label: 'Engaging & Influencing Others',
      required: true,
      descriptorCriteria:
        'Strong = who the trainee consulted AND how they secured buy-in and handled differing ' +
        'views or resistance to bring the team with them. ' +
        'Adequate = the people involved named with some sense of how they were engaged. ' +
        'Shallow = a bare mention that others were "consulted" with no detail on how buy-in was ' +
        'built.',
      description:
        'How the trainee brought others on board — who they consulted, how they secured buy-in ' +
        'from key stakeholders, and how they handled differing views or resistance. The ' +
        "relational and influencing work: do NOT describe the trainee's own delivery of the " +
        'activity (→ Your Leadership Role) or the change that resulted (→ Outcome & Change ' +
        'Embedded).',
      promptHint:
        'Describe how you engaged and influenced people — securing buy-in, handling pushback. ' +
        'Keep your own leading actions (chairing, presenting) in Your Leadership Role.',
      extractionQuestion: 'Who did you need to bring on board, and how did you secure their buy-in?',
      weight: 0.18,
    },
    {
      id: 'leadership_role',
      label: 'Your Leadership Role',
      required: true,
      threshold: 'strong',
      descriptorCriteria:
        'Strong = the specific leading actions and decisions the trainee personally took ' +
        '(chairing, presenting/pitching, deciding, coordinating delivery) AND how they drove ' +
        "the activity forward, clearly distinguished from the team's contribution. " +
        "Adequate = the trainee's own actions stated with some sense of their leading role. " +
        'Shallow = a bare "I was involved" or credit to the team with no specific personal ' +
        'leading action.',
      description:
        'What the trainee personally did to lead the activity — the leading actions and ' +
        'decisions they took (chairing, presenting or pitching, making decisions, coordinating ' +
        "delivery) and how they drove it forward. The trainee's own leadership only: do NOT " +
        'describe the influencing of stakeholders (→ Engaging & Influencing Others) or the ' +
        'result (→ Outcome & Change Embedded).',
      promptHint:
        'Be specific and personal: what you yourself did to lead — chaired, presented, decided, ' +
        'coordinated — and distinguish it from what the team did. Keep the buy-in work in ' +
        'Engaging & Influencing Others.',
      extractionQuestion: 'What did you personally do to lead this activity?',
      weight: 0.2,
    },
    {
      id: 'outcome',
      label: 'Outcome & Change Embedded',
      required: true,
      descriptorCriteria:
        'Strong = the tangible change achieved AND how far it was embedded into practice (or, ' +
        'if incomplete, the concrete progress and next step). ' +
        'Adequate = a described result linked to the activity. ' +
        'Shallow = a bare "it went well" with no tangible change or result.',
      description:
        'The tangible result of the activity — what actually changed in the practice or team, ' +
        'and how far it was embedded (or, where time did not allow full implementation, the ' +
        'concrete progress made and the agreed next step). The result only: do NOT restate the ' +
        "trainee's leading actions (→ Your Leadership Role) or the lessons learned (→ Reflection " +
        'on Your Leadership).',
      promptHint:
        'Describe what tangibly changed and how embedded it is; if it is not finished, say how ' +
        'far it got and the next step. Keep your actions in Your Leadership Role and your ' +
        'learning in Reflection.',
      extractionQuestion: 'What changed as a result of this activity, and how far was it embedded?',
      weight: 0.16,
    },
    {
      id: 'reflection',
      label: 'Reflection on Your Leadership',
      required: true,
      threshold: 'strong',
      descriptorCriteria:
        "Strong = genuine self-awareness of the trainee's own leadership style and its impact " +
        'on others AND a concrete forward commitment framed as what to maintain, improve, or ' +
        'stop in how they lead. ' +
        'Adequate = one genuine insight into their leadership with some forward-looking action. ' +
        'Shallow = a bare verdict on the activity ("it was a good experience") with no insight ' +
        'into how they led or its effect on others.',
      description:
        'What the trainee learned about themselves as a leader — insight into their own ' +
        'leadership style and its impact on others — and how they will lead differently, framed ' +
        'as what to maintain, improve, or stop. Personal leadership learning only: do NOT ' +
        'restate the tangible outcome (→ Outcome & Change Embedded) or the actions taken ' +
        '(→ Your Leadership Role).',
      promptHint:
        'Reflect on how you led and the effect you had on others, and what you will maintain, ' +
        'improve, or stop as a leader. Keep this to your own learning, not the result or the ' +
        'actions.',
      extractionQuestion:
        'What did you learn about yourself as a leader, and what would you do differently?',
      weight: 0.27,
    },
    {
      // Optional, like LEA/SEA's conditional boxes: feedback/MSF on the activity
      // is expected eventually but often not yet received at writeup. Also the
      // overlap-avoidance valve with the Reflection on Feedback entry — a full MSF
      // reflection belongs there; here, note only what bore on this activity.
      id: 'feedback_received',
      label: 'Feedback on Your Leadership',
      required: false,
      description:
        'Any feedback the trainee received on this activity — from the supervisor, colleagues, ' +
        'or the leadership MSF — and what it told them about how they led. Often feedback has ' +
        'not been received yet; leave empty if so. A full reflection on a multi-source feedback ' +
        'round belongs in a separate Reflection on Feedback entry — note here only the feedback ' +
        'that bore on this activity.',
      promptHint:
        'If you received feedback on how you led this activity, note what it said and what you ' +
        'took from it. Leave empty if none yet; keep a full MSF reflection for a Reflection on ' +
        'Feedback entry.',
      extractionQuestion: 'Did you receive any feedback on how you led this, and what did it tell you?',
      weight: 0.07,
    },
  ]),
};
