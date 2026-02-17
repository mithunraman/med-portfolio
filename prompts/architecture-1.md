Great use case. If the GP dictates once, your agent can turn that single narrative into a **complete, ARCP-ready workflow** with minimal extra clicks.

Below is a practical “after dictation” automation stack you can implement.

---

## 1) Turn raw dictation into a safe, structured draft

After speech-to-text, run an NLP pipeline that outputs:

- **Cleaned transcript** (remove filler words, fix punctuation)
- **Structured case fields**:
  - Setting (GP surgery/home visit/OOH/telephone/video)
  - Patient demographics (age band, sex if relevant)
  - Presenting problem
  - Key history/exam/investigations
  - Differential(s) + diagnostic uncertainty
  - Management + safety-netting + follow-up
  - Outcome (if known)

- **Reflection scaffold**:
  - What went well
  - What was challenging
  - What I learned
  - What I will do differently

### Must-have safety step

Auto-run a **de-identification pass** before saving:

- Remove names, DOB, NHS numbers, exact addresses/postcodes, phone numbers, email, institution-specific identifiers.
- Replace with neutral placeholders (“adult patient”, “local hospital”).

---

## 2) Auto-classify the entry type

From transcript intent, suggest the correct log type:

- Clinical Case Review
- Significant/Learning Event
- Prescribing reflection
- Safeguarding reflection
- Leadership/teamworking reflection
- QI-linked reflection

Then let GP confirm with one tap.

---

## 3) Capability mapping (with confidence + rationale)

Auto-suggest likely capability tags (top 3–5) with confidence scores:

- Communicating and consulting
- Data gathering and interpretation
- Clinical management
- Decision-making and diagnosis
- Medical complexity
- Team working
- etc.

Show **“Why this tag?”** snippets so the GP can trust/edit quickly.

---

## 4) Clinical experience / patient group tagging

Infer and suggest:

- Paediatric / older adult / women’s health / mental health / LTC / urgent care / safeguarding / vulnerable groups, etc.
- Context tags: home visit, remote consult, care home, OOH, palliative phase, multimorbidity.

This helps coverage across curriculum domains without manual hunting.

---

## 5) Generate high-quality reflection text (editable)

Produce 2 versions:

1. **Concise ARCP version** (150–250 words)
2. **Detailed learning version** (300–500 words)

Include explicit:

- Clinical reasoning under uncertainty
- Risk/safety-netting reasoning
- Human factors/system issues
- Personal learning point

GP approves/edit-locks final text.

---

## 6) PDP automation (close the loop)

From reflection, create **SMART PDP actions** automatically:

- Specific action
- Due date
- Evidence expected
- Linked capability/domain

Examples:

- “Review NICE CKD guidance + discuss in tutorial by 15 Mar”
- “Perform 2 supervised contraceptive implant removals this placement”

Later, the agent prompts for completion evidence and links it back.

---

## 7) Evidence linkage engine

After each entry, the agent can suggest links to existing artefacts:

- Relevant CBD / Mini-CEX / COT equivalents
- CEPS opportunities
- QI projects
- Prescribing evidence
- Teaching/leadership opportunities
- Supervisor meetings

This turns isolated logs into a connected evidence graph.

---

## 8) Supervisor-ready summary generation

Auto-create a one-page “send to trainer” brief:

- Case summary
- Reflection quality score (internal rubric)
- Capability claims
- PDP actions requested for discussion
- Any concerns needing supervisor review (clinical/safety/wellbeing)

---

## 9) ARCP-readiness scoring (continuous)

Maintain a live dashboard:

- Capability coverage heatmap
- Clinical context distribution
- Patient-group breadth
- Reflection depth quality
- Recency/frequency trends
- Missing mandatory evidence flags

Then weekly nudges:

- “You’re light on safeguarding evidence this period.”
- “No recent urgent-care reflections in last 8 weeks.”

---

## 10) Safety and governance guardrails (critical)

For a medical training agent, bake these in from day one:

### A) Patient confidentiality

- On-device or secure-region processing where possible
- Encryption at rest/in transit
- No raw audio retained by default
- Configurable retention + deletion policy
- Full audit trail of edits and exports

### B) Clinical safety boundaries

- The agent must **not** give direct patient-management advice in portfolio mode.
- If dictation indicates serious incident/risk, escalate:
  - “This may need significant event workflow / supervisor notification.”

### C) Educational integrity

- Keep provenance: what GP said vs AI-suggested text
- “AI-assisted” marker option
- One-click diff view to prevent ghost-writing concerns

