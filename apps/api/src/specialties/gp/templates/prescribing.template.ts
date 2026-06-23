import { ArtefactTemplate, flatSections } from '@acme/shared';

// ---------------------------------------------------------------------------
// Prescribing Assessment Reflection
// Used by: PRESCRIBING
// ---------------------------------------------------------------------------
// The RCGP Prescribing Assessment is a MANDATORY ST3 formative assessment of the
// trainee's own prescribing. The full assessment is three coupled artefacts:
//   (1) a 50-prescription spreadsheet (the trainee + supervisor map errors on it),
//   (2) a joint trainee/supervisor assessment form, and
//   (3) the trainee REFLECTION form (maintain / improve / learning plan),
// organised against the GP prescribing proficiencies.
//
// THIS TEMPLATE MODELS ONLY (3) — the trainee reflection. (1) is structured
// external data (a file upload, not a narrative) and (2) is supervisor-produced;
// neither is a trainee voice transcript, so the pipeline must not try to elicit
// them. The template's job is the reflection; the spreadsheet stays an
// attachment. (This is the deliberate "partial fit" boundary: the reflective
// half fits the pipeline, the assessment machinery does not.)
//
// Why bespoke, not the generic reflective template: Academic Activity is a
// heterogeneous catch-all (→ generic shape). Prescribing is the OPPOSITE — a
// single assessment with a strong, homogeneous, FIXED-RUBRIC structure: every
// prescribing reflection is "review my prescribing → trends/errors → what I
// maintain → what I improve → learning plan", anchored to the GP prescribing
// proficiencies (medication selection, interactions, dosing, monitoring,
// communication, documentation). That homogeneity lets us write SPECIFIC,
// proficiency-anchored descriptor criteria a generic template cannot — which is
// exactly what justifies a bespoke template.
//
// Flat (one probe → one field): the reflection is a short sequence of distinct
// fields, so each probe maps 1:1 to a rendered section, the LEA/SEA form shape.
//
// `threshold: 'strong'` is set on the two assessment-critical probes — `improve`
// (honestly surfacing specific weaknesses, the diagnostic core) and
// `learning_plan` (the concrete plan, the whole point of a formative assessment
// that exists to "enable learning plans to be put in place"). Everything else
// clears at the default 'adequate'.
//
// `supervisor_input` is OPTIONAL (`required: false`): the supervisor reviews a
// sample and may surface errors the trainee missed, but this is conditional and
// supervisor-coupled. Like LEA/SEA's conditional boxes it never gates
// completeness, is never asked as a follow-up, and is dropped when empty — a
// light note on what the supervisor's review added, NOT ownership of the
// supervisor form.
//
// MECE design — tie-breakers in `promptHint`:
//   - the overall picture / error types → `review_context`; specific strengths →
//     `maintain`; specific weaknesses → `improve`.
//   - the weakness vs. the fix → `improve` vs. `learning_plan`.
//
// Cross-template boundary vs. SEA: a SINGLE harmful prescribing error is a
// Significant Event Analysis. This assessment is about PATTERNS across 50 scripts
// — keep it to trends, not a one-off incident.
//
// Word count sits in the reflective-log band: a focused structured reflection.
export const PRESCRIBING_TEMPLATE: ArtefactTemplate = {
  id: 'PRESCRIBING_TEMPLATE',
  name: 'Prescribing Assessment Reflection',
  wordCountRange: { min: 250, max: 450 },
  sections: flatSections([
    {
      id: 'review_context',
      label: 'Prescribing Review & Trends',
      required: true,
      descriptorCriteria:
        'Strong = the scope of the review (that the trainee examined their own recent ' +
        'prescribing) AND the main trends or error types it surfaced, mapped to the GP ' +
        'prescribing proficiencies (e.g. medication selection, interactions, dosing, ' +
        'monitoring, communication, documentation). ' +
        'Adequate = a concrete pattern or error type identified from the review. ' +
        'Shallow = a vague "my prescribing was mostly fine" with no specific trend, error, or ' +
        'proficiency.',
      description:
        "A summary of what the trainee's review of their own prescribing surfaced — the overall " +
        'picture and the main trends or error types, framed against the GP prescribing ' +
        'proficiencies. The findings summary only: do NOT list the individual prescriptions ' +
        '(those belong in the uploaded spreadsheet), and keep the specific strengths to ' +
        'maintain (→ What You Do Well) and weaknesses to fix (→ What to Improve) for their own ' +
        'sections.',
      promptHint:
        'Summarise what reviewing your prescribing showed — the overall picture and the main ' +
        'error types or trends, against the prescribing proficiencies. Do not list individual ' +
        'prescriptions (those go in the spreadsheet); keep specific strengths and weaknesses ' +
        'for their own sections.',
      extractionQuestion: 'What did reviewing your prescribing show — the main trends or types of error?',
      weight: 0.2,
    },
    {
      id: 'maintain',
      label: 'What You Do Well (Maintain)',
      required: true,
      descriptorCriteria:
        "Strong = specific aspects of the trainee's prescribing that are done well AND the " +
        'proficiency they reflect, that the trainee will deliberately maintain. ' +
        'Adequate = a genuine prescribing strength identified. ' +
        'Shallow = a generic "I prescribe safely" with no specific strength or proficiency.',
      description:
        "The specific aspects of the trainee's prescribing that are done well and should be " +
        'maintained, framed against the prescribing proficiencies. Strengths only: do NOT ' +
        'include weaknesses or areas to change (→ What to Improve).',
      promptHint:
        'Identify specific prescribing strengths to keep doing, tied to a proficiency. Leave ' +
        'weaknesses to What to Improve.',
      extractionQuestion: 'What are you doing well in your prescribing that you want to maintain?',
      weight: 0.18,
    },
    {
      id: 'improve',
      label: 'What to Improve',
      required: true,
      threshold: 'strong',
      descriptorCriteria:
        'Strong = a specific prescribing weakness or risky pattern the review revealed AND the ' +
        'proficiency it maps to, honestly owned. ' +
        'Adequate = a genuine area for improvement identified. ' +
        'Shallow = a bare "I could be better" with no specific weakness, or a claim that ' +
        'nothing needs improving.',
      description:
        "The specific weaknesses or risky patterns in the trainee's prescribing that the review " +
        'revealed, honestly owned and framed against the prescribing proficiencies. The ' +
        'weaknesses only: do NOT state the strengths (→ What You Do Well) or the actions to fix ' +
        'them (→ Learning Plan).',
      promptHint:
        'Name the specific prescribing weaknesses or risky patterns to address, tied to a ' +
        'proficiency, honestly. Keep the fixes for the Learning Plan.',
      extractionQuestion:
        'What specific weaknesses or risky patterns did the review reveal that you need to ' +
        'improve?',
      weight: 0.27,
    },
    {
      id: 'learning_plan',
      label: 'Learning Plan',
      required: true,
      threshold: 'strong',
      descriptorCriteria:
        'Strong = specific, concrete steps to address the improvement areas AND how each links ' +
        'to a prescribing weakness, ideally SMART and time-bound. ' +
        'Adequate = a concrete action stated with some link to a weakness. ' +
        'Shallow = a vague "read more on prescribing" with no specific or linked step.',
      description:
        'The concrete steps the trainee will take to improve their prescribing, each linked to ' +
        'a weakness identified, ideally SMART and time-bound. The actions only: do NOT restate ' +
        'the weaknesses themselves (→ What to Improve).',
      promptHint:
        'Detail concrete, time-bound actions to improve your prescribing, each tied to a ' +
        'weakness. Keep the weaknesses in What to Improve.',
      extractionQuestion: 'What is your plan to improve your prescribing?',
      weight: 0.25,
    },
    {
      // Optional, like LEA/SEA's conditional boxes: the supervisor reviews a
      // sample and may surface errors the trainee missed, but this is conditional
      // and supervisor-coupled. A light note on what the supervisor's review
      // added — NOT ownership of the separate supervisor assessment form.
      id: 'supervisor_input',
      label: "Supervisor's Review",
      required: false,
      description:
        "What the supervisor's review of a sample of the trainee's prescriptions added or " +
        'highlighted — errors or patterns the trainee had not spotted themselves, and what the ' +
        'trainee took from it. Leave empty if the supervisor review has not happened or added ' +
        'nothing new.',
      promptHint:
        "If your supervisor's review of your prescriptions surfaced anything you had not " +
        'spotted, note what it was and what you took from it. Leave empty if not applicable.',
      extractionQuestion: "Did your supervisor's review highlight anything you had not spotted yourself?",
      weight: 0.1,
    },
  ]),
};
