# LLM Hosting, GDPR & PII Redaction — Architecture & Decisions

**Status:** Pre-release engineering handoff
**Last updated:** 2026-07-14
**Scope:** How we run DeepSeek V4 Flash (and the redaction pipeline that feeds it) in a UK-GDPR-defensible way for the doctor-trainee portfolio app.

> ⚠️ **Disclaimer:** This document is practitioner-grade engineering reasoning, **not a signed-off legal opinion**. Every GDPR conclusion here — especially the "anonymous-to-recipient" position and the transfer analysis — must be reviewed and signed off by the DPO before go-live. Treat the compliance claims as *architecture that makes compliance achievable*, not as a certificate of compliance.

---

## 1. Purpose & context

The app captures **doctor-trainee cases and reflections** (a professional e-portfolio for training/appraisal). We use an LLM (DeepSeek V4 Flash) to analyse those reflections. This document records how we host that model and protect data in a way that stands up under **UK GDPR** and NHS-adjacent expectations (DSPT/DTAC).

**The single most important fact about our data model:**

- **Two data subjects exist:**
  1. **The trainee** — an identified user, in a direct relationship with us, under our terms/lawful basis. Their reflections are *their* personal data.
  2. **The patient** — **anonymous by design.** Trainees are instructed never to enter patient names, NHS numbers, or other identifiers.
- **"Anonymous by instruction" ≠ "anonymous in law."** Free-text reflections carry a real **re-identification risk** (mosaic effect: rare case + specialty + hospital + date), and trainees will occasionally slip and type an identifier. So we treat the data as **low-risk pseudonymised, being actively de-identified** — *not* "no personal data."
- **We are the data controller and cannot offload that responsibility onto trainees.** "We told them not to enter PII" is a necessary organisational measure but **legally insufficient on its own** (ICO position). It must be backed by technical controls — hence the redaction pipeline is the **load-bearing compliance control** of the whole system.

This reframe is what makes the whole architecture affordable: because patient data is anonymous-by-design and redacted, we do **not** need sovereign UK-only dedicated hosting for the model. The compliance burden moves **upstream** to "can we prove the de-identification works," which is cheaper but puts accountability squarely on us.

---

## 2. TL;DR — the recommended architecture

```
Audio ─▶ Transcription (in-region)
             │  raw text
             ▼
        ┌──────────── REDACTION (must run at egress, before any external/global model) ─────────────┐
        │  Layer 1: deterministic regex (NHS number checksum, postcode, phone, email, DOB)          │
        │  Layer 2: Azure AI Language PII (ML NER — names, orgs, locations)  [UK South]              │
        │  → union the redactions; log confidence/entities as DPIA evidence                          │
        └──────────────────────────────────────────────────────────────────────────────────────────┘
             │  redacted (patient-anonymised, ideally trainee-anonymised) text
             ▼
        Cleaning + Analysis stages ─▶ DeepSeek V4 Flash on **Azure AI Foundry (Global Standard)**
             │                          (overflow: pinned OpenRouter → DeepInfra + Fireworks)
             ▼
        Result
```

**Core decisions:**
1. **Model host:** DeepSeek V4 Flash on **Azure AI Foundry (Global Standard)** — Microsoft is the processor under a DPA we already hold; DeepSeek/China is **not** in the data path.
2. **Redaction is the compliance control** and must run **before** any model (including "cleaning") sees the text.
3. **Two-layer redaction:** deterministic regex **+** Azure AI Language PII (diverse, uncorrelated failure modes).
4. **Capacity overflow:** pinned OpenRouter (**DeepInfra + Fireworks**, `allow_fallbacks:false`, ZDR policy) — compliant because the payload is redacted/anonymous.

---

## 3. The redaction pipeline — current state, problem, target

### 3.1 Current implementation (as-is)

Code: `apps/api/src/processing/` — orchestrated in `processing.service.ts` (`cleanRedactAndComplete`).

```
Audio: Transcription (AssemblyAI) → Cleaning (LLM) → Redaction (regex + LLM) → COMPLETE
Text:                               Cleaning (LLM) → Redaction (regex + LLM) → COMPLETE
```

