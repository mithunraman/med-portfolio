# The Full RCGP Portfolio Taxonomy

The RCGP portfolio mixes two things: **assessment types** (things supervisors/others do) and **log entry types** (things the trainee writes). This distinction is critical because **only the trainee-authored ones are relevant for dictation.**

---

## Category 1: Workplace-Based Assessments (WPBAs)

_Involve a supervisor or assessor — trainee doesn't "dictate" these alone_

| Type | What it is | Trainee dictates? |
|------|-----------|-------------------|
| **COT** (Consultation Observation Tool) | Supervisor observes a real consultation in primary care | No — supervisor completes the form |
| **Audio-COT** | COT based on recorded consultation | No — supervisor scores it |
| **Mini-CEX** | Observed patient interaction in non-primary care | No — supervisor completes |
| **CbD** (Case-Based Discussion) | Discussion about a case with supervisor | Partially — trainee prepares, supervisor scores |
| **CAT** (Care Assessment Tool) | 9 subtypes: routine session, duty/triage, document management, e-consults, lab review, leadership, prescribing follow-up, random cases, referrals review | No — supervisor scores |
| **CEPS** | Clinical Examination and Procedural Skills | No — observed and signed off |
| **MSF** (Multi-Source Feedback) | 360-degree colleague feedback | No — collected from others |
| **PSQ** (Patient Satisfaction Questionnaire) | Patient feedback on consultations | No — collected from patients |

---

## Category 2: Reports

_Written by supervisors, not the trainee_

| Type | What it is | Trainee dictates? |
|------|-----------|-------------------|
| **CSR** (Clinical Supervisor Report) | Supervisor's structured report per post | No |
| **ESR** (Educational Supervisor Report) | 6-monthly overview of progress | No |

---

## Category 3: Learning Log Entries

_Trainee-authored reflections — THIS is what the app generates_

| Type | What it is | Trainee dictates? |
|------|-----------|-------------------|
| **Clinical Case Review (CCR)** | Reflection on a patient case personally seen | **Yes** — the primary use case |
| **Significant Event Analysis (SEA)** | Event that meets GMC harm threshold | **Yes** |
| **Learning Event Analysis (LEA)** | Event with learning opportunity (no harm) | **Yes** |
| **Reflection on Feedback** | Reflection on MSF, PSQ, exam results | **Yes** |
| **Leadership & Professionalism** | Chairing meetings, presentations, management | **Yes** |
| **Academic Activities** | For academic-track trainees | **Yes** (niche) |
| **Unscheduled/Urgent Care (UUC/OOH)** | Out-of-hours session reflections | **Yes** |
| **Additional Evidence** | Non-clinical evidence, identified learning needs | **Yes** |

---

## Category 4: Planning & QI

_Trainee-authored but structured differently_

| Type | What it is | Trainee dictates? |
|------|-----------|-------------------|
| **Placement Planning Meeting** | Start-of-post meeting with supervisor | Partially — collaborative |
| **PDP** (Personal Development Plan) | Learning needs and goals | **Yes** |
| **QIP** (Quality Improvement Project) | Full structured project | **Yes** — but long-form, not a single dictation |
| **QIA** (Quality Improvement Activity) | Smaller QI evaluation | **Yes** |
| **Prescribing Assessment** | ST3 formative prescribing exercise | Partially |

---

## Classification Targets for the App

The app's dictation flow applies to **Category 3 (Learning Log entries)** plus parts of Category 4. WPBAs and reports are external processes the app doesn't generate.

### Excluded from classification (3 types — not dictated)

| Type | Why excluded |
|------|-------------|
| **Additional Evidence** | A catch-all upload bucket for certificates and documents. No reflective structure. Not a dictation. |
| **Placement Planning Meeting** | Collaborative meeting at the start of a post. Happens with the supervisor present, not dictated afterwards. |
| **PDP** | The app generates PDP _from_ entries. A standalone PDP isn't dictated, it's assembled from learning needs across entries. |

### Entry-type enum (9 types)

