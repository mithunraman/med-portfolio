RESEARCH NOTES — NOT LEGAL ADVICE — REVIEW WITH A LICENSED ATTORNEY BEFORE ACTING

# DPA Review: OpenAI, L.L.C. — VERIFIED

**Direction:** We are the controller; OpenAI is the processor.
**Reviewed:** 2026-05-17
**Reviewed by:** Founder (LOGDIT LTD), via `/privacy-legal:dpa-review`
**Status:** **VERIFIED against executed contract text.**
**Contract version:** OpenAI Data Processing Addendum **v.010126** (effective 1 January 2026)
**Source documents reviewed:**
- `openai-docs/openai-data-processing-addendum-2026-05-11.pdf` — executed DPA v.010126
- `openai-docs/openai_no_training_default_2026-05-11.pdf` — OpenAI policy page "How your data is used to improve model performance" (updated 13 March 2026, retrieved 11 May 2026)
- `openai-docs/openai-zdr-correspondence-2026-05-12.pdf` — OpenAI sales correspondence dated 12 May 2026 confirming ZDR eligibility floor
**Scope of processing:** Two LLM operations — (a) `gpt-5.4-nano` for the redaction LLM pass; (b) `gpt-4.1-mini` for drafting reflections. Text only; audio is never sent to OpenAI. Inputs are post-Stage-1-regex redacted transcripts.
**Cross-references:** Builds on [DPIA: Core Reflection Pipeline (2026-05-17)](DPIA_CoreReflectionPipeline_2026-05-17.md). Closes Condition C-6 (verify no-training commitment) **subject to follow-ups in §11 below**.
**Prior context:** No prior triage, PIA or DPA review for OpenAI in this outputs folder. Cold start.

---

## Bottom line

**Signable. The DPA itself is well-drafted for a UK controller — SCCs + UK Addendum cleanly incorporated, Module 2 applied, UK law and courts, ICO named as supervisory authority, 30-day sub-processor objection with termination remedy. No deal-breakers identified in the contract text.**

However, the review surfaced three things that require action from LOGDit before launch — none of them in the contract itself, all of them in the broader compliance posture:

1. **🟠 No-training is policy-based, not contractual.** The DPA contains no clause saying OpenAI shall not train on Customer Data. The commitment lives in OpenAI's unilateral policy page (updated 13 March 2026). Acceptable for MVP but should be flagged in your records — OpenAI can change a policy page; they cannot unilaterally change DPA terms.
2. **🔴 Privacy policy §6 says "content is not retained" — this is inaccurate.** OpenAI retains API inputs/outputs for up to 30 days for abuse monitoring under the standard tier. Zero Data Retention (ZDR), which would eliminate that window, requires a **$25,000/year minimum spend**. LOGDit is not eligible. Update the privacy policy.
3. **🟡 Schedule 1 §5 quietly shifts sensitive-data responsibility to the Customer.** "No sensitive data is intended to be transferred unless the user includes it unexpectedly in unstructured data." For LOGDit, "unexpectedly in unstructured data" describes the exact redaction-failure case (DPIA Risk R-5). Your redaction quality is doing more contractual work than it might appear.

**Issues:** 6 🟢 confirmed clean · 4 🟡 standard-market-acceptable · 1 🟠 contractual-location · 1 🔴 (in privacy policy, not in DPA)

**Recommendation:** Accept the DPA in the OpenAI dashboard. Update LOGDit's privacy policy §6 in the same sprint. Disable any Playground "share data" toggles in the OpenAI organisation settings to ensure default-opted-out remains the active configuration.

---

## 1. Direction and scope confirmation

- **Customer (LOGDit / LOGDIT LTD, UK) is the Controller.** Confirmed in DPA §1.1: "OpenAI acts as a Data Processor on the Customer's behalf."
- **OpenAI contracting entity for UK customers:** OpenAI OpCo, LLC, 1455 3rd Street, San Francisco, CA 94158 (DPA preamble; Schedule 1 §8.3). EEA / Swiss customers contract with OpenAI Ireland Ltd; UK customers do not. For UK Data, "Customer hereby instructs OpenAI OpCo, LLC to process any UK Data" (§4.2).
- **Processing scope:** redaction (Stage 2 contextual pass) + reflection drafting + curriculum capability tagging. Text only.
- **Data subjects:** UK medical trainees. Patient and third-party identifiers are intended to be removed pre-transfer by LOGDit's two-stage redaction pipeline.