- `transcription.stage.ts` → AssemblyAI (`llmService.transcribeAudio`). **Sees raw audio → raw text.**
- `cleaning.stage.ts` → an **LLM call** (`llmService.invokeStructured`, `Stage.Cleaning`) that fixes medical terms/fillers. **Sees raw, un-redacted text.**
- `redaction.stage.ts` → two internal layers: (1) `redactStructuredPii` regex (`utils/pii-regex.ts`), (2) an LLM pass (`Stage.Redaction`). Runs **after** cleaning.

### 3.2 ⚠️ The problem

**Redaction currently runs too late.** Two models see raw, potentially-identifying text *before* redaction:
1. **AssemblyAI transcription** (raw audio → text; no redaction flag observed in `transcribeAudio`).
2. **The Cleaning LLM** (raw text, before `RedactionStage`).

Best practice (and our compliance model) requires redaction **at egress from the trusted boundary, before any model/processor receives the data.** As-is, if `Stage.Cleaning` or AssemblyAI runs on a Global/US endpoint, raw text (with any slipped identifiers) leaves the UK **before** it's ever redacted.

**Doc discrepancy to reconcile:** `CLAUDE.md` says "AssemblyAI transcription with automatic PII redaction *before* cleaning," but the authoritative `RedactionStage` runs *after* cleaning. Confirm whether AssemblyAI's built-in redaction is actually enabled, or whether our real redaction is landing too late.

### 3.3 Target state

1. **Move redaction (at minimum the deterministic regex layer) to run FIRST**, before the cleaning LLM. Regex is cheap, deterministic, in-process — it strips the highest-risk structured identifiers (NHS numbers) before anything external sees them.
2. **Ensure every pre-redaction stage is in-region (UK):** transcription (AssemblyAI region + whether its own redaction is on) and the cleaning model.
3. **Ideal ordering:** `Transcription (in-region) → Redaction → Cleaning → Analysis` — so every LLM after redaction only ever sees redacted text.

---

## 4. Redaction service selection

### 4.1 Two-layer design principle

Defence-in-depth value comes from **diversity (uncorrelated failure modes), not duplication.** Two ML NER services fail on the *same* hard cases. The strong pairing is **ML NER + a deterministic method**:

- **Layer 1 (deterministic regex):** structured UK identifiers with validation — **NHS number (modulus-11 checksum)**, CHI (Scotland), postcodes, phone, email, DOB, NI number. Guarantees ~100% recall on the *catastrophic* identifier (NHS number) that ML cannot promise. **$0, in-process, deterministic.** We already have this (`pii-regex.ts`) — needs hardening (add NHS checksum + UK-specific patterns).
- **Layer 2 (ML NER): Azure AI Language — PII detection.** Contextual free-text (names, orgs, locations). In-region UK South, purpose-built, confidence scores.

Run **both** and **union** the redactions (a span flagged by *either* layer is masked). Run **regex first** (strips structured IDs before the Azure cloud call).

### 4.2 Service comparison (why Azure AI Language won)

| Service | Deployment | ~Price (per 1M chars) | Clinical F1* | Notes |
|---------|-----------|-----------------------|--------------|-------|
| **Azure AI Language PII** 🏆 | Azure **UK South** (managed) | ~$1–2 | ~91% | Existing Microsoft DPA, no new vendor, confidence scores, in-region |
| **Private AI / Limina** 🥈 | Self-host **container** (UK) | Commercial license | high | Best residency+accuracy balance; data never leaves; upgrade path |
| Microsoft Presidio | Self-host (OSS) | $0 + compute | 0.5–0.85 | Free but general-purpose, maintenance burden, overlaps Azure NER |
| AWS Comprehend Medical | AWS London | ~$14–100 (DetectPHI) | ~83% | Clinical but US/Safe-Harbor-oriented, **new cloud vendor + cross-cloud hop**, expensive |
| Google Cloud DLP | GCP EU | ~$3 (inspect) | general | Capable but **new cloud vendor + cross-cloud hop** |
| John Snow Labs | Self-host (license) | Enterprise (high fixed) | **96%** | Accuracy king / regulatory-grade, but **overkill** + heavy Spark infra |

\* F1 figures largely from John Snow Labs' own comparison — treat relative ordering as indicative, not gospel.

