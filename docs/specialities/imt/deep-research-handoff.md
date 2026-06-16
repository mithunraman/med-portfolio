# IMT (Internal Medicine Training) — Deep Research Handoff

**Last updated:** 2026-06-16
**Status:** Research / scoping complete. No code written. No commitment to build yet.
**Owner context:** Exploratory product/architecture investigation into whether the existing reflective-portfolio engine can serve UK Internal Medicine Training (IMT) trainees, and what it would take.

---

## 1. Purpose, Scope & Current Status

### Purpose
Evaluate adding **UK Internal Medicine Training (IMT)** as a supported specialty in the portfolio app, and determine — at **component granularity** — which IMT ARCP artefacts the existing AI pipeline can produce as-is, which need new infrastructure, and which are out of scope.

### How this investigation started
A chain of questions that began with a friend applying for **ST4 plastic surgery**, broadened into UK medical training market-sizing, then narrowed to **Internal Medicine** as the most attractive expansion target, and finally drilled into **what a complete IMT ARCP artefact looks like** and **how each maps to the app's pipeline**.

### Scope
- **In scope:** IMT **Stage 1 (IMY1–IMY3)** ARCP evidence artefacts; their structure; their compatibility with the app's reflective pipeline; the architecture changes implied.
- **Out of scope (this phase):** IMT Stage 2 / GIM (separate ARCP Decision Aid, different counts); actually writing any code; surgical specialties (parked — see §9).

### Current status
- ✅ Market sizing complete (§4).
- ✅ Training-pathway structure mapped (§5).
- ✅ Full IMT ARCP artefact inventory researched with multi-source confirmation (§6).
- ✅ Component-granularity compatibility analysis complete (§7).
- ✅ Architecture recommendation defined (§8).
- ❌ No build scope document yet (recommended next step — §13).
- ❌ No code changes.

---

## 2. Product / Codebase Context (Confirmed)

The app is a **reflective-writing authoring engine**, not a generic portfolio store. A medical trainee narrates an experience (audio/text); the AI classifies it, elicits missing detail, scores it against rubrics, composes a polished prose reflection, tags it against a capability framework, and generates a PDP.

**Already multi-specialty.** The codebase has a specialty registry with three configs:

| Specialty | `isActive` | File |
|---|---|---|
| GP (General Practice) | `true` | `apps/api/src/specialties/gp/` |
| Internal Medicine | `false` | `apps/api/src/specialties/internal-medicine/` |
| Psychiatry | `false` | `apps/api/src/specialties/psychiatry/` |

> **Note:** An `internal-medicine/` config **already exists but is inactive** (`isActive: false` in the registry). Its current contents were **not audited** in this research phase — see Open Questions (§12).

### Key source paths (confirmed to exist)
| Path | What it is |
|---|---|
| `apps/api/src/specialties/specialty.registry.ts` | Registry: `SPECIALTY_CONFIGS`, `getSpecialtyConfig`, `getTemplateForEntryType`, `isValidTrainingStage` |
| `apps/api/src/specialties/gp/gp.templates.ts` | GP `ArtefactTemplate`s (LEA, FEEDBACK, LEADERSHIP, QIP, QIA, PRESCRIBING) |
| `apps/api/src/specialties/gp/gp.entry-types.ts` | `GP_ENTRY_TYPES` (`EntryTypeDefinition[]`) with `classificationSignals` |
| `apps/api/src/specialties/gp/gp.capabilities.ts` | RCGP capability framework (C-01…C-13 across 5 domains) |
| `apps/api/src/specialties/gp/gp.training-stages.ts` | Flat `TrainingStageDefinition[]` (ST1→ST2→ST3) |
| `apps/api/src/specialties/gp/templates/` | `sea.template.ts`, `ccr.template.ts`, `index.ts` |
| `packages/shared/src/specialty/types.ts` | Core types: `Probe`, `Section`, `ArtefactTemplate`, `EntryTypeDefinition`, `CapabilityDefinition`, `TrainingStageDefinition`, `SpecialtyConfig` |
| `packages/shared/src/specialty/template.helpers.ts` | `leafProbes`, `sectionForProbe`, `probeThreshold`, `flatSections` |
| `apps/api/src/portfolio-graph/nodes/` | LangGraph pipeline node implementations |

### The pipeline (LangGraph node chain — confirmed from `portfolio-graph/nodes/`)
```
gather-context → classify → present-classification (interrupt)
  → check-completeness → generate-followup → ask-followup (interrupt)
  → reflect → present-draft
  → tag-capabilities → elicit-justification → present-capabilities (interrupt)
  → generate-pdp → save
```
Node files: `gather-context`, `classify`, `present-classification`, `check-completeness`, `generate-followup`, `ask-followup`, `reflect`, `present-draft`, `tag-capabilities`, `elicit-justification`, `present-capabilities`, `generate-pdp`, `save`, plus utils `capability-grading.util.ts`, `compose-verify.util.ts`, and `ask-clarification.node.ts`.