### D) Bias and fairness

- Check tagging bias across demographics/conditions
- Transparent model explanations for classification

---

## 11) UX flow you can ship

1. GP taps record (60–120 sec dictation).
2. Agent returns:
   - De-identified draft
   - Log type suggestion
   - Capability + context tags
   - Reflection draft
   - PDP suggestions

3. GP reviews quick checklist (30–60 sec).
4. Save + optional export/sync to portfolio.
5. Weekly digest + gap alerts.

Total GP effort can drop from ~10–15 min to ~2–4 min per entry.

---

## 12) High-value advanced features

- **Voice follow-up questions** (agent asks 3 targeted prompts to improve reflection quality)
- **Case-series detection** (multiple similar entries → suggest QI theme)
- **Learning recommender** (guideline/module/article tied to case topic)
- **Trainer personalization** (adapts to supervisor preferences for evidence style)
- **Multi-language dictation, English output**
- **Offline-first dictation with delayed secure sync**

---

## 13) Suggested data model (minimum viable)

For each entry store:

- `entry_id`, `author_id`, `timestamp`
- `raw_transcript` (restricted)
- `deidentified_text`
- `entry_type`
- `clinical_summary_json`
- `reflection_text`
- `capability_tags[]` + confidence
- `context_tags[]` / `patient_group_tags[]`
- `pdp_actions[]`
- `linked_evidence_ids[]`
- `supervisor_flag` (none/recommended/urgent)
- `final_signed_off` + signed timestamp

---

## 14) KPIs to prove value

Track before/after:

- Median time to complete entry
- % entries with adequate reflection depth
- Capability coverage completeness
- ARCP “insufficient evidence” flags
- Supervisor revision requests
- User satisfaction + weekly active usage

---

If you want, I can next give you:

1. a **prompt architecture** for each agent stage, and
2. a **JSON schema** for direct integration with your app/backend.

---

---

## Stage-by-stage prompt architecture for your GP Portfolio AI Agent

Below is a production-friendly architecture you can implement as a **multi-agent pipeline** (or a single orchestrator with staged prompts).
I’ll give you:

1. **Agent stages and responsibilities**
2. **Prompt templates** (system + developer + user payload style)
3. **Expected JSON output contracts**
4. **Guardrails and fail-safe routing**
5. **Orchestration pattern**

---

## 0) Orchestrator (router) prompt

Use a lightweight first pass to decide what stages are needed per entry.

### System prompt (Router)

```text
You are the Orchestrator for a GP training portfolio assistant.
Your job is to route one dictated entry through required processing stages.
You must prioritize confidentiality, educational integrity, and concise outputs.
Never fabricate clinical facts.
If confidence is low, request minimal targeted follow-up questions.
Output only JSON.
```

### Developer prompt (Router)

```text
Decide which stages to run from this set:
- transcribe_clean
- deidentify
- structure_case
- classify_entry_type
- capability_map
- context_map
- reflection_generate
- pdp_generate
- risk_escalation
- quality_check
- supervisor_summary

Always include: deidentify, structure_case, classify_entry_type, quality_check.
Include risk_escalation if there is any mention of harm, complaint, error, near miss, safeguarding, severe deterioration, suicidal ideation, abuse, or uncertainty about safety.
Return strict JSON schema:
{
  "stages": [string],
  "reasons": [{ "stage": string, "reason": string }],
  "needs_followup": boolean,
  "followup_questions": [string]
}
```

### User payload

```json
{
  "dictation_text": "...",
  "metadata": {
    "setting": "GP practice|OOH|home visit|remote|unknown",
    "training_level": "ST1|ST2|ST3|unknown",
    "date": "YYYY-MM-DD"
  }
}
```

---

## 1) Transcription cleaning stage

If your ASR output is noisy, normalize before anything else.

### System prompt

```text
You clean speech-to-text dictation for GP training logs.
Preserve meaning; do not add clinical details.
Return plain, professional English.
```

### Developer prompt

```text
Tasks:
1) Remove filler/repetition.
2) Correct punctuation and obvious ASR errors.
3) Keep uncertainty words (e.g., "possibly", "not sure") intact.
4) Preserve chronology.
Output JSON:
{
  "clean_text": string,
  "uncertain_terms": [string],
  "asr_ambiguities": [string]
}
```

### Input

`raw_asr_text`

---

## 2) De-identification stage (critical)

### System prompt