---

## 2. Federal sectoral overlay

LOGDit is UK-based with UK-only data subjects (App Store geo-restricted). US sectoral overlays (HIPAA, FERPA, COPPA, GLBA) do not apply. CCPA / US Privacy Laws (DPA §5) do not apply because LOGDit has no US data subjects. **No federal-sectoral DPA overlay required.**

UK sectoral: none directly engaged by OpenAI processing.

---

## 3. Term-by-term — VERIFIED against DPA v.010126

### 3.1 Roles — DPA §1.1

| | |
|---|---|
| **Contract** | "OpenAI acts as a Data Processor on the Customer's behalf, and this DPA governs such Processing." |
| **Playbook** | Controller-side. Require clear role designation. |
| **Verdict** | 🟢 Clean. |

### 3.2 Processing scope — DPA §1.2, §2.1

| | |
|---|---|
| **Contract** | "OpenAI will only Process Customer Data for the purposes of delivering the Services to Customer pursuant to the Agreement and this DPA." (§1.2) "OpenAI will process Customer Data only in accordance with Customer Instructions, unless required to do so by applicable law to which OpenAI is subject, in which case OpenAI will inform Customer of this requirement prior to processing unless legally prohibited from doing so." (§2.1) |
| **Playbook** | Processing limited to providing the Service. |
| **Verdict** | 🟢 Clean. Note: "Customer Instructions" is defined to include "any instructions provided via the configuration tools and other tools within the Services made available by OpenAI" (§2.1) — this means **LOGDit's instructions also flow through OpenAI dashboard settings**. If LOGDit toggles "share Playground feedback" to on, that is a "Customer Instruction" to OpenAI to use the data for training. Keep settings audited and screenshotted. |

### 3.3 No-training commitment — **NOT IN THE DPA**

| | |
|---|---|
| **Contract** | The DPA contains no clause prohibiting OpenAI from training models on Customer Data. The closest hook is the purpose-limitation in §1.2 + Customer Instructions in §2.1: OpenAI may only process Customer Data for the documented purposes (delivering the Services), which by interpretation excludes training. But there is no explicit "OpenAI shall not train on Customer Data" sentence. |
| **Where the commitment lives** | OpenAI's unilateral policy page **"How your data is used to improve model performance"**, updated 13 March 2026 (`openai-docs/openai_no_training_default_2026-05-11.pdf` p.2): *"By default, we do not train on any inputs or outputs from our products for business users, including ChatGPT Team, ChatGPT Enterprise, and the API. We offer API customers a way to opt-in to share data with us, such as by providing feedback in the Playground, which we then use to improve our models. Unless they explicitly opt-in, organizations are opted out of data-sharing by default."* |
| **Mechanism strength** | Policy-based, default-opted-out, opt-in via in-dashboard action. Acceptable but unilaterally changeable by OpenAI. |
| **Playbook** | "The one term that is an automatic no": any clause **permitting** training. There is no clause permitting it — opt-in is required and is off by default. So the playbook position is satisfied negatively. The playbook does **not** require a bilateral no-training clause in the DPA; it requires that the system not allow training without our explicit consent. ✅ |
| **Verdict** | 🟠 Verified-but-contingent. The commitment is real for now. Treat as a posture monitored via `/privacy-legal:policy-monitor` rather than a settled contractual term. If OpenAI ever changes the default ("opt-out by default" → "opt-in by default" or any narrowing of who qualifies as "business users"), LOGDit must re-assess. |
| **Operational control** | In the OpenAI organisation settings, confirm and screenshot that any "share data with OpenAI" / "Playground feedback shared" / equivalent training-toggle is OFF. Save the screenshot to `docs/privacy/vendor-dpas/OpenAI_settings_2026-05-17.png` or a successor folder. |

### 3.4 Retention and Zero Data Retention (ZDR)

