import { ArtefactTemplate, flatSections } from '@acme/shared';

// ---------------------------------------------------------------------------
// Generic Reflective Activity
// Used by: ACADEMIC_ACTIVITY
// ---------------------------------------------------------------------------
// This is the GENERIC reflective template for heterogeneous, non-clinical
// "catch-all" reflective entries — currently Academic Activity (teaching,
// research, presentations, journal clubs, literature reviews, courses, work-life
// balance). It is deliberately NOT a bespoke template.
//
// Why generic, not bespoke (the design call): a bespoke ArtefactTemplate earns
// its keep only when the entries share a strong, common, domain-specific
// structure that can be encoded as SPECIFIC descriptor criteria (e.g. QIP's
// "≥2 PDSA cycles", Leadership's "self-awareness of leadership impact"). Academic
// Activity has no such common structure — a teaching session and a literature
// review share almost nothing — and the RCGP itself imposes no fixed fields on
// the academic log; it is a FREE reflective entry held to the general
// reflective-writing bar (critical thinking, self-awareness, and learning:
// what / why / how). So the right tool is the universal reflective arc, and the
// descriptor criteria grade REFLECTIVE DEPTH, never domain content — a
// content-specific anchor that fits research would misfire on teaching.
//
// The probes are the universal reflective arc (aligned with generic models such
// as Gibbs): the activity → why it mattered → what was learned → how it changes
// practice, with an optional honest-difficulty beat. This shape holds for EVERY
// sub-type, which is exactly why it outperforms bespoke probes here.
//
// Wording is NEUTRAL and non-clinical by design: labels avoid clinical framing
// ("The Activity", not "What Happened"; "Application to Practice", not "Patient
// Outcome") so the entry reads cleanly for a conference talk or a journal club,
// not just a clinical learning event.
//
// `threshold: 'strong'` is set on the two reflective-payload probes the RCGP bar
// centres on — `learning` (the specific knowledge/skill/attitude gained) and
// `application` (the concrete change to future practice). A bare "it was useful"
// must not clear these. Everything else clears at the default 'adequate'.
//
// `challenges` is OPTIONAL (`required: false`): the Gibbs "feelings/evaluation"
// beat. Not every academic activity has a notable difficulty or emotional
// element, so — like LEA/SEA's conditional boxes — it never gates completeness,
// is never asked as a follow-up, and is dropped from the rendered entry when
// empty, lighting up only when the trainee actually hit a challenge.
//
// MECE design — each probe on the universal reflective axis, with tie-breakers in
// `promptHint`: the description (`activity`) vs. why it mattered (`significance`)
// vs. the takeaway (`learning`) vs. the forward change (`application`).
//
// Word count sits in the focused reflective-log band — a reflection, not a
// project write-up.
export const GENERIC_REFLECTIVE_TEMPLATE: ArtefactTemplate = {
  id: 'GENERIC_REFLECTIVE_TEMPLATE',
  name: 'Reflective Activity',
  wordCountRange: { min: 200, max: 400 },
  sections: flatSections([
    {
      id: 'activity',
      label: 'The Activity',
      required: true,
      descriptorCriteria:
        'Strong = a clear account of what the activity was, the context, AND the ' +
        "trainee's own role or involvement. " +
        'Adequate = the activity described with some context. ' +
        'Shallow = a vague one-liner with no detail about the activity or the role.',
      description:
        'What the activity was (e.g. a teaching session, a research project, a presentation, a ' +
        "journal club, a course), the context, and the trainee's role in it. The description " +
        'only: do NOT state why it mattered (→ Why It Mattered) or what was learned ' +
        '(→ What You Learned).',
      promptHint:
        'Describe what the activity was, the setting, and your role in it. Keep the ' +
        'significance and the learning for their own sections.',
      extractionQuestion: 'What was the activity, and what was your role in it?',
      weight: 0.15,
    },
    {
      id: 'significance',
      label: 'Why It Mattered',
      required: true,
      descriptorCriteria:
        'Strong = what specifically made the activity notable AND why it matters for the ' +
        "trainee's professional development. " +
        'Adequate = a genuine reason the activity was significant. ' +
        'Shallow = a generic "it was useful" or "interesting" with no specific reason it ' +
        'mattered.',
      description:
        'What made this activity a meaningful learning opportunity and why it matters for the ' +
        "trainee's professional development. The significance only: do NOT yet state the " +
        'specific learning gained (→ What You Learned).',
      promptHint:
        'Explain why this activity was significant for your development — what made it worth ' +
        'reflecting on. Keep the concrete learning points for What You Learned.',
      extractionQuestion: 'What made this activity a worthwhile learning opportunity?',
      weight: 0.17,
    },
    {
      id: 'learning',
      label: 'What You Learned',
      required: true,
      threshold: 'strong',
      descriptorCriteria:
        'Strong = specific knowledge, skills, or attitudes gained AND a link to relevant ' +
        'evidence, guidance, or wider practice. ' +
        'Adequate = a concrete learning point stated. ' +
        'Shallow = a vague claim of having learnt something with no specific knowledge or skill ' +
        'named.',
      description:
        'The specific knowledge, skills, or attitudes the trainee gained from the activity, ' +
        'linked to evidence or guidance where relevant. The learning itself: do NOT describe ' +
        'how it will change future practice (→ Application to Practice).',
      promptHint:
        'Name the concrete things you learned — knowledge, a skill, a change in attitude — and ' +
        "link to evidence where relevant. Keep how you'll use it for Application to Practice.",
      extractionQuestion: 'What specifically did you learn from this activity?',
      weight: 0.3,
    },
    {
      id: 'application',
      label: 'Application to Practice',
      required: true,
      threshold: 'strong',
      descriptorCriteria:
        "Strong = a concrete change to the trainee's future practice (clinical, teaching, or " +
        'scholarly) framed as what to maintain, improve, or stop, AND why. ' +
        'Adequate = one genuine forward-looking action. ' +
        'Shallow = a vague intention ("I\'ll keep this in mind") with no concrete change.',
      description:
        "How the learning will change the trainee's future practice — clinical, teaching, or " +
        'scholarly — framed as what to maintain, improve, or stop. The forward action only: do ' +
        'NOT restate the learning itself (→ What You Learned).',
      promptHint:
        "Describe concretely how this will change what you do — what you'll maintain, improve, " +
        'or stop, and why. Keep the learning itself in What You Learned.',
      extractionQuestion: 'How will this change your future practice?',
      weight: 0.28,
    },
    {
      // Optional Gibbs "feelings/evaluation" beat — not every academic activity
      // has a notable difficulty or emotional element. Never gates completeness,
      // never asked as a follow-up, dropped from the rendered entry when empty.
      id: 'challenges',
      label: 'Challenges & Honest Reflection',
      required: false,
      description:
        'Any difficulties, uncertainties, or feelings the trainee experienced during the ' +
        'activity, and an honest evaluation of what went less well. Demonstrates self-awareness; ' +
        'leave empty if not applicable.',
      promptHint:
        'If the activity involved difficulties, uncertainty, or a notable reaction, reflect ' +
        'honestly on them and what they tell you. Leave empty if not applicable.',
      extractionQuestion:
        "Were there any challenges or things that didn't go to plan, and how did you find the " +
        'experience?',
      weight: 0.1,
    },
  ]),
};
