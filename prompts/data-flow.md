sequenceDiagram
autonumber
actor Doc as Doctor (Mobile App)
participant API as NestJS API
participant ASR as ASR (Speech-to-Text)
participant DB as App DB (Entries)
participant ONT as Ontology Store (Graph/DB)
participant ORCH as LLM: Orchestrator/Router
participant CLEAN as LLM: Transcribe Cleaner
participant DEID as LLM: De-Identification
participant EXTR as LLM: Case Structurer
participant CLS as LLM: Entry Type Classifier
participant MAP as LLM: Capability Mapper
participant CTX as LLM: Context/Patient Group Tagger
participant RISK as LLM: Risk Escalation
participant REFL as LLM: Reflection Generator
participant PDP as LLM: PDP Generator
participant QA as LLM: Quality Gate

Doc->>API: POST /entries (audio_blob, metadata)\nmetadata={setting:"GP practice", mode:"telephone", level:"ST2", date:"2026-02-16"}
API->>ASR: Transcribe(audio_blob)
ASR-->>API: raw_asr_text="Telephone call with Mr Raj Patel, 54, lives in E17, NHS number 943..."

API->>ORCH: Prompt: Router\nINPUT={dictation_text: raw_asr_text, metadata}
note right of ORCH: SYSTEM: route stages, no fabrication\nDEV: always include deidentify, structure_case, classify, quality_check\nIf risk language -> include risk_escalation\nOUTPUT JSON only
ORCH-->>API: {stages:[transcribe_clean,deidentify,structure_case,classify_entry_type,capability_map,context_map,risk_escalation,reflection_generate,pdp_generate,quality_check],\nneeds_followup:true,\nfollowup_questions:["What safety-netting did you give?","What would you do differently?","Any system factor?"]}

API-->>Doc: UI: Ask 3 follow-up questions
Doc-->>API: followup_answers={\nq1:"Call 999 if pain returns/worsens or >10 min, breathlessness, collapse, sweating",\nq2:"Ask family history earlier; use chest pain structure",\nq3:"No same-day ECG slots; pathway pushes to A&E"\n}

API->>CLEAN: Prompt: Clean transcription\nINPUT={raw_asr_text}
note right of CLEAN: SYSTEM: clean dictation only\nDEV: remove fillers, fix punctuation, keep uncertainty\nOUTPUT JSON {clean_text, uncertain_terms, asr_ambiguities}
CLEAN-->>API: {clean_text:"Telephone consultation with Mr Raj Patel (54)...",\nuncertain_terms:["worried about","versus"],\nasr_ambiguities:["NHS number fragment"]}

API->>DEID: Prompt: De-identification\nINPUT={clean_text}
note right of DEID: SYSTEM: UK medical de-id\nDEV: redact names/DOB/NHS/address/postcode/phones/emails/institution IDs\nOUTPUT JSON {deidentified_text, redactions[], residual_risk, residual_risk_reason}
DEID-->>API: {deidentified_text:"Telephone consultation with an adult patient in their 50s...",\nredactions:[{original_type:"name",replacement:"[adult patient]"},...],\nresidual_risk:"low", residual_risk_reason:"Generalised demographics"}

API->>EXTR: Prompt: Structure case\nINPUT={deidentified_text, followup_answers, metadata}
note right of EXTR: SYSTEM: extract only, do not infer\nDEV: output case JSON + missing_critical_fields + confidence
EXTR-->>API: {case:{setting:"GP practice", presenting_problem:"Exertional central chest tightness...",\nkey_history:[...], safety_netting:[...], system_factors:[...]},\nmissing_critical_fields:["outcome_if_known","follow_up"], confidence:0.84}

API->>CLS: Prompt: Classify entry type\nINPUT={deidentified_text, case_summary:case.presenting_problem + key points}
note right of CLS: SYSTEM: classify educational intent\nDEV: top3 with confidence + rationale
CLS-->>API: {top_type:"Clinical Case Review",\nalternatives:[{type:"Learning Event",confidence:0.42,rationale:"Explicit learning + change"},...],\nwhy_top_type:"Primary intent is reflection on assessment/management"}

API->>ONT: Query ontology pack\nINPUT={curriculum:"RCGP GP Curriculum", version:"2025", needs:["capability_list","contexts","patient_groups","evidence_signals","quality_levels","aliases"]}
ONT-->>API: ontology_subset={\ncapabilities:[{id:"C-06",name:"Decision-making and diagnosis"},...],\ncontexts:[{id:"CX-REMOTE",aliases:["telephone","phone","remote consult"]},...],\nevidence_signals:[{id:"ES-SAFETY_NETTING",patterns:["safety-net","call 999"]},...],\nquality_levels:["QL1","QL2","QL3","QL4"]\n}

