import { ArtefactTemplate, flatSections } from '@acme/shared';

// ---------------------------------------------------------------------------
// Reflection on Feedback
// Used by: FEEDBACK_REFLECTION
// ---------------------------------------------------------------------------
// A Reflection on Feedback entry is the RCGP WPBA learning log used to reflect on
// feedback the trainee has RECEIVED ABOUT THEMSELVES — colleague multi-source
// feedback (MSF), patient feedback (PSQ), Leadership MSF, exam results, and
// ESR/CSR or educator notes. (It does NOT count toward the QIA requirement.)
//
// What makes this entry structurally distinct from every other template: the
// stimulus is not a clinical experience but DATA ABOUT THE TRAINEE'S OWN
// PERFORMANCE (scores + free-text comments from others). Two consequences shape
// the design:
//   - The MSF literature is clear that feedback conflicting with self-assessment
//     provokes strong emotion (shame, defensiveness) that BLOCKS acceptance, so
//     honest emotional processing is part of doing this well — hence a dedicated
//     `emotional_response` probe.
//   - A good entry is judged on REASONED INTERPRETATION (does the trainee agree
//     or disagree, and why, weighed against their own self-view) and CONCRETE
//     ACTION — not on restating scores. Those two probes carry the assessment.
//
// Flat (one probe → one field): the entry is a short sequence of distinct fields,
// so each probe maps 1:1 to a rendered section, the same shape as the LEA/SEA
// form.
//
// `threshold: 'strong'` is set on the two assessment-critical probes — `analysis`
// (reasoned agree/disagree + meaning) and `action_plan` (concrete, SMART steps) —
// matching the GMC/RCGP emphasis and the 2-strong-gate precedent of the other
// templates. A merely "adequate" analysis ("the feedback was fair") must NOT
// clear the gate; the strong gate is what draws out the reasoning.
//
// `emotional_response` is REQUIRED but deliberately NOT strong-gated: the RCGP
// expects self-awareness "including the emotional impact", so the loop asks for
// it once if missing — but forcing DEPTH here produces performative "I felt fine"
// filler, so a genuine brief acknowledgement at 'adequate' clears it. (Contrast
// the optional emotional probes in LEA/SEA, where an emotional beat is genuinely
// conditional; here it is part of the expected structure, so it is required.)
//
// `supervisor_discussion` is OPTIONAL (`required: false`): the feedback
// conversation with the CS/ES is expected eventually but often has not happened
// when the entry is written. Like LEA/SEA's conditional boxes, it never gates
// completeness, is never asked as a follow-up, and is dropped from the rendered
// entry when empty — lighting up only once the discussion has been held.
//
// MECE design — the collisions a feedback-reflection taxonomy must resolve, each
// given a tie-breaker in the owning probe's `promptHint`:
//   - what the feedback said vs. the trainee's judgement of it → `key_findings`
//     vs. `analysis`.
//   - the content vs. how it felt → `key_findings` vs. `emotional_response`.
//   - the interpretation vs. the steps → `analysis` vs. `action_plan`.
//   - the steps vs. the conversation that shaped them → `action_plan` vs.
//     `supervisor_discussion`.
//
// Word count sits in the reflective-log band (LEA/SEA 250-450): a focused
// reflection, not a project write-up.
export const FEEDBACK_TEMPLATE: ArtefactTemplate = {
  id: 'FEEDBACK_TEMPLATE',
  name: 'Reflection on Feedback',
  wordCountRange: { min: 250, max: 450 },
  sections: flatSections([
    {
      id: 'feedback_source',
      label: 'Feedback Source & Context',
      required: true,
      descriptorCriteria:
        'Strong = the specific type of feedback (MSF, PSQ, leadership MSF, exam result, ' +
        'ESR/educator note) AND when it was received and the context that prompted it. ' +
        'Adequate = the feedback source named with some context. ' +
        'Shallow = a vague mention of "feedback" with no source type or timing.',
      description:
        'What type of feedback was received (MSF, PSQ, leadership MSF, exam result, ESR or ' +
        'educator note), when, and the context. Context only: do NOT summarise what the ' +
        'feedback actually said (→ Key Findings).',
      promptHint:
        'Identify the feedback source, type, and when it arrived. Keep the content itself for ' +
        'Key Findings.',
      extractionQuestion: 'What feedback did you receive, from what source, and when?',
      weight: 0.08,
    },
    {
      id: 'key_findings',
      label: 'Key Findings',
      required: true,
      descriptorCriteria:
        'Strong = the main themes, scores, and comments summarised honestly, covering both ' +
        'strengths AND specific areas for development. ' +
        'Adequate = the key points summarised with some balance. ' +
        'Shallow = a one-sided or vague summary ("mostly positive") that omits development ' +
        'areas or names no specific theme.',
      description:
        "A faithful, honest summary of what the feedback said — the main themes, scores, and " +
        'comments — covering both the positives and the areas for development. The raters\' ' +
        'message only: do NOT give your own interpretation or whether you agree ' +
        '(→ Analysis & Interpretation) or how it made you feel (→ Initial Response).',
      promptHint:
        'Summarise what the feedback actually said, balancing strengths with development ' +
        'areas. Keep your own take and any agree/disagree for Analysis & Interpretation.',
      extractionQuestion:
        'What were the main themes or points from the feedback, both positive and ' +
        'developmental?',
      weight: 0.17,
    },
    {
      id: 'emotional_response',
      label: 'Initial Response',
      required: true,
      descriptorCriteria:
        'Strong = an honest account of how the feedback felt to receive AND a recognition of ' +
        "how that reaction might colour the trainee's response to it. " +
        'Adequate = a genuine acknowledgement of the initial reaction. ' +
        'Shallow = a dismissive "it was fine" with no honest reaction, or no emotional content ' +
        'at all.',
      description:
        'How the trainee felt on receiving the feedback — the honest initial reaction. ' +
        'Self-awareness and emotional honesty: do NOT yet judge whether the feedback is valid ' +
        '(→ Analysis & Interpretation).',
      promptHint:
        'Reflect honestly on your gut reaction to the feedback, including any discomfort. Keep ' +
        'the reasoned judgement of whether it is fair for Analysis & Interpretation.',
      extractionQuestion: 'How did you feel when you first received this feedback?',
      weight: 0.1,
    },
    {
      id: 'analysis',
      label: 'Analysis & Interpretation',
      required: true,
      threshold: 'strong',
      descriptorCriteria:
        "Strong = a reasoned interpretation of what the feedback means for the trainee's " +
        'development AND a considered position on where they agree or disagree and WHY, ' +
        'weighing it against their own self-assessment. ' +
        'Adequate = some interpretation of what the feedback tells them about their practice. ' +
        'Shallow = bare acceptance or rejection ("the feedback was fair", "I disagree") with ' +
        'no reasoning about what it means.',
      description:
        "What the feedback means for the trainee's development, and a reasoned position on " +
        'where they agree or disagree with it and why — weighed against their own view of ' +
        'their practice. The trainee\'s judgement only: do NOT restate the feedback content ' +
        '(→ Key Findings) or list the actions taken (→ Actions Taken or Planned).',
      promptHint:
        'Work through what the feedback tells you about your practice and where you agree or ' +
        'disagree, with reasons. Keep the feedback content in Key Findings and the steps you ' +
        'will take in Actions Taken or Planned.',
      extractionQuestion:
        'What does this feedback tell you about your development, and where do you agree or ' +
        'disagree, and why?',
      weight: 0.3,
    },
    {
      id: 'action_plan',
      label: 'Actions Taken or Planned',
      required: true,
      threshold: 'strong',
      descriptorCriteria:
        'Strong = specific, concrete steps taken or planned in direct response to the feedback ' +
        'AND time-bound, SMART detail linking each step to a development area identified. ' +
        'Adequate = a concrete action stated with some substance and a link to the feedback. ' +
        'Shallow = a vague intention ("I\'ll work on it") with no specific or time-bound step.',
      description:
        'The specific, concrete steps the trainee has taken or will take in response to the ' +
        'feedback, ideally SMART and time-bound, each linked to a development area. The actions ' +
        'only: do NOT restate the interpretation (→ Analysis & Interpretation).',
      promptHint:
        'Detail concrete, time-bound actions in response to the feedback, each tied to a ' +
        'development area. Keep the interpretation in Analysis & Interpretation.',
      extractionQuestion:
        'What specific actions have you taken or will you take in response to this feedback?',
      weight: 0.28,
    },
    {
      // Optional, like LEA/SEA's conditional boxes: the CS/ES feedback discussion
      // is expected eventually but often has not happened when the entry is
      // written. Never gates completeness, never asked as a follow-up, and dropped
      // from the rendered entry when empty.
      id: 'supervisor_discussion',
      label: 'Discussion with Supervisor',
      required: false,
      description:
        'The feedback discussion held with the clinical or educational supervisor and what ' +
        'came out of it — their perspective and any agreed next steps or PDP goal. Leave empty ' +
        'if the discussion has not happened yet.',
      promptHint:
        'If you have discussed this feedback with your supervisor, note what you agreed and any ' +
        'PDP goal that came from it.',
      extractionQuestion: 'Have you discussed this feedback with your supervisor, and what did ' +
        'you agree?',
      weight: 0.07,
    },
  ]),
};