| | |
|---|---|
| **Contract** | DPA is silent on retention duration for inputs/outputs. §2.11 says return / deletion happens at Customer's instruction post-termination; nothing in-term. |
| **Actual practice** | Standard API tier: API inputs and outputs retained up to **30 days for abuse monitoring**, then deleted (OpenAI public posture; not in DPA). `[verify in OpenAI Enterprise Privacy / Business Data page — citation tagged because the exact 30-day language was not in the seed docs read for this review]` |
| **ZDR availability** | Confirmed by OpenAI sales correspondence dated 12 May 2026 (`openai-zdr-correspondence-2026-05-12.pdf`): "eligibility requires a minimum annual spend commitment of $25,000". **ZDR is not available to LOGDit at MVP scale.** |
| **Playbook** | Prefer minimum retention; accept standard purge per vendor policy as fallback. 30-day window is within the acceptable band. |
| **Verdict** | 🟡 Acceptable as a vendor position. **But the LOGDit privacy policy currently misrepresents this** — see §4 below and Condition F-1. |

### 3.5 Sub-processors — DPA §2.9, §2.10

| | |
|---|---|
| **Contract** | Sub-Processor List published at **https://platform.openai.com/subprocessors**. Customer pre-authorises this list (§2.9). OpenAI notifies of changes via blog post, in-service notification, "other reasonable means", or email if Customer subscribes on the Sub-Processor List page. **Customer has 30 days from notice to object.** If objections aren't resolved within 30 days, either Party may terminate the relevant portion of the Agreement, with refund of prepaid fees. (§2.9) Sub-processors are bound by comparable obligations and OpenAI remains liable for their acts/omissions (§2.10). |
| **Playbook** | ≥30 days advance notice for material changes. |
| **Verdict** | 🟢 Matches playbook. **Operational follow-up:** subscribe to email notifications on the Sub-Processor List page (do this in the dashboard) so changes don't slip past. |

### 3.6 International transfers — DPA §4 + Schedule 1 §8