### Core type shapes (confirmed from `packages/shared/src/specialty/types.ts`)
- **`Probe`** — leaf elicitation/scoring unit: `id`, `label`, `required`, `description`, `promptHint`, `extractionQuestion` (`string|null`), `weight` (weights within a template sum to 1.0), optional `descriptorCriteria` (strong/adequate/shallow rubric), optional `threshold` (`'adequate'|'strong'`).
- **`Section`** — a document field; owns one or more `Probe`s; optional `composePrompt`.
- **`ArtefactTemplate`** — `id`, `name`, `sections: Section[]`, `wordCountRange: {min,max}`.
- **`EntryTypeDefinition`** — `code`, `label`, `description`, `templateId`, `classificationSignals: string[]`.
- **`CapabilityDefinition`** — `code`, `name`, `description`, optional `descriptorCriteria`, optional `exemplars`, `domainCode`, `domainName`.
- **`SpecialtyConfig`** — `specialty`, `name`, `entryTypes`, `templates` (keyed by id), `capabilities`, `trainingStages`.

### Relevant CLAUDE.md / project facts
- **Not yet live** — no prod users/data. Breaking schema/DTO changes are fine; no backfills/migrations/deprecations needed.
- pnpm + Turborepo monorepo. `apps/api` (NestJS, Mongo/Mongoose), `apps/mobile` (Expo/RN), `apps/web` (Vite/React), `packages/shared`, `packages/api-client`.
- After editing `packages/shared` or `packages/api-client`, rebuild (`pnpm build`) before dependent apps pick up changes.
- Existing **PII redaction architecture**: post-transcription (regex + OpenAI), applied on the **audio path**. (See memory `redaction-architecture.md`.)

---

## 3. The Central Compatibility Framework (the project's core mental model)

The pipeline is not generic. A unit of evidence is **pipeline-compatible only if all four criteria hold**:

1. **Trainee-authored** — input originates from the trainee (not an assessor/rater/exam board).
2. **Has reflective narrative to deepen** — there are gaps to probe / follow-up questions to ask.
3. **Outputs rubric-scored prose** — composes a narrative against `descriptorCriteria` + `wordCountRange`.
4. **Single-actor** — needs only the trainee; no third-party sign-off.

Which criterion an artefact fails tells you *why* it's incompatible, sorting everything into three tiers:

| Tier | Definition | Pipeline treatment |
|---|---|---|
| **A** | Reflective, single-actor narrative | ✅ **Native** — runs the full graph, ships as config |
| **B** | Structured record / counter (fails crit. 2 & 3) | ❌ Needs a new **`kind` discriminator**; value is **aggregation**, not prose |
| **C** | Multi-actor / external (fails crit. 1 & 4) | ❌ Out of scope — app does **"reflect-after"** on the *result*, never produces it |

**Key insight (this is the crux of the whole investigation):** Most IMT artefacts are **composites**, not single-tier. A single verdict per artefact is wrong/misleading. Cut at the **component** level instead. The pipeline owns a **reflective-narrative *layer*** that threads through ~13 artefacts — not whole artefacts.

---

## 4. Market Sizing (Research Findings)

All figures are **best available public data**; derived estimates labelled. Backdrop: ~60,000 doctors in UK training; ~12,176 specialty-training places (2023/24).

### Why IMT was chosen as the focus
Among "top 5 reflection-fit specialties" (GP, Psychiatry, Internal Medicine, Paediatrics, Emergency Medicine), **Internal Medicine is the largest secondary-care market** and one config unlocks ~30 downstream physician sub-specialties.

### Trainee headcounts (across all years)
| Specialty | Count (all years) | Basis | Confidence |
|---|---|---|---|
| **Internal Medicine (IMT + physician HST)** | **~12,000** | HST **7,004** (2023 RCP census, *hard*) + IMT core **~5,000** (1,678 posts/yr × 3, *derived*) | High (HST) / Medium (IMT) |
| **Psychiatry** | **~1,500–1,800** | Last hard census **1,352** (2021); adjusted up for post-2022 core expansion (489 CT1 posts/yr, 21.83:1) | Medium |

**Conclusion:** Medicine is ~7–8× psychiatry's trainee base. "Internal Medicine" is not one specialty — it's a **shared IMT stem + ~30 physician-specialty leaves**, all on the same JRCPTB reflective ePortfolio.

### Entry-post / competition context (sourced)
| Programme | Posts/yr | Applicants | Ratio | Year |
|---|---|---|---|---|
| IMT CT1 | 1,678 | 8,841 | — | 2025 |
| Core Psychiatry CT1 | 489 | 10,677 | 21.83:1 | 2025 |
| GP ST1 | 4,276 | ~21,000 | 4.91:1 | 2025 |
| Plastic Surgery ST3 | 42 | 281 | 6.69:1 | 2025 |