```text
You are a medical text de-identification engine for UK GP training logs.
Remove direct and indirect patient identifiers while preserving educational value.
```

### Developer prompt

```text
Redact/replace:
- Names, DOB, exact age if highly identifying, NHS numbers, addresses, postcode, phone, email, exact employer/school, specific institution IDs, unique dates if identifying.
Use neutral replacements: [adult patient], [child patient], [relative], [local hospital].

Keep clinically relevant demographics in generalized form (e.g., "older adult", "pregnant patient").

Output JSON:
{
  "deidentified_text": string,
  "redactions": [
    { "original_type": "name|dob|nhs|address|phone|email|institution|other", "replacement": string }
  ],
  "residual_risk": "low|medium|high",
  "residual_risk_reason": string
}
If residual_risk is high, explain exactly why.
```

---

## 3) Structured case extraction stage

### System prompt

```text
You convert GP learning dictation into structured educational case data.
Do not infer facts not present.
Mark unknowns explicitly.
```

### Developer prompt

```text
Extract fields:
- setting
- patient_group
- presenting_problem
- key_history
- key_exam
- key_investigations
- differential_diagnoses
- working_diagnosis
- management_plan
- safety_netting
- follow_up
- outcome_if_known
- uncertainty_points
- system_factors (workflow/team/resource issues)

Output JSON with arrays where multiple items possible:
{
  "case": {
    "setting": string,
    "patient_group": [string],
    "presenting_problem": string,
    "key_history": [string],
    "key_exam": [string],
    "key_investigations": [string],
    "differential_diagnoses": [string],
    "working_diagnosis": string,
    "management_plan": [string],
    "safety_netting": [string],
    "follow_up": [string],
    "outcome_if_known": string,
    "uncertainty_points": [string],
    "system_factors": [string]
  },
  "missing_critical_fields": [string],
  "confidence": 0.0
}
```

---

## 4) Entry type classification stage

### System prompt

```text
You classify GP portfolio entry type for training evidence.
Prioritize educational intent over clinical topic.
```

### Developer prompt

```text
Candidate types:
- Clinical Case Review
- Learning Event
- Significant Event / Patient Safety Event
- Prescribing Reflection
- Safeguarding Reflection
- Leadership/Teamwork Reflection
- Quality Improvement Reflection
- Professionalism/Ethics Reflection
- Other

Return top 3 with confidence and rationale.
Output JSON:
{
  "top_type": string,
  "alternatives": [{ "type": string, "confidence": 0.0, "rationale": string }],
  "why_top_type": string
}
```

---

## 5) Capability mapping stage

### System prompt

```text
You map a GP learning entry to curriculum capabilities.
Use only evidence present in text.
```

### Developer prompt

```text
Use this capability list:
1 Fitness to practise
2 An ethical approach
3 Communicating and consulting
4 Data gathering and interpretation
5 Clinical examination and procedural skills
6 Decision-making and diagnosis
7 Clinical management
8 Medical complexity
9 Team working
10 Performance, learning and teaching
11 Organisation, management and leadership
12 Holistic practice, health promotion and safeguarding
13 Community health and environmental sustainability

Output top 5 max.
For each: capability_id, name, confidence, evidence_quote, why_it_fits.
Output JSON:
{
  "capabilities": [
    {
      "capability_id": "C-03",
      "name": "...",
      "confidence": 0.0,
      "evidence_quote": "...",
      "rationale": "..."
    }
  ],
  "overclaim_risk": "low|medium|high",
  "overclaim_notes": [string]
}
```

---

## 6) Clinical context / patient group tagging stage

### System prompt

```text
You identify GP clinical contexts and patient groups from de-identified educational text.
```

### Developer prompt

```text
Tag:
- Context: home visit, OOH, urgent unscheduled care, remote consult, care home, safeguarding, palliative/end-of-life, multimorbidity, etc.
- Patient groups: paediatric, maternal, mental health, vulnerable/disadvantaged, older/frail, LTC/disability, etc.

Return tags with evidence spans.
Output JSON:
{
  "context_tags": [{ "tag": string, "confidence": 0.0, "evidence_quote": string }],
  "patient_group_tags": [{ "tag": string, "confidence": 0.0, "evidence_quote": string }],
  "coverage_notes": [string]
}
```

---

## 7) Reflection generation stage (two-length output)

### System prompt

```text
You are an educational writing assistant for GP reflective entries.
Write authentic reflection, not generic prose.
Do not invent events.
```

### Developer prompt

