import { ArtefactTemplate, flatSections } from '@acme/shared';

// ---------------------------------------------------------------------------
// QIA (Quality Improvement Activity)
// Used by: QI_ACTIVITY
// ---------------------------------------------------------------------------
// A QIA is the RCGP MRCGP WPBA requirement for demonstrating quality improvement
// in the years a trainee is NOT doing the formal QIP (minimum 1 QIP + 2 QIAs
// across training). It is the smaller, broader sibling of the QIP: the trainee
// reviews the quality of their OWN work, takes an action to improve it, and
// evaluates the result. Unlike the QIP — a formal project with its own template —
// a QIA is recorded as a "Quality Improvement Activity reflective learning log
// entry." (LEA/SEA and Reflection on Feedback do NOT count as QIAs.)
//
// This template mirrors the headings of the RCGP QIA learning-log entry —
// Brief description / "What were you trying to accomplish?" / "How have you
// engaged with others?" / "What changes have taken place?" / "Reflection: what
// will I maintain, improve or stop?" — and adds the two dimensions the RCGP
// minimum-evidence test demands (a systematic look at data, and follow-up to see
// if the change worked) as explicit probes so the elicitation loop draws them out.
//
// Flat (one probe → one field): a QIA log entry is a short sequence of distinct
// fields, so each probe maps 1:1 to a rendered section, the same shape as the
// LEA/SEA form.
//
// Deliberately LIGHTER than the QIP. The QIP strong-gates three probes (it is a
// formal project); the QIA strong-gates only TWO, reflecting its smaller scale
// and keeping the follow-up loop short:
//   - `changes` — because the one non-negotiable QIA requirement is that ACTION
//     is actually taken ("should look to create an improvement and/or change,
//     which requires action to be taken").
//   - `reflection` — the evaluative core ("should include an element of
//     evaluation and action").
// Everything else clears at the default 'adequate'.
//
// `outcome` is OPTIONAL (`required: false`) by design: the RCGP asks a QIA to
// demonstrate an outcome "WHERE POSSIBLE" — the change is often too recent to
// re-measure. Modelling it as an optional probe (like LEA/SEA's significant-event
// boxes) faithfully reproduces that softener: it never gates completeness, is
// never asked as a follow-up, and the reflect node drops it from the rendered
// entry when empty, lighting up only when the trainee has actually re-checked.
//
// MECE design — the collisions a QIA taxonomy must resolve, each given a
// tie-breaker in the owning probe's `promptHint`:
//   - intended goal vs. data found → `aim` vs. `findings`.
//   - the data vs. the action → `findings` vs. `changes`.
//   - the action vs. whether it worked → `changes` vs. `outcome`.
//   - system change vs. personal learning → `changes` vs. `reflection`.
//
// Word count sits between the single-case logs and the full QIP (CCR 150-300,
// SEA 300-500, QIP 500-850): a QIA is a focused activity write-up.
export const QIA_TEMPLATE: ArtefactTemplate = {
  id: 'QIA_TEMPLATE',
  name: 'Quality Improvement Activity',
  wordCountRange: { min: 300, max: 550 },
  sections: flatSections([
    {
      id: 'brief_description',
      label: 'Brief Description',
      required: true,
      descriptorCriteria:
        "Strong = the quality area in the trainee's own work identified for review AND why it " +
        'was chosen (a personal connection and a relevant guidance, standard, or concern), with ' +
        'the type of activity (audit, search-and-do, outcome review, PDSA) clear. ' +
        'Adequate = the area and activity stated with some sense of why it mattered. ' +
        'Shallow = a vague topic with no personal connection or reason for choosing it.',
      description:
        "What the activity was and the quality area in the trainee's own work it set out to " +
        'review — the topic, why it was chosen (a personal connection to their practice, and any ' +
        'relevant guidance or standard), and the kind of activity undertaken (audit, ' +
        'search-and-do, outcome-data review, PDSA). Context only: do NOT state the specific ' +
        'objective (→ What You Set Out to Achieve) or the data found (→ What You Looked At & ' +
        'Found).',
      promptHint:
        'Set the scene: the area of your own work you reviewed, why you picked it, and what kind ' +
        'of activity it was. Keep the specific target in What You Set Out to Achieve.',
      extractionQuestion:
        'What did you look at, and why did you choose this area of your own practice?',
      weight: 0.12,
    },
    {
      id: 'aim',
      label: 'What You Set Out to Achieve',
      required: true,
      descriptorCriteria:
        'Strong = a clear objective stating the improvement sought AND how the trainee would ' +
        'know it had been achieved. ' +
        'Adequate = a stated objective with some sense of the improvement intended. ' +
        'Shallow = a vague intention ("to do better") with no defined improvement.',
      description:
        'The objective — what the trainee was trying to accomplish and the improvement they were ' +
        'aiming for. The intended goal only: do NOT report the data you collected (→ What You ' +
        'Looked At & Found) or the change you made (→ Action & Changes Made).',
      promptHint:
        'State what you were trying to accomplish and how you would know it had worked. Keep ' +
        'this to the goal; the figures belong in What You Looked At & Found.',
      extractionQuestion: 'What were you trying to accomplish?',
      weight: 0.12,
    },
    {
      id: 'findings',
      label: 'What You Looked At & Found',
      required: true,
      descriptorCriteria:
        'Strong = a systematic look at relevant data (a search, audit sample, or outcome data) ' +
        'AND what it showed against a standard or expectation, including the gap that prompted ' +
        'action. ' +
        'Adequate = some data gathered with a concrete finding. ' +
        'Shallow = an impression or anecdote with no systematic data or finding.',
      description:
        'How the trainee reviewed the area and what they found: the data collected or reviewed ' +
        '(the search, audit sample, or outcome data) and what it showed — the current state or ' +
        'gap against a standard. The systematic look and its findings: do NOT state the action ' +
        'taken in response (→ Action & Changes Made) or the re-measured result after the change ' +
        '(→ Outcome & Follow-up).',
      promptHint:
        'Describe how you gathered the data and what it showed against the standard or your ' +
        'expectation. Keep this to the initial picture; the action belongs in Action & Changes ' +
        'Made and any re-measurement in Outcome & Follow-up.',
      extractionQuestion: 'What did you look at, and what did the data show?',
      weight: 0.18,
    },
    {
      id: 'engagement',
      label: 'How You Engaged Others',
      required: true,
      descriptorCriteria:
        "Strong = who was involved AND how they were engaged, distinguishing the trainee's own " +
        'contribution from collaborative work. ' +
        'Adequate = the people involved named with some sense of how they were engaged. ' +
        'Shallow = a bare mention that others were involved, with no detail or personal role.',
      description:
        'Who the trainee involved in the activity and how they engaged them — colleagues, ' +
        'practice staff, or patients — and what the trainee personally contributed. Do NOT ' +
        'restate how the data was gathered (→ What You Looked At & Found).',
      promptHint:
        'Name who you engaged and how, and be clear about your own contribution. Keep the ' +
        'data-gathering method in What You Looked At & Found.',
      extractionQuestion: 'How have you engaged with others in this activity?',
      weight: 0.1,
    },
    {
      id: 'changes',
      label: 'Action & Changes Made',
      required: true,
      threshold: 'strong',
      descriptorCriteria:
        'Strong = the specific action or change the trainee took in response to the findings AND ' +
        'how it was put into practice. ' +
        'Adequate = a described action linked to the findings. ' +
        'Shallow = a bare statement that "a change was made", or a hypothetical "should" with no ' +
        'action actually taken.',
      description:
        'The concrete action the trainee took in response to the findings — the change made to ' +
        "their own practice or the team's (a new habit, prompt, checklist, or process) and how " +
        'it was put into practice. A QIA must involve action actually taken. The action only: do ' +
        'NOT describe whether it worked on follow-up (→ Outcome & Follow-up) or personal lessons ' +
        '(→ Reflection & Learning).',
      promptHint:
        'Describe what you actually did about the findings and how it was put into practice. ' +
        'Keep whether it worked in Outcome & Follow-up, and your learning in Reflection & ' +
        'Learning.',
      extractionQuestion: 'What action did you take, and what changed as a result?',
      weight: 0.18,
    },
    {
      id: 'reflection',
      label: 'Reflection & Learning',
      required: true,
      threshold: 'strong',
      descriptorCriteria:
        'Strong = a genuine evaluation of the activity and what the trainee learned about ' +
        'improving their practice AND a concrete forward commitment framed as what to maintain, ' +
        'improve, or stop. ' +
        'Adequate = one genuine evaluative learning point with some forward-looking action. ' +
        'Shallow = a bare verdict ("a useful exercise") with no evaluation or learning.',
      description:
        'The trainee\'s evaluation of the activity and what they personally learned — about ' +
        'their practice and about reviewing and improving it — framed as what they will ' +
        'maintain, improve, or stop. Personal learning and evaluation only: do NOT restate the ' +
        'action made (→ Action & Changes Made) or the follow-up data (→ Outcome & Follow-up).',
      promptHint:
        'Reflect on what the activity taught you and what you will maintain, improve, or stop. ' +
        'Keep this to your own learning, not the action itself or the follow-up figures.',
      extractionQuestion: 'Reflecting on this, what will you maintain, improve, or stop, and why?',
      weight: 0.2,
    },
    {
      // Optional, encoding the RCGP "demonstrate an outcome WHERE POSSIBLE"
      // softener: the change is often too recent to re-measure. Never gates
      // completeness, never asked as a follow-up, and dropped from the rendered
      // entry when empty — lighting up only when the trainee has re-checked.
      id: 'outcome',
      label: 'Outcome & Follow-up',
      required: false,
      description:
        'Whether the change led to an improvement: any re-measurement, follow-up, or re-audit ' +
        'after the action, and what it showed. Often the change is too recent to re-measure — ' +
        'leave empty if there is no follow-up yet.',
      promptHint:
        'If you have re-looked at the area since making the change, note what the follow-up ' +
        'showed. Leave empty if it is too soon to tell.',
      extractionQuestion: 'Have you re-checked since making the change, and did it improve things?',
      weight: 0.1,
    },
  ]),
};