---

## 5. UK Training-Pathway Structure (Confirmed Domain Context)

### CT vs ST vs IMT terminology
- **CT = Core Training** — entry stage of *uncoupled* pathways. CT1/CT2(/CT3). Still used by **Core Surgical Training (CT1–CT2)**, **Core Psychiatry (CT1–CT3)**, and **ACCS (CT1–CT3)**.
- **Internal Medicine has NO "CT".** Core Medical Training (CMT, 2 yr, CT1–CT2) was **renamed and restructured to IMT (IMT1–IMT3, 3 yr) in 2019.** "CT1–CT3 in medicine" is the *old* name for IMT1–3.
- **ST = Specialty Training** — either run-through (ST1→CCT, no re-application) or higher (ST3/ST4+).
- **Anaesthetics** moved to run-through ST1–ST7 in 2021 (older sources still say CT1–CT2).

### IMT internal structure — a branching tree, not linear
- **IMT1 + IMT2 (Stage 1): common to ALL** internal medicine trainees (same curriculum, same MRCP requirement).
- **IMT3: only Group 1** (dual-CCT) trainees.
- **Fork at end of IMT2:**

| | Group 1 (dual CCT w/ GIM) | Group 2 (single CCT) |
|---|---|---|
| IMT length | IMT1–3 | IMT1–2 |
| Enter higher training at | **ST4** | **ST3** |
| As consultant | Does acute medical take ("medical reg") | No GIM |
| Examples | Cardiology, Respiratory, Gastroenterology, Geriatric Medicine, Acute Internal Medicine, Endocrinology & Diabetes, Renal, Rheumatology | Dermatology, Medical Oncology, Palliative Medicine, GUM, Allergy, Clinical Genetics, Rehabilitation Medicine |

> **Caveat:** Exact Group 1/Group 2 specialty allocation is defined by **JRCPTB**; public deanery summaries contradict each other on a few specialties (e.g. neurology, palliative medicine). Treat the JRCPTB list as canonical — `Not fully established here`.

### Progression gate (both groups)
Full **MRCP(UK)** diploma + ARCP sign-off of the Stage 1 curriculum.

### Modelling implication for the app
"Internal Medicine" cannot be a flat `TrainingStageDefinition` list like GP's. It is a **shared IMT1–2 stem → Group 1/Group 2 fork → ~30 specialty leaves**. Two consequences:
1. Training stages must encode the fork (a flat `ST4` is ambiguous; Group 2 has no ST4 entry).
2. IMT1–2 share the internal-medicine curriculum (reusable), but each higher specialty has its own capability framework.

---

## 6. IMT ARCP Artefact Inventory (Research Findings, Multi-Source Confirmed)

Researched via parallel agents; each artefact corroborated against **≥2 independent sources** (JRCPTB/The Federation, RCP/RCPE, deanery guides, primary forms read directly where possible). **The Federation/JRCPTB live site blocks automated fetching (HTTP 403)** — some field-level wording came via mirrors/archives; headline numbers cross-validated across ≥2 domains.

### Two rating scales recur across assessments
- **Generic CiPs / global:** "Below / Meeting / Above expectations for this year of training."
- **Clinical CiPs / entrustment:** **Level 1** (observe only) → **2** (act w/ direct supervision) → **3** (act w/ indirect supervision) → **4** (act unsupervised). Level 4 across all = completion standard.

### Capability framework (CiPs) — confirmed
**14 CiPs = 6 Generic + 8 Clinical.** 4-level entrustment scale for the 8 Clinical CiPs (the "5-level" figure seen in one source was **RCOG/O&G cross-contamination** — IMT is 4 levels). Trainee self-rates (advisory) + links evidence; **only the ES makes the entrustment decision**; ARCP panel assures decisions are "evidence-based and defensible." Curriculum also has a "key presentations and conditions" table for breadth mapping.

### Complete IMT ARCP evidence checklist (per year; counts from IMT Stage 1 ARCP Decision Aid 2019, 2023 update)