```text
Generate:
A) concise_reflection (150-220 words)
B) detailed_reflection (280-420 words)

Both must include:
- What happened
- Clinical reasoning (including uncertainty)
- What went well / less well
- Learning points
- What will change in future practice

Use first person singular ("I").
No patient identifiers.
Tone: honest, professional, specific.

Output JSON:
{
  "concise_reflection": string,
  "detailed_reflection": string,
  "learning_points": [string],
  "change_commitments": [string]
}
```

---

## 8) PDP generation stage (SMART actions)

### System prompt

```text
You convert reflection into SMART PDP actions for GP training.
Actions must be specific, measurable, achievable, relevant, time-bound.
```

### Developer prompt

```text
Create 1-3 PDP actions with:
- action_title
- specific_steps
- due_date_suggestion (ISO date or timeframe)
- success_criteria
- evidence_to_upload
- linked_capabilities

Output JSON:
{
  "pdp_actions": [
    {
      "action_title": string,
      "specific_steps": [string],
      "due_date_suggestion": string,
      "success_criteria": [string],
      "evidence_to_upload": [string],
      "linked_capabilities": ["C-.."]
    }
  ]
}
```

---

## 9) Risk escalation stage (safety triage)

### System prompt

```text
You are a safety triage assistant for educational portfolio entries.
This is not clinical decision support.
Detect issues that require supervisor review.
```

### Developer prompt

```text
Flag categories:
- patient safety incident
- significant event/near miss
- safeguarding concern
- professionalism/ethical concern
- trainee wellbeing/burnout concern
- urgent risk language

Return:
- escalation_level: none|review_recommended|urgent_review
- reasons
- suggested_next_steps (educational workflow only)
- suggested_log_type_if_changed

Output JSON:
{
  "escalation_level": "none|review_recommended|urgent_review",
  "flags": [string],
  "reasons": [string],
  "next_steps": [string],
  "suggested_log_type_if_changed": string
}
```

---

## 10) Quality check stage (final gate)

### System prompt

```text
You are a QA validator for GP portfolio AI outputs.
Reject low-quality or unsafe output.
```

### Developer prompt

```text
Validate:
- no identifiers
- no fabricated facts
- reflection specificity
- capability claims evidence-backed
- PDP actions SMART
- tone professionalism
- internal consistency across all stage outputs

Return pass/fail and fixes.
Output JSON:
{
  "status": "pass|fail",
  "issues": [string],
  "required_fixes": [string],
  "final_confidence": 0.0
}
```

---

## 11) Supervisor summary stage (optional auto-draft)

### System prompt

```text
You create a concise supervisor-facing summary of a trainee's entry.
```

### Developer prompt

```text
Max 180 words. Include:
- case synopsis
- key demonstrated capabilities
- learning need
- PDP plan
- any escalation note

Output JSON:
{
  "supervisor_summary": string
}
```

---

## Orchestration pattern (recommended)

Use this execution order:

1. `transcribe_clean` (if needed)
2. `deidentify`
3. `structure_case`
4. `classify_entry_type`
5. parallel:
   - `capability_map`
   - `context_map`
   - `risk_escalation`

6. `reflection_generate`
7. `pdp_generate`
8. `quality_check`
9. if fail → targeted repair prompt(s) → re-run `quality_check`
10. produce UI draft for GP approval

---

## Cross-stage guardrail prompt snippet (reuse in every stage)

Add this to every developer prompt footer:

```text
Hard constraints:
- Never include personally identifiable patient information.
- Never invent clinical details absent from source text.
- If uncertain, state uncertainty explicitly.
- Output strictly valid JSON matching schema.
- Educational support only; do not provide direct patient-specific treatment advice.
```

---

## Minimal follow-up question generator (when data too thin)

If missing essentials, ask up to 3 voice-friendly questions:

```json
{
  "questions": [
    "What was your main differential and why?",
    "What safety-netting advice did you give?",
    "What specific change will you make next time?"
  ]
}
```

---

## Implementation tips

- Use **low temperature** (0.1–0.3) for extraction/classification; **moderate** (0.4–0.6) for reflection drafting.
- Keep separate model calls for safety-critical stages (de-id, risk, QA).
- Store provenance:
  - `source_text_span` for each tag/capability claim
  - `ai_generated=true` metadata for transparency

- Add human-in-the-loop final sign-off before export.

---

If you want, next I can give you **copy-paste ready JSON Schemas** for each stage so your backend can validate every response automatically.
