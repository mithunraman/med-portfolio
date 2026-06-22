import { ArtefactTemplate, flatSections } from '@acme/shared';

// ---------------------------------------------------------------------------
// QIP (Quality Improvement Project)
// Used by: QI_PROJECT
// ---------------------------------------------------------------------------
// A QIP is the RCGP MRCGP WPBA requirement for demonstrating engagement with
// quality improvement in primary care: a structured project — normally one per
// training, in a primary-care placement — that makes a MEASURED improvement to a
// service or to patient care. It is NOT an audit and NOT a one-off reflection;
// the distinguishing feature is iterative testing of change.
//
// This template is built on the Model for Improvement (IHI), which the RCGP QIP
// follows. That model has two parts, and the sections below map onto both:
//   1. Three questions — What are we trying to accomplish? (→ aim) How will we
//      know a change is an improvement? (→ aim's measures) What changes can we
//      make? (→ methodology / changes).
//   2. PDSA cycles (Plan-Do-Study-Act) — the iterative engine. The RCGP expects
//      AT LEAST TWO PDSA cycles in a QIP, so `methodology` is graded on showing
//      an iterative sequence, not a single data pull. This is the bar that
//      separates a QIP from an audit.
//
// Flat (one probe → one field): the QIP write-up is a sequence of distinct
// document fields (problem → aim → method → team → results → change →
// sustainability → reflection), so each probe maps 1:1 to a rendered section,
// the same shape as the LEA/SEA form.
//
// MECE design — the four collisions a QIP taxonomy must resolve, each given a
// tie-breaker in the owning probe's `promptHint`:
//   - planned measures vs. actual data → `aim` (the target/metric definition)
//     vs. `results` (the figures obtained).
//   - the testing process vs. the change kept → `methodology` (the PDSA cycles)
//     vs. `changes` (the change embedded into routine practice).
//   - the change vs. its upkeep → `changes` (what changed now) vs.
//     `sustainability` (owner + monitoring + next cycle).
//   - system change vs. personal learning → `changes` vs. `reflection` (what the
//     trainee learned about LEADING improvement). Mirrors SEA's
//     changes_made / personal_learning split.
//
// `threshold: 'strong'` is used on the three probes that define QI rigour, in
// line with the GMC/RCGP emphasis and the 2-3 strong-gate precedent of the other
// templates: the measurable aim (`aim`), the iterative PDSA method
// (`methodology`), and the reflection on leading improvement (`reflection`).
// Everything else clears at the default 'adequate'.
//
// `patient_involvement` is OPTIONAL (`required: false`): modern QI best practice
// rewards involving patients/service users, but it is not mandatory, so — like
// LEA/SEA's significant-event boxes — it never gates completeness, is never asked
// as a follow-up, and the reflect node drops it from the rendered entry when
// empty, lighting up only when the trainee actually involved patients.
//
// Word count sits well above the reflective logs (LEA/SEA 250-450, CCR 150-300):
// a QIP is a full multi-section project report.
export const QIP_TEMPLATE: ArtefactTemplate = {
  id: 'QIP_TEMPLATE',
  name: 'Quality Improvement Project',
  wordCountRange: { min: 500, max: 850 },
  sections: flatSections([
    {
      id: 'rationale',
      label: 'Rationale & Problem Statement',
      required: true,
      descriptorCriteria:
        'Strong = a clearly defined quality problem AND why it matters in this practice or ' +
        'population, grounded in evidence, guidance, or local data. ' +
        'Adequate = an identified problem with some justification of why it matters. ' +
        'Shallow = a vague topic ("improve diabetes care") with no defined problem or stated ' +
        'need.',
      description:
        'Why this project was undertaken: the specific quality problem or gap identified in ' +
        'the practice, who it affects, and why it matters — grounded in evidence, guidance, or ' +
        'local data. The problem only: do NOT state the improvement goal or target ' +
        '(→ Aim & Measures) or how the project was run (→ Method & PDSA Cycles).',
      promptHint:
        'Describe the quality gap you identified and why it matters here, referencing any ' +
        'guideline or local data that frames it. State the problem; leave the target you set ' +
        'to Aim & Measures.',
      extractionQuestion:
        'What quality problem did you identify, and why did it matter in your practice?',
      weight: 0.1,
    },
    {
      id: 'aim',
      label: 'Aim & Measures',
      required: true,
      threshold: 'strong',
      descriptorCriteria:
        'Strong = a specific, measurable aim with a numeric target and timeframe (SMART) AND ' +
        'the measure(s) that would show improvement, ideally including a balancing measure ' +
        '(an unintended-harm check). ' +
        'Adequate = a stated aim with some sense of the improvement sought and how it would be ' +
        'measured. ' +
        'Shallow = a vague intention ("improve uptake") with no target, timeframe, or defined ' +
        'measure.',
      description:
        'The improvement goal and how success is defined: a SMART aim (specific, measurable, ' +
        'with a target and timeframe) and the measure(s) used to judge improvement — outcome, ' +
        'process, and where relevant a balancing measure. The plan for measurement only: do ' +
        'NOT report the data you actually collected (→ Results & Data).',
      promptHint:
        'State the SMART aim and the measures that define success, including a balancing ' +
        'measure if one applies. Keep this to the planned target and metrics; the figures you ' +
        'obtained belong in Results & Data.',
      extractionQuestion:
        'What were you aiming to achieve, with what target, and how would you measure success?',
      weight: 0.15,
    },
    {
      id: 'methodology',
      label: 'Method & PDSA Cycles',
      required: true,
      threshold: 'strong',
      descriptorCriteria:
        'Strong = a clear method — data-collection approach and sample — AND at least two PDSA ' +
        'cycles described as an iterative sequence (what was tested, what was learned, what ' +
        'changed for the next cycle). ' +
        'Adequate = a described approach with some method detail and at least one cycle of ' +
        'testing. ' +
        'Shallow = a bare "did an audit" or single data pull with no testing cycle or ' +
        'iteration.',
      description:
        'How the project was run: the data-collection approach and sample, and the ' +
        'Plan-Do-Study-Act cycles used to test changes — at least two, shown as an iterative ' +
        'sequence where each cycle informed the next. The testing process only: do NOT ' +
        'describe the change that was ultimately embedded (→ Changes Implemented) or the ' +
        'planned measures (→ Aim & Measures).',
      promptHint:
        'Describe how you collected data and the PDSA cycles you ran, making the iteration ' +
        'explicit (cycle 1 → what you learned → cycle 2). Keep this to the process of testing; ' +
        'the change you kept belongs in Changes Implemented.',
      extractionQuestion:
        'How did you run the project — your data collection and the PDSA cycles you went ' +
        'through?',
      weight: 0.15,
    },
    {
      id: 'stakeholders',
      label: 'Team & Stakeholder Engagement',
      required: true,
      descriptorCriteria:
        "Strong = who was involved AND how they were engaged, clearly distinguishing the " +
        "trainee's own contribution from the collaborative work. " +
        'Adequate = the people involved named with some sense of how they were engaged. ' +
        'Shallow = a bare mention that "the team was involved" with no detail or personal role.',
      description:
        'Who was involved in the project and how they were engaged — the wider team, practice ' +
        'staff, or patients — and what the trainee personally contributed versus what was done ' +
        'collaboratively. Do NOT restate the project method here (→ Method & PDSA Cycles).',
      promptHint:
        'Name who you worked with and how you brought them on board, and be explicit about ' +
        "your own contribution versus the team's. Keep method detail in Method & PDSA Cycles.",
      extractionQuestion:
        'Who did you involve in this project, how did you engage them, and what was your own ' +
        'contribution?',
      weight: 0.1,
    },
    {
      id: 'results',
      label: 'Results & Data',
      required: true,
      descriptorCriteria:
        'Strong = specific findings with key figures or trends against the baseline, stating ' +
        'what did AND did not improve. ' +
        'Adequate = results reported with some concrete data. ' +
        'Shallow = a vague claim of improvement ("things got better") with no figures or ' +
        'baseline comparison.',
      description:
        'What the data actually showed: the quantitative and qualitative findings measured ' +
        'against the baseline, including where the aim was met and where it was not. The data ' +
        'only: do NOT restate the planned measures (→ Aim & Measures) or the reflective ' +
        'lessons (→ Reflection & Learning).',
      promptHint:
        'Report the figures and trends against your baseline, including what did not change. ' +
        'Present the data plainly; save interpretation of what it means for you to Reflection ' +
        '& Learning.',
      extractionQuestion: 'What did your data show, compared with your baseline?',
      weight: 0.15,
    },
    {
      id: 'changes',
      label: 'Changes Implemented',
      required: true,
      descriptorCriteria:
        'Strong = the specific change(s) made in response to the data AND how they were ' +
        'embedded into routine practice. ' +
        'Adequate = a described change linked to the findings. ' +
        'Shallow = a bare statement that "we made changes" with no specifics or link to the ' +
        'data.',
      description:
        'The concrete change(s) to practice that resulted from the data, and how they were ' +
        'embedded into routine working (a new protocol, template, workflow, or process). The ' +
        'embedded change only: do NOT describe the testing cycles (→ Method & PDSA Cycles) or ' +
        'how the change will be maintained long-term (→ Sustainability & Next Steps).',
      promptHint:
        'Describe what you actually changed off the back of the data and how it became part of ' +
        'routine practice. Keep the testing process in Method, and the long-term upkeep in ' +
        'Sustainability.',
      extractionQuestion: 'What did you change in practice as a result of your findings?',
      weight: 0.1,
    },
    {
      id: 'sustainability',
      label: 'Sustainability & Next Steps',
      required: true,
      descriptorCriteria:
        'Strong = a concrete plan to maintain the improvement AND a named owner or monitoring ' +
        'mechanism, with the next cycle or re-audit identified. ' +
        'Adequate = some plan for how the improvement will continue. ' +
        'Shallow = a bare assertion it "will be sustained" with no owner, mechanism, or next ' +
        'step.',
      description:
        'How the improvement will be maintained after the project ends — the owner, the ' +
        'monitoring or re-audit mechanism, and the next cycle or planned spread. Do NOT restate ' +
        'the change itself (→ Changes Implemented).',
      promptHint:
        'Describe who will keep this going, how it will be monitored, and the next cycle or ' +
        're-audit. Keep the change itself in Changes Implemented.',
      extractionQuestion:
        'How will this improvement be sustained, who owns it, and what is the next step?',
      weight: 0.05,
    },
    {
      id: 'reflection',
      label: 'Reflection & Learning',
      required: true,
      threshold: 'strong',
      descriptorCriteria:
        'Strong = genuine insight into what the trainee learned about leading improvement and ' +
        'working with the team AND a concrete change to how they will approach future QI, ' +
        'framed as what to maintain, improve, or stop. ' +
        'Adequate = one genuine learning point about the QI experience with some ' +
        'forward-looking action. ' +
        'Shallow = a bare verdict on the project ("it went well") with no learning about the ' +
        'improvement process.',
      description:
        'What the trainee personally learned about the improvement process itself — leading ' +
        'change, working with teams, handling data and setbacks — and how it will shape their ' +
        'future practice, framed as what to maintain, improve, or stop. Personal learning ' +
        'only: do NOT restate the project results (→ Results & Data) or the system changes ' +
        'made (→ Changes Implemented).',
      promptHint:
        'Reflect on what running this taught you about leading improvement and working with ' +
        "others, and what you will do differently next time. Keep this to your own learning, " +
        "not the project's data or the system changes.",
      extractionQuestion:
        'What did you learn about the improvement process and leading change, and what would ' +
        'you do differently next time?',
      weight: 0.17,
    },
    {
      // Optional, like LEA/SEA's significant-event boxes: rewards involving
      // patients/service users (modern QI best practice) without penalising its
      // absence. Never gates completeness, never asked as a follow-up, and dropped
      // from the rendered entry when empty.
      id: 'patient_involvement',
      label: 'Patient & Service-User Involvement',
      required: false,
      description:
        'How patients or service users were involved in shaping or evaluating the ' +
        'improvement — their input, feedback, or role. Most relevant where the change affects ' +
        'patient experience; leave empty if not applicable.',
      promptHint:
        'If patients or service users informed the project, note how they were involved and ' +
        'what their input changed.',
      extractionQuestion: 'Were patients or service users involved in this project, and how?',
      weight: 0.03,
    },
  ]),
};