| Evidence | IMY1 | IMY2 | IMY3 | Authored → validated by |
|---|---|---|---|---|
| Form R Part A (registration) | annual | annual | annual | Trainee → Dean's rep |
| Form R Part B (revalidation self-declaration) | annual | annual | annual | Trainee → ARCP panel |
| ES Report (ESR) | 1 | 1 | 1 | Educational Supervisor (makes entrustment decisions) |
| MCR (Multiple Consultant Report) | 4 | 4 (≥3 acute-take) | 4 (≥3 acute-take) | Consultants only (not ES) → collated by ES |
| MSF (≥12 raters, ≥3 consultants) | 1 | 1 | 1 | Colleague raters → ES releases & discusses |
| ACAT (each ≥5 cases) | 4 | 4 | 4 | Trainee initiates → consultant assessor completes |
| CbD / mini-CEX / OPCAT (= 2 OPCAT + 2 CEX/CbD) | 4 | 4 | 4 | Trainee initiates → assessor completes |
| MRCP(UK) | Part 1 passed | **Full diploma incl. PACES** | Full | Exam board (auto-upload) → panel verifies |
| ALS (Advanced Life Support) | valid | valid | valid | Provider course |
| QIP / QIPAT | participation | **≥1 project completed + QIPAT (by end IMY2)** | QI leadership | Trainee write-up → QIPAT by assessor |
| Outpatient clinics | 20 | 20 | 20 (**80 total**) | Trainee logs → ES verifies estimates |
| Acute unselected take | 100 pts | 100 | 100 (**500 total**) | Trainee logs → ES confirms CiP1 level 3 |
| Teaching attendance | 50h (≥20h CPD) | 50h | 50h | Trainee records → ES confirms (75% target) |
| Simulation | ≥1 day | scenario | scenario | Course |

**Cumulative by end of Stage 1:** continuing ward care **≥24 months**; critical care (ICU/HDU) **≥10 weeks** (≤2 blocks); geriatric medicine **≥4 months**; **≥1 MCR by a geriatrician**.

**Mandatory practical procedures (DOPS).** Five require **summative DOPS to independence by end of IMY2** (then maintained): **ascitic tap, lumbar puncture, NG tube, diagnostic pleural aspiration, DC cardioversion**. **Two separate summative DOPS** evidence independence (deanery rule); **self-entered DOPS are invalid**. Others need skills-lab/supervised practice only (advanced CPR, temporary external pacing, central venous cannulation, access to circulation for resuscitation, intercostal drains, abdominal paracentesis).

**SLE count clarification:** IMT = **4 ACATs + 4 CbD/mini-CEX/OPCAT per year** (8 consultant SLEs/yr). The "minimum 10 SLEs" figure elsewhere is the **older CMT 2017** aid — not current IMT.

### Artefact structure notes (confirmed)
- **Reflective log & Significant event:** In IMT these are the **same entry type** — shareable, curriculum-linked, **free-text, trainee-authored**, *not* a signed assessment object. Model: "What? / So what? / Now what?" (AoMRC/GMC) or Gibbs. No mandated field set. Unshared reflections are invisible to supervisors/ARCP. **GMC owns the principle that reflective notes are the trainee's own record, anonymised, "not a medical record."**
- **QIP:** Composite. Trainee write-up (Model for Improvement; **embeds quantitative data — PDSA cycles + run charts**) + **QIPAT** rating completed by an **assessor** (not the trainee), based on documentation/presentation review.
- **Teaching Observation (TO):** Composite. Trainee delivers + optional trainee reflection box; **assessor-rated form** (O/S/D/N per domain + overall). No fixed national minimum count in IMT Stage 1.
- **MCR:** **Consultant-only**, clinical focus, 8 rated domains, 3-point scale (Below/Meets/Above expectations for stage). Verbatim from primary JRCPTB form: *"It should only be completed by Consultants… the trainee will see your comments."* No trainee-authored portion (trainee only nominates raters with ES at placement start). Aim 4 consultants, max 6/yr. ES must **not** complete an MCR for own trainee.
- **MSF:** Rater questionnaires (generic GMP-domain skills) + **trainee self-assessment portion** + **trainee reflection on results** + ES releases collated summary. ≥12 raters, ≥3 consultants; trainee selects raters; trainee does **not** see individual responses. Exact current physician-MSF anchor wording = `Unconfirmed` (mini-PAT 6-point lineage is best evidence; JRCPTB MSF form was bot-blocked).
- **ESR:** Supervisor-authored synthesis (of MCR + MSF + SLEs + QIPAT + MRCP progress + teaching obs + patient survey + reflections), **paired with trainee pre-ESR CiP self-assessment** (the self-rating columns sit alongside ES ratings). ES makes entrustment/global judgement; **ARCP panel makes final summative call**. There is **no separately-named standalone "Clinical Supervisor Report"** in IMT — the CS structured input is the MCR + end-of-placement appraisal.
- **The official "clinic/procedure log" is a THIN per-POST counter, not a rich per-encounter log.** Verified by unzipping the genuine `.xlsx` (`xl/sharedStrings.xml`). The official workbook is *"IMT acute take calculator and log of clinics and procedures"* (dated 21/12/2019), uploaded to ePortfolio "Personal Library":
  - **Outpatient sheet columns:** Hospital | Start Date | End Date | Months in post | Number of outpatient clinics done by you | Name of ES who can verify. (No per-clinic date/specialty/case-mix.) Reflection lives **separately** in Reflective Practice.
  - **Procedures sheet columns:** Date | Procedure (dropdown of 12) | Skills lab | Supervised practice | DOPS completed | Comments.
  - **Acute take sheet columns:** Hospital | Start/End Date | Months in post | Avg takes/month | Avg patients/take | Estimated total patients (calculated) | ES who can verify.
  - **No patient identifiers recorded** in any sheet (counts/estimates only).