**Winner: Azure AI Language PII.** Reasoning: the redactor sees raw text so it must be **in-region UK**; we're already on Azure under a **Microsoft DPA** (no new vendor/sub-processor/DPA, no cross-cloud raw-text hop that AWS/Google would force); it's **purpose-built, cheap, deterministic-ish with confidence scores** (auditable DPIA evidence); and our data is anonymous-by-design so this is a *safety net*, not a regulatory-grade bulk-de-id problem. **Bonus:** it can replace the general-purpose LLM redaction call currently in `redaction.stage.ts`.

**Runner-up: Private AI / Limina** — the upgrade path if Azure Language's recall proves insufficient or we want zero third-party processing (container in our own UK infra, data never leaves).

---

## 5. Model hosting — why Azure AI Foundry

### 5.1 The provider landscape (why nearly everything was rejected)

To use the **actual DeepSeek V4 Flash model** *and* be GDPR-viable for UK data, the field collapses hard:

| Where you can get V4 Flash | GDPR-viable? |
|----------------------------|--------------|
| DeepInfra, SiliconFlow, Novita, Parasail, first-party DeepSeek (OpenRouter/direct) | ❌ US/China, no adequacy / no DPA (for *identifiable* data) |
| DigitalOcean | ❌ **US-only inference** (confirmed — no EU/UK region for inference) |
| Nebius, Scaleway, OVHcloud, IONOS, Mistral, STACKIT, Nscale (EU hosts) | ❌ **They don't serve V4 Flash** — only substitutes / DeepSeek R1-distills |
| NextBit (Spain) | ⚠️ Only EU host of real V4 Flash, but **no DPA, no certs, 90-day retention, ~8-person vendor** — high-effort fallback |
| **Microsoft Azure AI Foundry** | ✅ **Yes** — Microsoft-hosted, no China, DPA held |

**Key fact:** Azure hosts DeepSeek's open weights **itself** — *"100% hosted by Microsoft on its own servers, with no runtime connections to the model providers."* Microsoft is the processor; prompts are **not** shared with DeepSeek, **not** used for training, and **do not go to China.** This dissolves the entire "China/no-adequacy" blocker that ruled out the OpenRouter/first-party options.

### 5.2 EU-hosted alternatives (if we ever substitute the model)

If we drop the requirement for the *specific* V4 Flash model, EU-native hosts serve strong substitutes. Best-researched options (all with in-region residency + DPA):

- **OVHcloud AI Endpoints** (France) — cheapest (gpt-oss-20b €0.04/€0.15, Mistral Small 3.2 €0.09/€0.28), HDS-certified since 2019 (confirm AI-Endpoints scope).
- **Scaleway** (France) — **Zero Data Retention by default**, HDS (IaaS scope), Mistral Small €0.15/€0.35.
- **Mistral La Plateforme** (EU) — EU-native, Ministral 3 $0.10/$0.10, Small 4 $0.15/$0.60; ZDR only on Scale plan; no HDS.
- **Nebius** — hosts **DeepSeek V4-Pro** (not Flash) + Qwen3 in EU (pin a dedicated EU endpoint).

### 5.3 Benchmark context (for substitution decisions)

Artificial Analysis Intelligence Index (one consistent methodology):

| Model | Intelligence Index | vs V4 Flash | EU-hostable? |
|-------|:---:|:---:|---|
| GLM-5.2 | 51 | 🟢 better | ✅ Scaleway, Nebius |
| DeepSeek V4-Pro | 44 | 🟢 better | ✅ Nebius (EU pin) |
| **DeepSeek V4 Flash** | **40** | *baseline* | ❌ only US/China hosts / Azure |
| Qwen3.5-397B | 34 | 🔴 below | ✅ Scaleway, Nebius |
| Mistral Medium 3.5 | 30 | 🔴 below | ✅ Mistral, Scaleway |

V4 Flash raw scores: MMLU-Pro 83, GPQA Diamond 71.2, SWE-bench Verified ~74–79 (varies by eval). **Best like-for-like EU substitute:** Qwen3-235B-A22B on Scaleway/OVHcloud (near-Flash coding, cheaper). **To beat Flash, EU-hosted:** GLM-5.2 on Scaleway.

---

## 6. Azure Foundry deployment-type reality (critical nuance)