| Entry type | Enum value | Maps to RCGP type | Frequency | Template used |
|-----------|------------|-------------------|-----------|---------------|
| **Clinical Case Review** | `CLINICAL_CASE_REVIEW` | CCR (Learning Log) | Most common — 36/year required | CCR template |
| **Significant Event / Learning event analysis** | `SIGNIFICANT_EVENT` | SEA + LEA | At least 1 SEA per 6 months, 1 LEA per year | LEA/SEA template |
| **Reflection on Feedback** | `FEEDBACK_REFLECTION` | Reflection on MSF/PSQ/exams | After each feedback cycle | Feedback template |
| **Leadership Activity** | `LEADERSHIP_ACTIVITY` | Leadership & Professionalism log | Required in ST3 | Leadership template |
| **Academic Activity** | `ACADEMIC_ACTIVITY` | Academic Activities log | When applicable (academic trainees) | Generic Reflective template |
| **Out of Hours** | `OUT_OF_HOURS` | UUC/OOH log | When applicable | Shares CCR template |
| **QI Project** | `QI_PROJECT` | QIP | At least 1 in primary care | QIP template |
| **QI Activity** | `QI_ACTIVITY` | QIA | At least 1 per year | QIA template |
| **Prescribing** | `PRESCRIBING` | Prescribing Assessment | ST3 | Prescribing template |

### Template mapping (9 types, 8 unique templates)

```
CLINICAL_CASE_REVIEW  → CCR_TEMPLATE
SIGNIFICANT_EVENT     → LEA_SEA_TEMPLATE      (covers both LEA and SEA)
FEEDBACK_REFLECTION   → FEEDBACK_TEMPLATE
LEADERSHIP_ACTIVITY   → LEADERSHIP_TEMPLATE
ACADEMIC_ACTIVITY     → GENERIC_REFLECTIVE_TEMPLATE
OUT_OF_HOURS          → CCR_TEMPLATE          (reuses CCR)
QI_PROJECT            → QIP_TEMPLATE
QI_ACTIVITY           → QIA_TEMPLATE
PRESCRIBING           → PRESCRIBING_TEMPLATE
```

### Entry-type signals

> Retained as **guidance for the trainee choosing a type**, not as machine input. These
> were once `classificationSignals` fed to a classifier node; that node is gone and the
> trainee picks the type at artefact creation. Nothing here is read by code.

| Type | Key signals in transcript |
|------|--------------------------|
| **Clinical Case Review** | Specific patient, clinical details, diagnosis, management, no adverse event |
| **Significant Event / Learning event analysis** | Harm, near-miss, complaint, unexpected outcome, patient safety, GMC threshold — **or** a learning opportunity where no harm occurred. Both go here; the harm threshold changes which optional sections light up, not which entry type to pick |
| **Feedback Reflection** | MSF results, PSQ scores, exam feedback, colleague feedback, survey results |
| **Leadership Activity** | Chairing, presenting, managing, supervising, team conflict, organisational change |
| **Academic Activity** | Research, teaching, academic presentation, journal club, literature review |
| **Out of Hours** | On call, OOH session, out of hours, urgent care, unscheduled, overnight |
| **QI Project** | Full audit cycle, data collection over time, protocol change, PDSA cycle |
| **QI Activity** | Smaller improvement, single audit, brief evaluation, practice-level change |
| **Prescribing** | Prescribing patterns, medication review, formulary, polypharmacy, drug interactions |

### Key distinction: CCR vs SEA/LEA

The choice that matters, and now the only one the trainee has to make here — SEA and LEA
were merged into a single type, so the hard three-way call is a two-way one:

- **CCR**: Clinical case, no adverse event. Focus on clinical reasoning and learning.
- **Significant Event / Learning event analysis**: Something went wrong, nearly did, or
  could have. Focus on root cause and what changed as a result. Whether it crossed the GMC
  harm threshold determines how much of the optional impact detail is expected — it no
  longer determines which entry type to pick.

The SEA-vs-LEA judgement still matters for the trainee's own ARCP counting (an SEA is
required at least every 6 months, an LEA at least yearly) — but that is a labelling
question for their ePortfolio, not a branch in this app.

---

## Sources

- [RCGP WPBA Overview](https://www.rcgp.org.uk/mrcgp-exams/wpba)
- [RCGP Trainee Portfolio Features](https://www.rcgp.org.uk/mrcgp-exams/trainee-portfolio/features)
- [RCGP WPBA Assessments](https://www.rcgp.org.uk/mrcgp-exams/wpba/assessments)
- [RCGP Learning Log](https://www.rcgp.org.uk/mrcgp-exams/wpba/assessments/learning-log)
- [RCGP WPBA Requirements Summary](https://www.rcgp.org.uk/getmedia/a348f568-3ed9-466d-967a-1df16cff200c/WPBA-Requirements-Mandatory-Evidence-Summary-Sheet.pdf)
- [Severn Deanery ePortfolio Guidance](https://primarycare.severndeanery.nhs.uk/training/trainees/sw-gp-assessment-hub/show/eportfolio-and-assessments)