API->>MAP: Prompt: Capability mapping (ontology-constrained)\nINPUT={deidentified_text, case, ontology_subset.capabilities, ontology_subset.evidence_signals}
note right of MAP: SYSTEM: map ONLY to provided capability list\nDEV: top 5 max; each must include evidence_quote span\nReturn overclaim_risk + notes
MAP-->>API: {capabilities:[\n{capability_id:"C-06",confidence:0.86,evidence_quote:"considered ACS vs anxiety...",rationale:"uncertainty + risk-based decision"},\n{capability_id:"C-07",confidence:0.83,evidence_quote:"arranged emergency conveyance...",rationale:"escalation + safety-netting"},...\n],\noverclaim_risk:"low", overclaim_notes:["C-11 is weakly evidenced"]}

API->>CTX: Prompt: Context + patient group tags (ontology-constrained)\nINPUT={deidentified_text, ontology_subset.contexts, ontology_subset.patient_groups}
note right of CTX: SYSTEM: tag from controlled vocabulary\nDEV: return tags w/ confidence + evidence_quote
CTX-->>API: {context_tags:[{tag:"remote consult",confidence:0.91,evidence_quote:"Telephone consultation"},\n{tag:"urgent unscheduled care",confidence:0.77,evidence_quote:"urgent A&E assessment"}],\npatient_group_tags:[{tag:"adult",confidence:0.88,evidence_quote:"adult patient in their 50s"}]}

API->>RISK: Prompt: Risk escalation\nINPUT={deidentified_text, case, entry_type:CLS.top_type}
note right of RISK: SYSTEM: safety triage, NOT clinical advice\nDEV: escalation_level + flags + reasons + next_steps\nJSON only
RISK-->>API: {escalation_level:"review_recommended",\nflags:["possible high-risk presentation"],\nreasons:["Symptoms consistent with possible ACS"],\nnext_steps:["Discuss with supervisor at tutorial","Re-file as Significant Event if adverse outcome/complaint"],\nsuggested_log_type_if_changed:"Significant Event / Patient Safety Event"}

API->>REFL: Prompt: Reflection generation (two lengths)\nINPUT={deidentified_text, case, mapped_capabilities:MAP.capabilities,\nquality_targets:["include uncertainty","include safety-netting","include what changes"],\nconstraints:["first-person","no identifiers","no new facts"]}
note right of REFL: SYSTEM: authentic reflection only\nDEV: concise 150-220, detailed 280-420 + learning_points + change_commitments
REFL-->>API: {concise_reflection:"I managed a remote consultation...",\ndetailed_reflection:"...",\nlearning_points:["Use structured chest pain history incl family history","Document reasoning under uncertainty"],\nchange_commitments:["Ask family history early","Use chest pain structure"]}

API->>PDP: Prompt: SMART PDP actions\nINPUT={learning_points, change_commitments, gaps:missing_critical_fields,\ncapabilities:MAP.capabilities, ontology_subset.quality_levels}
note right of PDP: SYSTEM: produce 1-3 SMART actions\nDEV: steps, due_date, success_criteria, evidence_to_upload, linked_capabilities
PDP-->>API: {pdp_actions:[\n{action_title:"Improve structured chest pain assessment in remote consults",\nspecific_steps:["Use chest pain structure in next 5 consults","Discuss one case with supervisor"],\ndue_date_suggestion:"in 4 weeks", success_criteria:["5 notes include family history","Supervisor feedback recorded"],\nevidence_to_upload:["Supervisor note","2 linked learning logs"], linked_capabilities:["C-04","C-06","C-03"]}\n]}

API->>QA: Prompt: Quality check\nINPUT={deid:DEID.output, case:EXTR.output, type:CLS.output,\ncapabilities:MAP.output, contexts:CTX.output, risk:RISK.output,\nreflection:REFL.output, pdp:PDP.output}
note right of QA: SYSTEM: reject unsafe/low-quality\nDEV: validate no identifiers, no fabricated facts, consistency, SMART PDP\nReturn pass/fail + required fixes
QA-->>API: {status:"pass", issues:[], required_fixes:[], final_confidence:0.82}

API->>DB: INSERT entry\npayload={deidentified_text, raw_transcript_restricted, case_json, entry_type,\ncapability_tags, context_tags, reflection_text, pdp_actions,\nrisk_level, qa_status, audit_log}
DB-->>API: {entry_id:"E-10492"}

API-->>Doc: UI: Review screen\n- De-identified draft\n- Suggested type\n- Capability tags + "Why?" highlights\n- Reflection (concise/detailed)\n- PDP actions\n- Risk note + optional supervisor flag\nActions: [Edit] [Accept] [Save] [Export]
Doc-->>API: POST /entries/E-10492/confirm\n{final_signed_off:true, user_edits:{...}}
API->>DB: UPDATE entry final_signed_off + diff/audit trail
DB-->>API: ok
API-->>Doc: Success: "Saved + ready to export"