**DeepSeek V4 Flash on Foundry is `Global Standard` only.** Confirmed from Microsoft's region-availability tables (2026-07-08):

| Deployment type | V4 Flash? | Where inference is processed |
|-----------------|:---:|------------------------------|
| **Global Standard** | ✅ (incl. a UK South resource) | ⚠️ **Any Azure region worldwide** |
| Data Zone Standard | ✅ **US data zone only** | US only (no EU data zone for DeepSeek) |
| **Standard/Regional** (single region) | ❌ **Not available** | Only Azure OpenAI GPT models get single-region pinning |
| Regional Provisioned | ❌ (only older R1/V3/V3.2) | — |

**Implication:** A "UK South" DeepSeek deployment keeps **data at rest** in the UK, but **inference is processed globally** (Global routing) — *not* UK data residency. This is fine **only because** our payload is redacted/anonymised (see §7). Do **not** claim "UK data residency" for the inference path in the DPIA — describe it as *"at-rest UK; processing global under Microsoft's DPA + SCCs."*

**To get true UK-South processing for V4 Flash** you would need **Managed Compute (dedicated GPU)** — see §8. That is the only in-region option, and it's expensive.

---

## 7. GDPR analysis

### 7.1 "It's all Azure" ≠ "no international transfer"

UK GDPR Chapter V is about **geography, not corporate boundaries**. Microsoft routing our prompt from UK South to a US datacentre for inference **is** a restricted transfer, even Microsoft-to-Microsoft. It is **lawful** because:
- Microsoft's DPA incorporates **EU SCCs + the UK IDTA/Addendum** (valid Article 46 mechanism).
- Microsoft publishes supplementary measures (encryption, "Defending Your Data," transparency) for Schrems II.
- Microsoft is a contracted Article 28 processor, no-training.

So Global Standard is **compliant-capable via SCCs** — but we must (a) rely on/evidence those SCCs, (b) do our own **Transfer Risk Assessment** (incl. US CLOUD Act), and (c) document global processing accurately.

### 7.2 The anonymous-by-design lever