- **PDP:** NHS ePortfolio module. Fields: Learning objective | Target date | Action plan | "How will I know when achieved?" | Is-achieved | Outcome | auto created/updated dates. SMART, curriculum-derived. **Trainee authors & owns; ES reviews/agrees** (≥1 new PDP per ESR is mandatory); ARCP considers via ESR.

### ARCP outcome
Issued by ARCP panel (≥3 members incl. Dean/Head of School/TPD). Outcomes 1–6 (1 = satisfactory; 2 = targeted competencies; 3 = more time; 4 = released; 5 = insufficient evidence; 6 = completed).

---

## 7. Component-Granularity Compatibility Table (Primary Deliverable)

Legend: **A** = native pipeline (ship as config) · **B** = structured record (needs `kind`) · **C** = multi-actor (out of scope; reflect-after only).

| Artefact | Component | Author | Tier | Pipeline? |
|---|---|---|---|---|
| Reflective log | whole entry | Trainee | **A** | ✅ Native |
| Significant event | whole entry (= reflective log type) | Trainee | **A** | ✅ Native |
| Clinical case / CbD prep | case write-up & reflection | Trainee | **A** | ✅ Native |
| Reflection on feedback | whole entry | Trainee | **A** | ✅ Native |
| QIP | write-up narrative | Trainee | **A** | ✅ Native |
| QIP | embedded PDSA + run-chart data | Trainee | **B** | ❌ structured sidecar |
| QIP | QIPAT rating | Assessor | **C** | ❌ multi-actor |
| Teaching (TO) | trainee teaching reflection | Trainee | **A** | ✅ Native |
| Teaching (TO) | TO form (O/S/D/N ratings) | Assessor | **C** | ❌ multi-actor |
| PDP | goal (objective/action/measure) | Trainee | **A** | ✅ Native (`generate-pdp`) |
| PDP | ES review & agreement | Supervisor | **C** | ❌ light validation |
| Capability (CiP) self-assessment | per-entry capability tagging | Trainee | **A** | ✅ Native (`tag-capabilities`) |
| Capability (CiP) self-assessment | portfolio-wide 14-CiP rollup + evidence-linking | Trainee | **B** | ❌ cross-entry aggregation |
| Capability (CiP) self-assessment | ES entrustment decision (Lvl 1–4) | Supervisor | **C** | ❌ multi-actor |
| MSF | rater questionnaires (≥12) | Raters | **C** | ❌ multi-actor |
| MSF | trainee self-assessment portion | Trainee | **A** | ✅ Native |
| MSF | reflection on released results | Trainee | **A** | ✅ Native |
| MCR | whole report (8 domains) | Consultants only | **C** | ❌ multi-actor |
| ESR | pre-ESR CiP self-assessment | Trainee | **A** | ✅ Native |
| ESR | report/ratings/entrustment/rec. | Supervisor | **C** | ❌ multi-actor |
| Clinic log | per-post tally counter | Trainee | **B** | ❌ structured |
| Clinic log | linked reflection | Trainee | **A** | ✅ Native |
| Clinic log | ES verification of estimates | Supervisor | **C** | ❌ validation |
| Procedure log + DOPS | procedure log row | Trainee | **B** | ❌ structured |
| Procedure log + DOPS | DOPS sign-off (self-entry invalid) | Assessor | **C** | ❌ multi-actor |
| Acute take log | estimate calculator | Trainee | **B** | ❌ structured |
| Acute take log | ACAT assessments | Assessor | **C** | ❌ multi-actor |
| CPD / teaching attendance | attendance counter (75% target) | Trainee | **B** | ❌ structured |
| CPD / teaching attendance | reflection on teaching | Trainee | **A** | ✅ Native |
| WPBAs (ACAT/CbD/mini-CEX/OPCAT)¹ | case selection/initiation | Trainee | — | trigger only |
| WPBAs¹ | assessor ratings + free-text | Assessor | **C** | ❌ multi-actor |
| WPBAs¹ | trainee reflection on the SLE | Trainee | **A** | ✅ Native |
| MRCP exam | certificate (auto-upload) | Exam board | **C** | ❌ external doc |
| MRCP exam | reflection on result | Trainee | **A** | ✅ Native |
| Form R (A/B) | registration + self-declaration | Trainee | **B** | ❌ regulatory form |
| ALS / Simulation | course certificate | Provider | **C** | ❌ external doc |

¹ **Medium confidence** — the dedicated WPBA research cluster was cancelled mid-run; structure reconstructed from corroborating sources (logs + ARCP-checklist agents). Verify exact form fields against the live ePortfolio.

