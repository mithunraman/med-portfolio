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

### Classification enum (10 types)

| Entry type | Enum value | Maps to RCGP type | Frequency | Template used |
|-----------|------------|-------------------|-----------|---------------|
| **Clinical Case Review** | `CLINICAL_CASE_REVIEW` | CCR (Learning Log) | Most common — 36/year required | CCR template |
| **Significant Event** | `SIGNIFICANT_EVENT` | SEA | At least 1 per 6 months | SEA template |
| **Learning Event** | `LEARNING_EVENT` | LEA | At least 1 per year | LEA template |
| **Reflection on Feedback** | `FEEDBACK_REFLECTION` | Reflection on MSF/PSQ/exams | After each feedback cycle | Feedback template |
| **Leadership Activity** | `LEADERSHIP_ACTIVITY` | Leadership & Professionalism log | Required in ST3 | Leadership template |
| **Academic Activity** | `ACADEMIC_ACTIVITY` | Academic Activities log | When applicable (academic trainees) | Shares LEA template |
| **Out of Hours** | `OUT_OF_HOURS` | UUC/OOH log | When applicable | Shares CCR template |
| **QI Project** | `QI_PROJECT` | QIP | At least 1 in primary care | QIP template |
| **QI Activity** | `QI_ACTIVITY` | QIA | At least 1 per year | QIA template |
| **Prescribing** | `PRESCRIBING` | Prescribing Assessment | ST3 | Prescribing template |

### Template mapping (10 types, 8 unique templates)

```
CLINICAL_CASE_REVIEW  → CCR_TEMPLATE
SIGNIFICANT_EVENT     → SEA_TEMPLATE
LEARNING_EVENT        → LEA_TEMPLATE
FEEDBACK_REFLECTION   → FEEDBACK_TEMPLATE
LEADERSHIP_ACTIVITY   → LEADERSHIP_TEMPLATE
ACADEMIC_ACTIVITY     → LEA_TEMPLATE          (reuses LEA)
OUT_OF_HOURS          → CCR_TEMPLATE          (reuses CCR)
QI_PROJECT            → QIP_TEMPLATE
QI_ACTIVITY           → QIA_TEMPLATE
PRESCRIBING           → PRESCRIBING_TEMPLATE
```

### Classification signals

| Type | Key signals in transcript |
|------|--------------------------|
| **Clinical Case Review** | Specific patient, clinical details, diagnosis, management, no adverse event |
| **Significant Event** | Harm, near-miss, complaint, unexpected outcome, patient safety, GMC threshold |
| **Learning Event** | Learning opportunity arose, no harm occurred, could have gone wrong, improvement potential |
| **Feedback Reflection** | MSF results, PSQ scores, exam feedback, colleague feedback, survey results |
| **Leadership Activity** | Chairing, presenting, managing, supervising, team conflict, organisational change |
| **Academic Activity** | Research, teaching, academic presentation, journal club, literature review |
| **Out of Hours** | On call, OOH session, out of hours, urgent care, unscheduled, overnight |
| **QI Project** | Full audit cycle, data collection over time, protocol change, PDSA cycle |
| **QI Activity** | Smaller improvement, single audit, brief evaluation, practice-level change |
| **Prescribing** | Prescribing patterns, medication review, formulary, polypharmacy, drug interactions |

### Key distinction: CCR vs SEA vs LEA

The most important classification to get right. A trainee dictating a case could be any of these three:

- **CCR**: Clinical case, no adverse event. Focus on clinical reasoning and learning.
- **SEA**: Something went wrong or nearly did (GMC harm threshold). Focus on root cause and systemic change.
- **LEA**: Something could have gone wrong but didn't, or a learning opportunity arose. Focus on what was learned and how to improve.

---

## Sources

- [RCGP WPBA Overview](https://www.rcgp.org.uk/mrcgp-exams/wpba)
- [RCGP Trainee Portfolio Features](https://www.rcgp.org.uk/mrcgp-exams/trainee-portfolio/features)
- [RCGP WPBA Assessments](https://www.rcgp.org.uk/mrcgp-exams/wpba/assessments)
- [RCGP Learning Log](https://www.rcgp.org.uk/mrcgp-exams/wpba/assessments/learning-log)
- [RCGP WPBA Requirements Summary](https://www.rcgp.org.uk/getmedia/a348f568-3ed9-466d-967a-1df16cff200c/WPBA-Requirements-Mandatory-Evidence-Summary-Sheet.pdf)
- [Severn Deanery ePortfolio Guidance](https://primarycare.severndeanery.nhs.uk/training/trainees/sw-gp-assessment-hub/show/eportfolio-and-assessments)