Because patient data is anonymous-by-design and redacted:
- The **patient-side** transfer problem largely dissolves (anonymous data is outside GDPR's transfer rules).
- The residual **trainee** personal data is low-risk and covered by Microsoft's SCCs.
- If we ensure the payload also carries **no trainee identifiers** and no linkable metadata reaches the provider, there's a strong argument the data is **anonymous *to the recipient*** — in which case transfer rules barely bite at all.
  - ⚠️ This is a **defensible position, not a free pass.** A strict regulator may still treat it as pseudonymised because *we* retain the linkage. Keep supplementary measures + DPO sign-off. Never over-claim "fully anonymous."

### 7.3 What this unlocked

The anonymous-by-design + redaction reframe means we do **NOT** need:
- ❌ The ~$10K/month dedicated Managed Compute UK South deployment.
- ❌ Modified Abuse Monitoring / ZDR (which requires EA/MCA-E — see §8).

We **CAN** run on **Azure Foundry Global Standard** (cheap, already live) with redaction + DPIA doing the compliance work.

### 7.4 DPIA must document

1. Data classification: anonymous-by-design patient data + low-risk trainee data; **residual re-identification risk** acknowledged.
2. Redaction as the primary mitigation, **with evidenced efficacy** (measured recall on identifiers, failure monitoring).
3. Transfer basis: at-rest UK; processing global under Microsoft SCCs/IDTA; TRA conclusion.
4. Sub-processors: Microsoft (Azure), AssemblyAI, (any OpenRouter providers if used).
5. The "anonymous-to-recipient" position + residual-risk register — **DPO sign-off required.**

---

## 8. Capacity & scaling

### 8.1 The constraint

- Azure Foundry default quota for DeepSeek: **20K TPM / 20 RPM**.
- Measured journey economics: ~**16K tokens/min peak** per portfolio journey → **20K TPM ≈ ONE concurrent user.**
- A quota-increase request to **175K TPM / 75 RPM** (for ~5 concurrent) was **DECLINED** (2026-07). Global Standard declines are usually account-standing (young/low-spend PAYG subscription) or regional capacity — not permanent.

### 8.2 Options (ranked)

1. **Hybrid: Azure primary + pinned-OpenRouter overflow** 🥇 (do now). Route Azure Foundry first; on 429/throttle or over budget, spill to pinned OpenRouter. Compliant because the payload is redacted/anonymous. OpenRouter providers have far higher throughput / no per-minute limits.
2. **Multi-region Azure.** Quota is per (subscription, region, model). Deploy DeepSeek Global Standard across 4–5 regions (each ~20K default) and load-balance → ~80–100K TPM, all under the Microsoft DPA, no OpenRouter. Since it's Global Standard anyway, multi-region is fine post-redaction.
3. **Re-request incrementally.** Ask for a smaller bump (40–60K TPM) with business justification; find out *why* it was declined. Incremental asks + spend history get approved more often.
4. **PTU / Managed Compute (dedicated).** Guaranteed capacity but ~$2,448/mo per PTU or ~$10–13K/mo dedicated GPU. Park until volume justifies.

### 8.3 The OpenRouter pin (post-redaction, anonymous payload)

Because the payload is anonymous + we pin, EU/UK residency is **not** required — the field widens to strong US providers. Selection criteria: **ZDR/no-training** (defence-in-depth vs redaction failure), **non-China** (catastrophic-failure avoidance), reliability, price/throughput.

**Pin to `DeepInfra` (primary) + `Fireworks` (fallback):**
- **DeepInfra** 🇺🇸 — cheapest ($0.09/$0.18), no-log/no-train/in-memory-only, 99.9% uptime, well-funded/stable.
- **Fireworks** 🇺🇸 — best certs (**SOC2 II, HIPAA, ISO 27001/27701/42001**), default ZDR for open models — the HIPAA-grade safety net if redaction ever slips.
- Optional headroom: DigitalOcean, Parasail (both US, no-store/no-train, high uptime).

**Config requirements:**
- `allow_fallbacks: false` (never silently route to a non-pinned/China provider).
- Require **ZDR / no-training** data policy.
- **Log the serving provider** per request (proves the pin held — DPIA evidence).
- **Exclude entirely:** all China-hosted (SiliconFlow, StreamLake, Baidu, Novita, first-party DeepSeek, Alibaba) and uncontrolled-compute (AkashML, Venice).

---

## 9. Cost summary

### 9.1 Unit prices

| Item | Cost |
|------|------|
| AssemblyAI transcription (Universal-3 Pro, batch) | $0.21/hr |
| AssemblyAI **PII Text Redaction** add-on (Layer 0, audio only) | **+$0.08/hr** — use *Text* redaction, NOT *Audio* redaction (+$0.05/hr, bleeps the audio) |
| Regex redaction (Layer 1) | $0 (in-process) |
| Azure AI Language PII (Layer 2) | ~$1–2 per 1,000 text records (1 record = 1,000 chars); 5,000 records/mo free |
| Cleaning LLM (GPT-4.1-mini, in-region UK) | $0.40 / $1.60 per 1M tokens (in/out) |
| Azure Foundry V4 Flash (Global Standard, serverless) — analysis | ~$0.11/$0.22 per 1M tokens |
| OpenRouter DeepInfra (overflow) | $0.09/$0.18 per 1M tokens |
| OpenRouter Fireworks (fallback) | $0.14/$0.28 per 1M tokens |
| **Rejected:** Managed Compute UK South (dedicated GPU) | ~$10–13K/mo (or ~$7–8.5K reserved) — not needed post-redaction |
| **Rejected:** Modified Abuse Monitoring ZDR | needs EA (500 seats) or MCA-E ($500K/yr) — out of reach |

### 9.2 Per-entry cost model

**Assumptions:** ~140 words/min speech → ~6 chars/word → ~1.33 tokens/word. Azure Language @ $1/1,000 records. Cleaning @ GPT-4.1-mini. Analysis = one DeepSeek journey (~57K tokens, ~40K in / ~17K out), which is driven mostly by fixed prompt overhead across ~27 calls, so it does **not** scale linearly with a single entry's audio length.

| Stage | 5-min entry | 10-min entry | Math (10-min) |
|-------|:-----------:|:------------:|---------------|
| Transcription (base) | $0.0175 | $0.0350 | $0.21/hr × 0.1667 hr |
| AssemblyAI PII redaction add-on | $0.0067 | $0.0133 | $0.08/hr × 0.1667 hr |
| Regex redaction | $0.0000 | $0.0000 | in-process |
| Azure Language PII | $0.0042 | $0.0084 | 8.4 records × $0.001 |
| Cleaning LLM | $0.0021 | $0.0041 | 2.4K in ×$0.40/M + 1.95K out ×$1.60/M |
| **Ingestion subtotal** | **≈ $0.031** | **≈ $0.061** | |
| Analysis (per journey) | ~$0.008 | ~$0.008 | 40K in ×$0.11/M + 17K out ×$0.22/M |
| **All-in per entry** | **≈ $0.039** | **≈ $0.069** | |

**Takeaways:**
- **Transcription dominates** (~79–80% of ingestion). The full multi-layer redaction adds only **~1–2¢/entry** (AssemblyAI add-on + Azure Language; regex is free).
- Ingestion scales ~linearly with audio length; analysis is roughly constant per journey.
- **Scale (ingestion only):** 5,000 entries/mo ≈ $153 (5-min) / $305 (10-min); 20,000/mo ≈ $611 / $1,220.
- **Confirm before quoting:** exact Azure Language rate ($1 vs ~$2/1,000 records → ±~$0.008/entry), actual cleaning model (Mistral Small ~halves the cleaning line), and real analysis tokens/entry.

---

## 10. Decision log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07 | **Host V4 Flash on Azure Foundry (Global Standard)**, not first-party DeepSeek / OpenRouter-direct | Microsoft-hosted (no China), DPA held; Global Standard is fine post-redaction |
| 2026-07 | **Do NOT buy dedicated Managed Compute UK South** | ~$10K+/mo; unnecessary once payload is anonymous-by-design + redacted |
| 2026-07 | **Do NOT pursue Modified Abuse Monitoring/ZDR** | Requires EA/MCA-E (500 seats / $500K/yr) — unattainable pre-revenue; not needed for anonymous data |
| 2026-07 | **Two-layer redaction: regex + Azure AI Language PII** | Diverse/uncorrelated failure modes; in-region; existing Microsoft DPA; cheap |
| 2026-07 | **Redaction must run before cleaning** (reorder pipeline) | Cleaning is an LLM that currently sees raw text — redaction is landing too late |
| 2026-07 | **Overflow via pinned OpenRouter (DeepInfra + Fireworks)** | Azure quota (175K/75) declined; anonymous payload + pin makes this compliant |
| 2026-07 | **NextBit / EU-native hosts not adopted** | Don't serve V4 Flash (except NextBit, which lacks DPA/certs); Azure is the pragmatic answer |
| 2026-07 | **Enable AssemblyAI PII Text Redaction (Layer 0) on the EU endpoint** | Redacts at the source (Dublin, in-region); ~+$0.08/hr (~1¢/entry); identifier-only policies |
| 2026-07 | **Cleaning model must be in-region UK** (GPT-4.1-mini regional short-term, or self-hosted Mistral Small / Ministral 3 / Phi-4-mini) | Cleaning is pre-redaction → sees raw text. GPT-5-mini can't be used (Global-only in UK South) |

---

## 11. Open items / TODO for the next engineer

- [ ] **Reorder the pipeline** so redaction (≥ the regex layer) runs **before** the cleaning LLM. Ideal: `Transcription → Redaction → Cleaning → Analysis`.
- [ ] **AssemblyAI PII redaction (Layer 0, audio only).** Findings (2026-07): AssemblyAI **does** offer PII Text Redaction; it's **available on the EU endpoint** for English; `ASSEMBLYAI_BASE_URL` **defaults to `https://api.eu.assemblyai.com`** ([app.config.ts:77](../../apps/api/src/config/app.config.ts#L77)) → raw audio already processed in **Dublin, EU** (UK–EU adequacy). **BUT `redact_pii` is NOT currently enabled** in `transcribeAudio` ([llm.service.ts:377](../../apps/api/src/llm/llm.service.ts#L377)) — the "UK-compliant PII redaction" comment is aspirational. Actions:
  - [ ] Enable `redact_pii: true` with **identifier-only** `redact_pii_policies` (person_name, location, date, phone, email, IDs) — **NOT** medical policies (they'd destroy clinical content). Use `redact_pii_sub: 'entity_name'` (typed placeholders, keeps grammar).
  - [ ] Only ever consume the redacted **`transcript.text`** — never raw `transcript.words[].text` or other feature outputs (they stay un-redacted).
  - [ ] Confirm production `ASSEMBLYAI_BASE_URL` isn't overridden to NA; confirm `keyterms_prompt` parity on the EU endpoint; sign the AssemblyAI **BAA/DPA**.
  - [ ] Fix the misleading comment at llm.service.ts:363. Reconcile the `CLAUDE.md` "redaction before cleaning" claim.
- [ ] **Text-field (non-audio) inputs bypass AssemblyAI** → no Layer 0. Make the **regex + Azure Language PII** redaction a **shared stage on both paths, before cleaning** (audio gets 3 layers, text gets 2). Add input-time client-side PII warnings on the text field.
- [ ] **Confirm `Stage.Cleaning` (and `Stage.Redaction`) model region** in `docs/llm/llm-pipeline-stages.md` / `ModelConfigService` — any pre-redaction LLM must be in-region UK.
- [ ] **Add Azure AI Language PII** as redaction Layer 2 (UK South); consider retiring the general-purpose LLM redaction call in `redaction.stage.ts`.
- [ ] **Harden `redactStructuredPii`** (`utils/pii-regex.ts`): NHS number **modulus-11 checksum**, CHI, postcodes, NI numbers; union-merge with Azure Language output.
- [ ] **Ensure the analysis payload carries no trainee identifiers / linkable metadata** (strengthens the anonymous-to-recipient position).
- [ ] **Implement Azure→OpenRouter overflow routing** (detect 429/quota → pinned OpenRouter `allow_fallbacks:false` + ZDR policy + serving-provider logging).
- [ ] **Re-request Azure quota incrementally** (40–60K TPM) and/or set up **multi-region** Azure deployments.
- [ ] **Add input-time PII detection** in the app (warn trainee before submit — prevention, uncorrelated with redaction).
- [ ] **Write the DPIA/TIA** (§7.4) and get **DPO sign-off** on the anonymous-to-recipient position + transfer basis.
- [ ] **Update sub-processors page / RoPA** with Microsoft (Azure Foundry), AssemblyAI, and any OpenRouter providers used.

---

## 12. Key references

- Microsoft — Data privacy for Foundry Models sold by Azure: https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/openai/data-privacy
- Microsoft — Region availability (deployment types) for Foundry Models: https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure-region-availability
- Microsoft — Foundry deployment types (Global/DataZone/Regional): https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/deployment-types
- Azure AI Language — PII detection: https://learn.microsoft.com/en-us/azure/ai-services/language-service/personally-identifiable-information/overview
- Modified Abuse Monitoring (ZDR) eligibility: https://larryjameshenry.com/posts/mastering-zero-data-retention-modified-abuse-monitoring/
- AssemblyAI — PII Redaction: https://assemblyai.com/docs/audio-intelligence/pii-redaction
- AssemblyAI — EU data residency (Dublin): https://www.assemblyai.com/docs/faq/do-you-offer-eu-data-residency
- AssemblyAI — pricing: https://www.assemblyai.com/pricing
- Related internal docs: `docs/llm/llm-pipeline-stages.md` (stage→model map), `CLAUDE.md` (message-processing pipeline), `apps/api/src/processing/` (pipeline code).

---

## 13. Glossary

- **Global Standard** — Azure deployment type; data-at-rest stays in geography but inference is processed in any Azure region worldwide.
- **Data Zone** — inference confined to a Microsoft-defined zone (US / EU / APAC). **DeepSeek only offers the US zone.**
- **Standard/Regional** — single-region inference pinning. **Not available for DeepSeek** (Azure OpenAI GPT models only).
- **ZDR** — Zero Data Retention (no prompt/output storage). On Azure this is "Modified Abuse Monitoring," gated behind EA/MCA-E.
- **TRA/TIA** — Transfer (Impact) Risk Assessment (Schrems II supplementary-measures analysis).
- **Anonymous-to-recipient** — data that the receiving processor has no reasonable means to re-identify, even if the controller retains linkage. Defensible basis for treating a transfer as low-/no-risk; requires DPO sign-off.