### What the table reveals
1. **The pipeline owns a *layer*, not artefacts.** Tier A appears in ~13 of ~18 artefacts, almost always as *one component* (the reflection). Truly native *whole* artefacts: reflective log, significant event, CbD prep, reflection-on-feedback, PDP.
2. **Exactly two non-pipeline component types, both clean:** Tier B structured counters (thin — clinic/procedure/acute-take/CPD/CiP-rollup/Form R; **value is aggregation, not storage**) and Tier C multi-actor (MCR, QIPAT, TO, DOPS, ACAT/CbD ratings, ESR body, MSF questionnaires, certs).
3. **The "reflect-after" bridge is large.** Every Tier C artefact has a trainee reflection hanging off its *result* (MSF/exam/WPBA/significant-event) — all Tier A native, running the full graph unchanged.
4. **Two genuinely "partial" artefacts** need a new aggregation surface (not a template): the **14-CiP portfolio rollup** and **ESR prep** (both synthesise the whole year; the per-artefact graph can't do cross-entry aggregation).

---

## 8. Architecture Recommendation (Decisions & Reasoning)

### The recurring fork (established across the whole investigation)
Every incompatibility reduces to one of two root causes:
- **"Wrong kind"** → needs a structured-record artefact type → **introduce a `kind` discriminator** (called **Option B** throughout).
- **"Wrong actor"** → inherently multi-party → **don't own it**.

### Recommended: introduce a `kind` discriminator (Option B core)
Promote a `kind: 'REFLECTION' | 'LOGBOOK_RECORD' | 'EVIDENCE_DOC'` onto the template/entry abstraction:
- Current `ArtefactTemplate` becomes the `REFLECTION` kind (unchanged behaviour).
- `LOGBOOK_RECORD` gets a **structured field schema** + **deterministic validator** + **cross-row aggregation** (instead of `sections/probes` + `descriptorCriteria` + `wordCountRange`).
- The graph **forks early at `classify`**: reflections take the full path; structured records take a short capture/aggregate path (no `reflect`, no `wordCountRange`).
- This is the seam that stops "specialty" being conflated with "everything is a reflection."

### Three-layer build scope for IMT
| Layer | Contents | Effort |
|---|---|---|
| **Ship now (zero arch change)** | All whole-artefact Tier A + the reflection component of every composite (QIP write-up, teaching/clinic/CPD reflections, MSF/exam/WPBA reflect-after). Most of the trainee's *authored* evidence. | Config only (like GP) |
| **Small next build** | The `kind` discriminator + thin structured counters (clinic/procedure/acute-take/CPD). **Highest-value feature is the aggregation tracker** ("23/40 clinics, missing rheumatology") — which the reflective graph structurally cannot provide. Plus the 2 cross-entry aggregations (CiP rollup, ESR prep). | Moderate |
| **Never build** | Tier C sign-off/rating/exam artefacts (MCR, QIPAT, TO, DOPS, ACAT/CbD, ESR body, MSF questionnaires). Leave in official ePortfolio. | — |

### Comparative fit note
- GP = pure reflective (perfect fit). **IMT ARCP is a *hybrid*** — reflection-dominant with a quantitative/WBA tail. Surgery = logbook-dominant with a reflective tail. IMT and surgery differ by *degree*, not kind.

---

## 9. Approaches Considered & Rejected

| Option | What it was | Verdict |
|---|---|---|
| **A — Reflective-only specialty config** | Add IMT like GP (entry types, capabilities, stages, templates), reflective slice only | **Accept as Phase 1.** Cheap, zero arch change. But covers only ~half an IMT trainee's ARCP needs. |
| **B — `kind` discriminator** | Generalise "artefact" beyond prose; add structured-record kind + aggregation | **Recommended as the real fix / Phase 2.** Unlocks the structured counters & their aggregation value. |
| **C — Scoring/aggregation + verification layer** | Deterministic points-matrix scoring + verification lifecycle + third-party actors | **Defer.** Needed only for the *selection self-assessment* use case and surgical logbooks. Heavy; ~70% net-new. |
| **Own Tier C artefacts** (WPBA/MSF/MCR/ESR) | App produces multi-actor assessments | **Rejected.** Requires multi-actor approval workflows; would store third-party clinician PII; puts app out of step with the body (JRCPTB) that defines the standard. |
| **Single verdict per artefact** | Classify each IMT artefact with one tier | **Rejected as misleading.** Artefacts are composites; must classify at component granularity (this was an explicit correction during the investigation). |
| **Plastic surgery / surgery as the focus** | Build for the surgical logbook market first | **Parked.** Tiny standalone market (~280 plastics applicants/yr); only justified as a wedge into ~5,000–8,000 surgical trainees IF Option B/C is built. IMT is the bigger, better-fit bet. |

---

## 10. Privacy / PII (Confirmed Constraints)

**Critical distinction:** A **GMC number is a clinician identifier, not patient PII.** Two opposite rule-sets:

| Data type | Rule |
|---|---|
| **Patient identifiers** (name, DOB, NHS/hospital number, postcode, key dates, initials) | **Store NONE.** UK guidance (GMC + AoMRC) requires reflections to be anonymised. Removing the name alone is insufficient. |
| **Trainee's own GMC number + NTN** | Required at **account level** for ARCP/Form R identity. First-party, fine. |
| **Other clinicians' GMC numbers** (assessors/raters/supervisors) | Required only by **Tier C** artefacts — which the app does **not** own, so it never stores third-party clinician PII. |

**Confirmed:** The official **JRCPTB ePortfolio prohibits patient PII** — *"No data in ePortfolio should directly identify patients or patient records."* It relies on **trainee discipline + governance**, NOT input-level redaction (free-text fields physically accept anything).

**Design implications:**
1. No structured field should ever solicit a patient identifier (no "patient name/DOB/NHS number" fields). Capture age as a **life-stage band** ("older adult"), never exact.
2. **The direct-web-entry path has no redaction safety net** — current PII redaction only runs on the **audio/transcription path**. Typed entries on clinical artefacts (case reflection, significant event, CbD prep) bypass it. **Recommendation:** extend the redaction/PII-detection pass to typed free-text on clinical entries. This would make the app *more* protective than the incumbent ePortfolio (a genuine differentiator).
3. Scope the guard to the **clinical entries** (+ Tier B logs); PDP/teaching/feedback reflections are low-risk.
4. For Tier B logs: store patients as **pseudonymised case IDs / age-sex bands only**, never identifiers (the surgical eLogbook pattern). Note: the *official* IMT clinic/procedure logs record **no patient data at all** (counts/estimates only).

---

## 11. Key References (Sources)

**Pathway & structure**
- IMT Stage 1 (HEIW): https://heiw.nhs.wales/education-training/a-z/specialty-training/prospective-trainees/medicine/internal-medicine-training-imt-stage-one/
- Ultimate Guide to IMT (MedCourse): https://medcourse.co.uk/speciality-guide/ultimate-guide-to-imt/
- The Federation — Internal Medicine: https://www.thefederation.uk/training/specialties/internal-medicine
- CMT→IMT rename (PMC): https://pmc.ncbi.nlm.nih.gov/articles/PMC9345202/

**ARCP requirements & artefacts**
- IMT Stage 1 ARCP Decision Aid (2019, 2023 update): https://www.thefederation.uk/sites/default/files/IMT%20ARCP%20Decision%20Aid%202019%20(2023%20update%20FINAL).pdf
- IMT Stage 1 ARCP guidance 2023: https://www.thefederation.uk/sites/default/files/IMT%20Stage%201%20ARCP%20guidance%202023%20FINAL.pdf
- East of England — Preparation for ARCP (IMT): https://heeoe.hee.nhs.uk/medicine/internal-medicine-training-imt/preparation-arcp-imt + PDF https://heeoe.hee.nhs.uk/sites/default/files/imt_stage_1_pre_arcp_guidance.pdf
- Yorks & Humber IMT guide: https://www.yorksandhumberdeanery.nhs.uk/sites/default/files/imt_booklet_august_2019_op_0.pdf
- NHS England North West — Medicine ARCP: https://www.nwpgmd.nhs.uk/Specialty_Schools/Medicine/Core_Medical_Training/ARCP
- Official clinic/procedure/acute-take spreadsheet (21/12/2019): https://www.thefederation.uk/document/imt-acute-take-calculator-and-log-clinics-and-procedures
- JRCPTB MCR form (primary, read directly): https://assets.ctfassets.net/8k0h54kbe6bj/62H262niLYaPtj7dScX70q/fcd5ea606b8c675d16775b6ff9608541/MCR_Multible_Consultant_Report.pdf
- IM Stage 1 curriculum: https://www.thefederation.uk/sites/default/files/IM_Curriculum_Sept2519.pdf
- Curriculum paper (PMC): https://pmc.ncbi.nlm.nih.gov/articles/PMC6798027/
- QIPAT (Yumpu mirror): https://www.yumpu.com/en/document/view/51008720/quality-improvement-assessment-tool-jrcptb-a
- Teaching Observation tool: https://www.thefederation.uk/document/teaching-observation-august-2014
- PDP fields (NHS ePortfolio guidance): https://www.foundationprogramme.nhs.uk/wp-content/uploads/2020/06/E-portfolio-PDP-guidance.pdf

**Privacy / PII**
- GMC — Anonymising reflective notes: https://www.gmc-uk.org/education/standards-guidance-and-curricula/guidance/reflective-practice/the-reflective-practitioner---a-guide-for-medical-students/anonymising-reflective-notes
- GMC — The Reflective Practitioner: https://www.gmc-uk.org/-/media/documents/dc11703-pol-w-the-reflective-practioner-guidance-20210112_pdf-78479611.pdf
- JRCPTB ePortfolio FAQ (no patient PII): https://jrcptb.org.uk/eportfolio-information/faqs

**Market sizing**
- RCP — Focus on physicians 2023 census (HST 7,004): https://www.rcp.ac.uk/media/dzdbho0o/focus-on-physicians-the-uk-2023-census-of-consultant-physicians.pdf
- Specialty Applications competition ratios (IMT, Psychiatry, GP, Plastics): https://www.specialty-applications.co.uk/competition-ratios/

> **Source caveat:** The Federation/JRCPTB, HEE, and some deanery domains are Akamai/bot-blocked (HTTP 403). Several quotes were obtained via Wayback Machine (`web.archive.org/web/2id_/<url>`) or mirrors. For formal citation, open the canonical URLs in a browser.

---

## 12. Open Questions / Unresolved (`Not established`)

1. **Existing `internal-medicine/` config contents** — it exists (`isActive: false`) but its current entry types, templates, capabilities, and training stages were **not audited**. Must be read before any IMT work to avoid duplication.
2. **Use case priority** — Two distinct IMT use cases were identified but not prioritised: (a) **ongoing ARCP** support (recurring; the focus of this research) vs (b) **selection self-assessment** for the CT/IMT→ST3/ST4 application gate (annual, points-scored — needs Option C). `Unresolved.`
3. **Group 1/Group 2 specialty allocation** — exact JRCPTB list `Not fully established` (public sources conflict on neurology, palliative medicine).
4. **Exact current physician-MSF rating scale wording** — `Unconfirmed` (mini-PAT 6-point lineage is best evidence; JRCPTB form bot-blocked).
5. **WPBA form field-level detail** (ACAT/CbD/mini-CEX/OPCAT) — `Medium confidence`; dedicated research cluster was cancelled. Verify against live ePortfolio.
6. **Does the redaction layer cover the typed-entry path or only transcription?** — Strongly suspected audio-only; **not verified in code** this session.
7. **Training-stage modelling for the IMT branch tree** — concrete `TrainingStageDefinition` shape for shared-stem-then-fork not yet designed.
8. **Whether to model "Internal Medicine" as one config or stem + ~30 leaves** — architectural decision deferred.

---

## 13. Recommended Next Steps (Priority Ordered)

1. **Audit the existing `internal-medicine/` config** (`apps/api/src/specialties/internal-medicine/`) — entry-types, templates, capabilities, training-stages. Establishes the real starting point. *(Blocks everything else.)*
2. **Verify the redaction path** — confirm whether PII redaction runs on direct typed entry or only audio transcription. If audio-only, this is a known gap for clinical entries (§10).
3. **Produce the one-page build scope** — map Tier A "ship now" artefacts to existing GP templates (reuse vs net-new): e.g. reflective log → LEA/CCR, significant event → SEA, QIP write-up → QIP_TEMPLATE, feedback reflection → FEEDBACK_TEMPLATE, teaching → LEADERSHIP. Identify net-new templates needed.
4. **Decide use-case priority** (Open Q #2): ARCP-support (Phase 1, reflective) vs selection self-assessment (needs Option C). Recommendation: ARCP-support first.
5. **Design the `kind` discriminator** (Option B) — type changes to `ArtefactTemplate`/`SpecialtyConfig`, the `classify` fork, and the structured-record schema + **aggregation** model (the clinic "X/40 + variety" tracker is the headline feature).
6. **Design the IMT training-stage tree** — encode IMT1–2 shared stem → Group 1/Group 2 fork; resolve "one config vs stem + leaves."
7. **Confirm canonical references** — open the bot-blocked JRCPTB/Federation PDFs in a browser to lock down: Group 1/2 list, MSF scale wording, WPBA form fields (Open Qs #3–5).

---

## Resume Checklist

A future session should do these first, in order:

- [ ] **Read this whole document** — it is self-contained; the live conversation is not required.
- [ ] **Read `apps/api/src/specialties/internal-medicine/`** (all files) — the existing inactive IMT config. Compare against GP (`apps/api/src/specialties/gp/`) to see what's already done vs missing.
- [ ] **Re-read the component table (§7)** and the architecture recommendation (§8) — they are the core deliverables.
- [ ] **Grep the redaction layer** to answer Open Q #6 (audio-only vs typed path). Start from the memory note `redaction-architecture.md` and search `apps/api/src` for the redaction service.
- [ ] **Confirm with the user the use-case priority** (Open Q #2) before designing anything — ARCP-support (reflective, Phase 1) is the recommended default.
- [ ] **If proceeding to build:** start with Step 3 (build scope doc) → Step 5 (`kind` discriminator design). Do **not** attempt Tier C artefacts.
- [ ] **Respect the PII rule (§10):** store zero patient PII; never add patient-identifier fields; extend redaction to typed clinical entries if confirmed missing.
- [ ] **Treat `Unconfirmed`/`Not established` items (§12) as gaps**, not facts — verify against canonical JRCPTB sources before relying on them.