| | |
|---|---|
| **Contract** | §4.2 (UK Data): "Customer hereby instructs OpenAI OpCo, LLC to process any UK Data in compliance with this DPA and with the **SCCs as amended by the UK Addendum, which are deemed entered into (and incorporated into this DPA by this reference) and completed as described in Schedule 1**." Schedule 1 §8 sets out the specifics: Module 2 (Controller-to-Processor) when Customer is Controller (LOGDit's case); docking clause off; Option 2 (general written authorisation) for sub-processors; optional Clause 11 language off; brackets in Clause 13 removed; **Clause 17 governing law = England and Wales**; **Clause 18(b) jurisdiction = courts of England and Wales**; Schedule 1 itself supplies SCC Annexes I and III; DPA §2.5 supplies SCC Annex II; **competent supervisory authority = ICO**. |
| **Playbook** | "US only with SCCs + UK Addendum + supplementary safeguards" acceptable. |
| **Verdict** | 🟢 **Best-practice incorporation.** All decisions made cleanly. No separate signing ceremony required. UK law applies, ICO supervises. |
| **Supplementary safeguard for the US transfer** | LOGDit's pre-transfer redaction (regex + LLM contextual pass) is the operative supplementary measure for Schrems II purposes. **This needs to be documented in a Transfer Impact Assessment** — see Condition F-2. |
| **TIA gap** | LOGDit's privacy policy §9 states "A summary of our Transfer Impact Assessment is available on request." A TIA does not exist yet in `docs/privacy/`. **Required follow-up.** |

### 3.7 Security measures (Annex II) — DPA §2.5

| | |
|---|---|
| **Contract** | "OpenAI will implement and maintain reasonable and appropriate organizational and technical security measures to protect Customer Data, as set forth in the Agreement." (§2.5) Schedule 1 §8.2(viii): "Section 2.5 (Security) of the DPA contains the information required in Annex II of the SCCs." |
| **What this means** | The DPA does not list specific technical and organisational measures. Annex II is satisfied by §2.5 plus whatever is "as set forth in the Agreement." The real security floor is OpenAI's published attestations: SOC 2 Type 2, ISO 27001:2022, ISO 27017, ISO 27018, ISO 27701, ISO 42001, CSA STAR (via Trust Portal). |
| **Playbook** | SOC 2 Type II report or equivalent. |
| **Verdict** | 🟡 Thin on contract paper; substantial on actual attestations. Standard for self-serve SaaS. **Operational follow-up:** request the SOC 2 Type 2 report under DPA §2.8 (annual right) and save to `docs/privacy/vendor-dpas/`. |

### 3.8 Breach notification — DPA §2.7

| | |
|---|---|
| **Contract** | "OpenAI will notify Customer **without undue delay after becoming aware** of any Personal Data Breach. OpenAI will provide reasonable assistance to Customer to help Customer comply with its obligations under Data Protection Laws in respect of such Personal Data Breach." (§2.7) |
| **Regulatory floor** | Processor must notify controller "without undue delay after becoming aware" — UK GDPR Art 33(2). `[settled]` The DPA exactly tracks the statutory minimum; no enhanced commitment. |
| **Playbook** | "Without undue delay; in time for us to meet our 72-hour ICO obligation." |
| **Verdict** | 🟡 Tracks the legal floor; weaker than ideal. **Operational mitigation:** LOGDit's internal incident-response plan must assume worst-case OpenAI notification timing and start the ICO clock from the moment LOGDit becomes aware of facts indicating a breach (not from confirmation by OpenAI). Build this into a breach-response runbook before launch. |

### 3.9 Audit rights — DPA §2.8

| | |
|---|---|
| **Contract** | Annual right to receive privacy and security policies + "information necessary to demonstrate compliance" (§2.8(i)); annual right to audit at Customer's expense, "minimally disruptive", "necessary to confirm" compliance, no more than once per year, subject to confidentiality agreement (§2.8(ii)). OpenAI may instead provide a summary of Audit Reports where permitted. |
| **Playbook** | SOC 2 Type II report or equivalent. |
| **Verdict** | 🟢 Acceptable. Practical mechanism: request the SOC 2 Type 2 report annually under §2.8(i). On-site audit option exists but is not realistic at LOGDit's scale. |

### 3.10 Deletion / return on termination — DPA §2.11

| | |
|---|---|
| **Contract** | "Following expiry or termination of the Agreement, OpenAI will, **at Customer's instruction**, return or delete Customer Data, and existing copies unless retention of Customer Data is required under applicable laws, in which case OpenAI will isolate and protect it from any further processing except to the extent required by applicable laws." (§2.11) |
| **Playbook** | Standard purge per vendor policy. |
| **Verdict** | 🟡 No automatic deletion timeline — relies on Customer instruction. **Operational follow-up:** LOGDit's termination checklist must include "instruct OpenAI to delete Customer Data" via `privacy@openai.com` or the dashboard. Add to the off-boarding runbook. |

### 3.11 Data subject requests — DPA §2.4

| | |
|---|---|
| **Contract** | OpenAI informs Customer of any DSR received, doesn't respond directly without authorisation, may redirect to Customer, and provides assistance via technical and organisational measures (§2.4). |
| **Playbook** | Standard. |
| **Verdict** | 🟢 Clean. |

### 3.12 Data subjects, categories, sensitive data — Schedule 1

| | |
|---|---|
| **Categories of data subjects** (Sched 1 §4) | "Customer's employees, customers, suppliers and generally End Users." Maps to LOGDit's data subjects = trainees (End Users) and incidentally patients (in pre-redaction text) — acceptable description. |
| **Categories of Customer Data** (Sched 1 §3) | "names, contact information, demographic information, or any other information provided by Customer's End Users in unstructured data." Acceptable. |
| **Sensitive data** (Sched 1 §5) | **"No sensitive data is intended to be transferred unless the user includes it unexpectedly in unstructured data."** |
| **Why this matters for LOGDit** | LOGDit's design *intends* to redact Art 9 health data before transfer, and *intends* not to transfer sensitive data. The DPA framing matches that intent. But "unless the user includes it unexpectedly in unstructured data" is exactly the redaction-failure scenario tracked as **DPIA Risk R-5**. The DPA quietly puts the responsibility for keeping sensitive data out on the Customer. |
| **Verdict** | 🟠 **Aligned with LOGDit's design but raises the stakes on redaction quality.** Strengthens the rationale for DPIA Condition C-12 (user-visible "report a redaction failure" affordance) and for periodic offline sampling of `cleanedContent` against a held-out test set. |

### 3.13 CCPA / U.S. Privacy Laws — DPA §5

Not applicable. LOGDit has no US data subjects. §5 commitments (no sale, no share, no combination with other data, no use outside the direct business relationship) are nonetheless useful as additional defensive language if any US user ever does access the app despite geo-restriction.

---

## 4. Privacy policy consistency check — VERIFIED

| # | Policy text | Contract / actual practice | Status |
|---|---|---|---|
| P-1 | §6: "We do not allow our processors to train AI models on your content. This is enforced contractually with each sub-processor listed in section 8." | OpenAI's no-training commitment is **policy-based, not contractual**. The DPA itself doesn't contain a no-training clause. | 🟡 **Soften the language.** Recommended edit: "We have configured our processors so that your content is not used to train AI models, and we monitor our processors' published policies on this. Our current sub-processors all commit to no-training by default for business-tier API use." This is honest about the mechanism. |
| P-2 | §6: "Content is not retained, used for any other purpose, or used to train AI models" (referring to the OpenAI redaction pass) | OpenAI retains API inputs/outputs up to 30 days for abuse monitoring; ZDR not available to LOGDit. "Not retained" is **inaccurate** for the standard API tier. | 🔴 **Fix before launch.** Recommended edit: replace the sentence with "The content is not used for any other purpose and is not used to train AI models. OpenAI retains API inputs and outputs for up to 30 days for abuse monitoring, after which they are deleted." |
| P-3 | §8: "We do not allow our processors to train AI models on your content." (general statement) | Same as P-1. | 🟡 Soften the language for the same reason. |
| P-4 | §9: "EU Standard Contractual Clauses with the UK Addendum, as incorporated into OpenAI's standard Data Processing Addendum." | **Confirmed accurate.** DPA v.010126 §4.2 + Schedule 1 §8 implements exactly this. | 🟢 |
| P-5 | §9: "A summary of our Transfer Impact Assessment is available on request." | **TIA does not yet exist.** | 🔴 Create `docs/privacy/TIA_OpenAI_2026-05-17.md` as Condition F-2. |
| P-6 | Sub-processors page: OpenAI's role "Large-language-model processing for transcript cleaning, redaction of unstructured identifiers, drafting reflections and tagging capabilities" | **Confirmed accurate.** Matches the two LLM operations in code. | 🟢 |
| P-7 | Sub-processors page: "Content is not used to train OpenAI's models under the standard API terms." | Aligns with what OpenAI's unilateral policy says, but the contractual location is the unilateral policy, not the DPA. | 🟡 Acceptable as a summary of the operative fact, but watch for OpenAI policy changes. |

---

## 5. Recommended actions (in order)

1. **Sign the DPA in the OpenAI dashboard** — the contract is in good order for a UK controller. Confirm the dashboard "I agree" / Order Form acceptance has occurred and save the date.
2. **Disable any data-sharing toggles** in the OpenAI organisation settings — confirm and screenshot. Save to `docs/privacy/vendor-dpas/OpenAI_settings_2026-05-17.png`. Re-screenshot annually.
3. **Subscribe to Sub-Processor List email notifications** (DPA §2.9 mechanism). Save the subscription confirmation.
4. **Patch privacy policy §6** to fix the retention misrepresentation and soften the no-training contractual claim — see §4 above for proposed wording. **🔴 P-2 must be fixed before launch; P-1 / P-3 are 🟡 housekeeping that should also ship before launch.**
5. **Create the Transfer Impact Assessment** at `docs/privacy/TIA_OpenAI_2026-05-17.md`. Short document — corridor, mechanism (SCCs + UK Addendum per DPA §4.2 + Sched 1 §8), risk in the destination (US Section 702 / EO 12333 surveillance scope), supplementary measures (LOGDit's pre-transfer regex + LLM redaction; OpenAI's published policy of no-training; OpenAI's confidentiality and law-enforcement notification commitments under DPA §§2.2-2.3), residual risk, decision to proceed.
6. **Save the executed DPA PDF** under version control (already in `openai-docs/`). Consider moving to `docs/privacy/vendor-dpas/` for consistency with the naming convention.
7. **Request the SOC 2 Type 2 report** annually under DPA §2.8(i). Save to `docs/privacy/vendor-dpas/`.
8. **Add OpenAI deletion-on-termination** to LOGDit's vendor off-boarding runbook (currently doesn't exist — build it).

---

## 6. If they won't move (escalation table)

OpenAI standard API tier is non-negotiable. The relevant decisions are LOGDit's:

| Issue | Live with it? | Alternative |
|---|---|---|
| ZDR unavailable at $25k/year minimum spend | Yes — accept 30-day abuse-monitoring retention, disclose in privacy policy | Defer until LOGDit's annual OpenAI spend approaches $25k/year, then re-evaluate ZDR |
| No-training commitment is policy-based not contractual | Yes — monitor via `/privacy-legal:policy-monitor` quarterly | If concerned, evaluate OpenAI Enterprise tier (different DPA terms) when commercially feasible |
| Breach notification "without undue delay" with no hour count | Yes — build internal IR plan that assumes worst-case OpenAI timing | n/a |
| Annex II is thin on the DPA itself | Yes — rely on SOC 2 + ISO attestations as the real floor | n/a |
| Deletion on termination requires Customer instruction | Yes — add to off-boarding runbook | n/a |

None of these are deal-breakers and all are within market norms for self-serve API SaaS in 2026.

---

## 7. Cross-skill linkage

- **[DPIA Risk R-10]** (Vendor terms drift) — partially closed; ongoing monitoring required via `/privacy-legal:policy-monitor`. The no-training policy page and ZDR pricing are the two things to watch.
- **[DPIA Condition C-6]** (DPA review on each vendor) — **OpenAI item closed**. Five vendors remain: AssemblyAI (next priority — only vendor that touches audio), MongoDB Atlas, Linode, Sentry, Google Workspace.
- **[DPIA Condition C-9]** (Verify other retention commitments) — informed by this review's finding that the OpenAI 30-day window is real and that the privacy policy needs adjustment.
- **New follow-up F-2: Transfer Impact Assessment** — must be created.
- **DPIA Risk R-5 reinforced.** Schedule 1 §5 makes LOGDit's redaction quality contractually load-bearing. Consider strengthening C-12 (user-reported redaction failure mechanism) and adding periodic offline sampling.

---

## 8. Pre-signing gate (because this is a non-lawyer signing a DPA)

> Signing a DPA is a legal act — it binds LOGDIT LTD to specific data-protection obligations that flow to the ICO and to data subjects. Have you reviewed this with a UK data-protection solicitor? If no, here is the brief to bring to one before signing:
>
> 1. **Counterparty:** OpenAI OpCo, LLC (US). UK Data routed direct to OpenAI OpCo, LLC; EEA / Swiss customers contract with OpenAI Ireland Ltd, not us.
> 2. **Direction:** LOGDIT LTD is the Controller; OpenAI is the Processor. Verified §1.1.
> 3. **Material terms reviewed:** §§1–6 + Schedule 1. SCCs Module 2 + UK Addendum incorporated by reference per §4.2 + Schedule 1 §8.2. UK law and courts. ICO as supervisory authority.
> 4. **Three things to ask the solicitor before signing:**
>    - (a) Is OpenAI's unilateral no-training policy sufficient given LOGDit's Art 9 data, or does the lack of a contractual no-training clause warrant pausing for an Enterprise-tier negotiation? My view: acceptable for MVP; revisit at 1000 DAU. Confirm.
>    - (b) Is the "without undue delay" breach-notification clause acceptable given LOGDit's 72-hour ICO obligation? My view: acceptable in the market, but LOGDit's internal IR plan must compensate. Confirm.
>    - (c) Schedule 1 §5 ("no sensitive data unless the user includes it unexpectedly") allocates redaction-failure risk to LOGDit. Confirm we're comfortable with that allocation given the redaction pipeline's design.
> 5. **Decision deferred to solicitor if appetite warrants:** none of the above is a hard block.

If you proceed without solicitor review, document the decision and the reasoning in a brief sign-off note alongside this review. Re-engage at the 1000-DAU trigger (per the practice profile escalation table).

---

## 9. Verification record

All items on the §9 checklist of the previous DRAFT are now resolved:

- [x] Version date: **v.010126** (effective 1 January 2026)
- [x] Roles: OpenAI = Processor, Customer (LOGDIT LTD) = Controller (DPA §1.1)
- [x] No-training clause in DPA: **No.** Commitment is policy-based (OpenAI "How your data is used to improve model performance", updated 13 March 2026). See §3.3.
- [x] Retention: Default 30 days for abuse monitoring; ZDR unavailable to LOGDit ($25k/yr floor, per OpenAI sales correspondence 12 May 2026). See §3.4.
- [x] Sub-processor list URL: **https://platform.openai.com/subprocessors** (DPA Definitions). Change-notice: blog / in-service / email if subscribed. Objection: 30 days. Termination remedy if not resolved within 30 days. (§2.9)
- [x] Transfer mechanism: SCCs + UK Addendum, Module 2, deemed entered into and incorporated by reference. UK law and courts. ICO supervisory authority. (§4.2 + Schedule 1 §8)
- [x] Breach notification: "without undue delay after becoming aware" (§2.7) — no specific hour count.
- [x] Audit rights: annual policies/info on request (§2.8(i)); annual audit at Customer expense or audit-report summary in lieu (§2.8(ii)). SOC 2 Type 2 + ISO 27001 + others published.
- [x] Deletion on termination: at Customer's instruction (§2.11) — no automatic timeline.
- [x] Liability: governed by underlying Agreement; sub-processor acts/omissions remain OpenAI's liability "to the same extent" (§2.10).
- [x] Definitions captured verbatim in source PDF (DPA §6).
- [ ] OpenAI dashboard settings screenshot — **operational follow-up, not yet performed.**

---

## 10. Sign-off

**Sign-off (founder, non-lawyer):** _____________________ (LOGDIT LTD), date _____________

**Recommended solicitor counter-sign before launch (or at 1000 DAU, whichever first):** _____________________ (UK data-protection solicitor), date _____________

---

## 11. Follow-ups (numbered F-series for traceability)

| # | Follow-up | Priority | Owner |
|---|---|---|---|
| **F-1** | Patch privacy policy §6 to fix retention misrepresentation and soften the "contractually enforced no-training" language. Specific wording in §4 above. | 🔴 Pre-launch | Founder |
| **F-2** | Create Transfer Impact Assessment at `docs/privacy/TIA_OpenAI_2026-05-17.md`. Cover: corridor (UK→US), mechanism (SCCs+UK Addendum per DPA §4.2 + Sched 1 §8), destination risk (FISA 702 / EO 12333 in-scope `[verify]`), supplementary measures (pre-transfer redaction; OpenAI no-training policy; confidentiality + law-enforcement notification per DPA §§2.2-2.3), residual risk, decision. | 🔴 Pre-launch (closes a privacy-policy promise) | Founder |
| **F-3** | Disable any OpenAI dashboard "share data" / Playground-feedback / training opt-in toggles. Screenshot and save. Re-screenshot annually. | 🔴 Pre-launch | Founder |
| **F-4** | Subscribe to OpenAI Sub-Processor List email notifications. Save confirmation. | 🟠 Pre-launch | Founder |
| **F-5** | Build vendor off-boarding runbook including "instruct OpenAI to delete Customer Data" via `privacy@openai.com`. | 🟡 First 90 days | Founder |
| **F-6** | Request SOC 2 Type 2 report under DPA §2.8(i). Save to `docs/privacy/vendor-dpas/`. | 🟡 First 90 days | Founder |
| **F-7** | Add OpenAI policy-page monitoring to `/privacy-legal:policy-monitor` quarterly sweep. The two pages to watch: (a) "How your data is used to improve model performance" (currently dated 13 March 2026), and (b) the Sub-Processor List. Capture each one's "last updated" date in the practice profile and alert on change. | 🟡 First 90 days | Founder |
| **F-8** | Move executed DPA PDF from `openai-docs/` to `docs/privacy/vendor-dpas/OpenAI_DPA_v.010126.pdf` for naming-convention consistency, OR leave in `openai-docs/` and document the rationale in the practice profile. | 🟢 Housekeeping | Founder |
| **F-9** | Strengthen DPIA Condition C-12 (user-visible "report a redaction failure" affordance) given Schedule 1 §5's allocation of redaction-failure risk to LOGDit. | 🟡 First 90 days | Founder |

---

## What's next? (decision tree)

1. **Patch the privacy policy (F-1)** — this is the single highest-priority follow-up; the policy currently misrepresents the OpenAI retention position. Two-sentence edit. Do today.
2. **Draft the TIA (F-2)** — once F-1 is done, F-2 is what makes the privacy policy's "TIA available on request" line accurate. Short document, ~1 hour.
3. **Do the operational steps (F-3, F-4)** — disable the toggle, subscribe to sub-processor notifications. ~10 minutes.
4. **Move to AssemblyAI next** — second-highest-priority vendor; only one that handles audio.
5. **Or update the DPIA** to incorporate this review's findings — flip C-6 (OpenAI) to done, add F-1 through F-9 to the DPIA's open-conditions list, update R-10 with the actual contractual surface area.

End of DPA review — VERIFIED v.010126 against executed text 2026-05-17.
