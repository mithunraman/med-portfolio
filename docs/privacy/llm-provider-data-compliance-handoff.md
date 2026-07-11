# LLM Provider Data-Compliance — Handoff & Next Steps

> **Status:** In progress. Public sub-processor/privacy docs partly updated; compliance
> artefacts (DPIA/TRA/RoPA) not yet produced.
> **Last updated:** 2026-07-11
> **Context:** App is **pre-launch** — no production users, no real personal data processed yet.
> **Who this is for:** Whoever resumes the "add DeepSeek / finalise LLM sub-processor compliance"
> workstream. Readable standalone; assumes no prior context from the originating chat.

---

## 1. Objective

LOGDit is a **UK medical app** for doctors. A doctor speaks a voice reflection about a clinical
case → audio is transcribed → (redaction) → an LLM drafts a training-portfolio entry, tags
capabilities, etc. This processes **special-category health data under UK GDPR**.

This workstream has two goals:

1. **Add DeepSeek-class models to the production LLM pipeline** (product requirement — "DeepSeek is
   needed") without breaching UK GDPR.
2. **Get the sub-processor disclosure + privacy documentation + the mandatory compliance artefacts
   (DPIA / TRA / RoPA / DPA) in place before the first real user's data is processed.**

The central tension throughout: **DeepSeek availability vs. UK/EEA data residency vs. vendor
maturity.** See §5 for how that was resolved.

---

## 2. Key decisions already made (do not re-litigate without reason)

- **Production LLM providers = OpenAI or Microsoft Foundry only.**
- **OpenRouter / DeepSeek-via-OpenRouter / Alibaba (Variant B in `model-variants.ts`) is
  DEV/TEST ONLY.** It must never process real patient/production personal data (Alibaba = China,
  no UK adequacy). **TODO:** add an environment guard so Variant B cannot be selected when
  `NODE_ENV=production`.
- **DeepSeek is a genuine product requirement** (not optional).
- **A US transfer is accepted** for the DeepSeek path (see §5 — Foundry cannot keep DeepSeek in the
  UK/EEA today).
- **Chosen vendor = Microsoft Foundry** (Azure AI Foundry). Rationale: DPA auto-included,
  DPF-certified, real audited certs, mature, already a disclosed sub-processor, and it hosts the
  exact DeepSeek models needed.
- **Pre-transfer redaction is DEFERRED** by product decision, and redaction will also run
  **outside the UK**. ⚠️ This is the single biggest risk driver — see §6 and §7.

---

## 3. What has been DONE (this workstream)

### Public sub-processors page — `apps/landing/sub-processors.html`
- Reformatted from verbose per-vendor prose (6 fields each) to an **NHS-style 3-column table**:
  `Sub-processor | Purpose | Location`. (Benchmarked against NHS Federated Data Platform, which
  uses this exact format for health data.)
- Table styling added: `.subprocessor-table` / `.table-scroll` in `apps/landing/styles.css`.
- **Added Resend** (`Plus Five Five, Inc.`) — it was entirely missing despite sending OTP emails.
- **Fixed a factual error:** the page previously credited outbound OTP to a "Google Workspace SMTP
  relay." That is false — OTP is sent via the **Resend SDK** (`apps/api/src/email/email.service.ts`).
  Google Workspace is now correctly described as inbound-mailbox-only.
- Added **Firebase Cloud Messaging** (US) and **Microsoft Azure AI Foundry** rows.
- Added an under-table note pointing to Privacy Policy §9 for transfer safeguards + "copy of
  safeguards available on request" (satisfies the ICO "how to obtain a copy" expectation).

Current 9 rows: Oracle OCI (UK), MongoDB Atlas (IE), AssemblyAI (IE), OpenAI (US),
**Microsoft Azure AI Foundry (listed UK — SEE §8, needs correcting if DeepSeek runs US)**,
Google Workspace (EU), Firebase Cloud Messaging (US), Resend (US), Sentry (DE).

### Privacy Policy — `apps/landing/privacy.html`
- **§8** (sub-processor categories): added "push notification delivery"; removed the over-promise
  that the sub-processors page lists "regions and international-transfer mechanisms" (it now lists
  purpose + location only, and points to §9 for transfers).
- **§9** (international transfers): added **Resend** and **Firebase (Google LLC)** as US transfers
  (SCCs + UK Addendum); noted **Foundry as UK South (no transfer mechanism)** — ⚠️ this Foundry
  statement will be WRONG if DeepSeek runs on Foundry-US (see §8).

### Terms of Use — `apps/landing/terms.html`
- No change made. §5 already sublicenses Your Content only to "sub-processors listed at
  sub-processors.html," so new vendors are covered automatically. **Watch:** §5 also promises "we
  do not use Your Content to train AI models… we require our sub-processors to abide by the same."
  Any provider config that allows training makes this **false** — the no-training/zero-retention
  config is what keeps §5 honest.

---

## 4. Provider evaluation — verified research findings

All findings below are from web research during this workstream. **Compliance-critical facts are
vendor self-attestation unless marked otherwise; confirm against signed contracts / audit reports.**

| Option | Residency | Transfer | Signed Art 28 DPA | Retention / training | Maturity | Verdict |
|---|---|---|---|---|---|---|
| **Microsoft Foundry (DeepSeek-V4)** | **US** (see §5) | SCCs / **Data Bridge** | ✅ Auto-included | Configurable ZDR; no-train | Mature, audited | **Chosen** |
| Foundry (GPT-4.1/GPT-5) | **UK South / EU DataZone** ✅ | None (adequacy) | ✅ Auto-included | Configurable ZDR | Mature | Best for UK-resident stages |
| Requesty → TensorX | EU (Ireland) | Adequacy | ⚠️ "on request" (email) | ZDR configurable, not default | ❌ TensorX ~1–2 months old, SOC2 "in progress", unaudited | Cleanest EEA residency but nascent-vendor risk |
| OpenRouter → AtlasCloud | US | SCCs | ❌ OpenRouter enterprise-only; AtlasCloud unverified | AtlasCloud ZDR enterprise-only, **7-day default retention** | Soft certs (self-disclaimed), extra hop | Worst option |
| OpenRouter (self-serve) | US | SCCs | ❌ **None at self-serve** = unlawful for personal data | — | — | Not usable for real data |

### Critical DeepSeek-on-Foundry finding (verified against Microsoft's region matrix, 2026-07-08)
- Foundry **hosts DeepSeek-V4-Flash and V4-Pro** (the exact models the pipeline wants), "sold
  directly by Azure" — **Microsoft is the processor; DeepSeek the company never receives the data.**
- **BUT** these two models are only offered as **Global Standard** or **US Data Zone** — there is
  **NO UK South regional and NO EU Data Zone** deployment for DeepSeek-V4. So DeepSeek on Foundry
  is a **US transfer**, not UK/EEA residency.
- By contrast, **Azure OpenAI models (GPT-4.1, GPT-5, etc.) DO offer UK South regional + EU
  DataZone** → true UK/EEA residency, no transfer mechanism.

### Storage vs processing (important nuance)
- Azure separates **data-at-rest (storage)** from **inference (processing) location**.
- A "UK data storage policy" only controls at-rest. **Inference location is set by deployment type:**
  Global = anywhere; Data Zone = within zone (US/EU/APAC); Standard/Regional = that region.
- UK GDPR transfer rules care mostly about **processing/access location**, so UK storage alone does
  **not** avoid the US transfer for DeepSeek-V4.
- **Azure default retains prompts up to 30 days for abuse monitoring** unless you obtain the
  **Limited Access "modified abuse monitoring / zero data retention" exemption** — apply for this.

### Industry norm (peer scan: Tortus, Heidi, OneAdvanced)
- The UK clinical-AI norm is **UK/EEA residency + zero/short retention + contractual no-training +
  ISO 27001 / Cyber Essentials / DSPT / DTAC / DCB0129 clinical safety case.**
- Peers compete on privacy ("audio never leaves the UK", "zero retention"). A US transfer is
  legally defensible but **below the competitive bar** — relevant for NHS credibility later.

---

## 5. The DeepSeek decision (resolved)

- DeepSeek-V4 is needed. Foundry hosts it but **only US/Global** (see §4). Requesty→TensorX is the
  only clean EEA path but the provider is ~1–2 months old and unaudited.
- **Decision: accept a US transfer and use Foundry** for DeepSeek — mature, auto-DPA,
  DPF-certified, single already-disclosed vendor. This beats the gateway chains on every axis.
- **Recommended refinement (not yet decided):** keep **raw-data stages (cleaning/redaction) on a
  UK/EEA-resident deployment** (e.g. Foundry UK South GPT models) and only send **post-redaction
  downstream stages (drafting/tagging)** to US DeepSeek. Rationale in §6.

---

## 6. Why the pipeline stage matters (raw vs redacted)

The cleaning and redaction stages operate on **raw input by definition** — they receive the
unredacted transcript (and the audio always carries whatever the doctor spoke aloud). Only
**downstream** stages (drafting, tagging) consume already-redacted text.

Implication: "no PII reaches the model" is only true for downstream stages. Whichever provider runs
**cleaning/redaction** must be treated as processing **identifiable special-category data**. The
cleanest architecture therefore keeps cleaning/redaction UK/EEA-resident and well-contracted, and
only sends redacted work to US DeepSeek.

**Note the current product decision to DEFER redaction and run it in the US** removes this
mitigation — see §7.

### "No PII" is NOT anonymisation (verified against ICO)
- Removing identifiers from free text is **de-identification, not anonymisation** — the data
  remains personal (and special-category) due to **singling-out / jigsaw re-identification** risk.
- The **doctor is always a data subject** (account holder), so UK GDPR applies regardless of
  patient de-identification.
- "No PII" is a valuable **data-minimisation safeguard** that lowers residual risk, **not an
  exemption** from Art 28 contracts, transfer rules, DPIA, or disclosure.

---

## 7. Compliance requirements for the US-transfer path

### Transfer mechanism — pick one
- **UK-US Data Bridge (recommended, simplest):** Microsoft is **DPF-certified**. To move health
  data under the Data Bridge you must **flag it as "sensitive information"** to the importer.
  Lightens the TRA substantially.
- **OR EU SCCs + UK Addendum** (already inside the Microsoft DPA) — heavier TRA.

### The four gating artefacts
| Artefact | Who produces | Where to get it | Status |
|---|---|---|---|
| **Signed Art 28 DPA** | Vendor | Microsoft Products & Services DPA — **auto-incorporated** on Azure sign-up; **already downloaded**. File it + pull audit reports / sub-processor list / DPF cert from the **Service Trust Portal**. | ✅ downloaded; needs filing + evidence capture |
| **DPIA** (Art 35) | You (controller) | **Free ICO DPIA template** | ❌ not started |
| **TRA** (Transfer Risk Assessment) | You | **Free ICO TRA tool** | ❌ not started |
| **RoPA** (Art 30) | You | **Free ICO documentation template** | ❌ not started (largely derivable from the sub-processors work) |

### What each artefact is (one line each)
- **RoPA** = the map (what data, where it goes, retention). Descriptive inventory.
- **DPIA** = the risk assessment for high-risk processing; its **residual-risk rating** is the
  launch gate.
- **TRA** = the zoom-in on the US border crossing; lighter under the Data Bridge.

### ⚠️ The launch-gating risk (READ THIS)
- A DPIA is **mandatory before processing real personal data** (not before code ships — a
  **synthetic-data beta is fine now**; the trigger is the **first real user's data**).
- These are **internal** documents (not submitted anywhere) **EXCEPT**: (a) **ICO prior
  consultation under Art 36 is MANDATORY if the DPIA finds a "high" residual risk that cannot be
  mitigated** — an 8–14 week wait before that processing can go live; (b) DPO review; (c) NHS/DTAC
  customers will ask to see them; (d) data subjects get a DPIA summary on request (already promised
  in the privacy policy).
- **Because redaction is deferred + run in the US, the "un-redacted special-category data to the
  US" line is likely to rate HIGHER.** If it stays "high" after mitigations → **mandatory ICO
  consultation → launch delayed.**
- **The lever:** re-introducing redaction (even a UK/EEA-side step before the US hop) is the known
  mitigation that drops the rating from high → medium and removes the consultation requirement.
  Mitigations available even without redaction: Microsoft DPA + Data Bridge, encryption, no-train +
  zero-retention config, the "no PII" minimisation instruction, small initial scale. A competent
  DPIA may land at "medium" → file and launch. **This can only be known by actually completing the
  DPIA.**

### Also required
- **Art 6 lawful basis + Art 9 special-category condition** — verify the Art 9 condition holds
  (notes indicate lawful basis, not consent, for Art 6; Art 9 condition needs confirming).
- **Sector (pre-NHS, not launch-blocking):** DSPT (annual), DTAC, **DCB0129 clinical safety case**,
  Cyber Essentials (Plus) / ISO 27001.

---

## 8. Open items / next steps (prioritised)

**A. Decide & configure**
1. **Per-stage residency map** — decide which pipeline stages run US-DeepSeek vs. must stay UK/EEA.
   Recommendation: cleaning/redaction → UK/EEA (Foundry UK South GPT); downstream drafting/tagging
   → US DeepSeek. (See `apps/api/src/llm/model-variants.ts` for the stage list.)
2. **Redaction decision** — keep deferred (higher DPIA risk, possible ICO consultation) vs. re-add
   (drops risk, keeps launch clear). This is the pivotal call.
3. **Confirm transfer mechanism** — Data Bridge (flag health data sensitive) vs SCCs.
4. **Enable Azure zero-data-retention** (Limited Access abuse-monitoring exemption).
5. **Confirm no-training + zero-retention** across the whole chain so Terms §5 stays true.
6. **Add env guard** so Variant B (OpenRouter/Alibaba) cannot run in production.

**B. Produce compliance artefacts** (before first real user)
7. **DPIA** — work the residual-risk section BOTH ways (redaction deferred vs re-added) to see
   which side of "high" you land on. This answers "can we launch now?".
8. **TRA** — lighter if Data Bridge chosen.
9. **RoPA** — add Foundry + all US transfers.
10. **File the Microsoft DPA** + capture Service Trust Portal evidence.
11. **Verify Art 9 condition.**

**C. Reconcile public docs with the final config**
12. **Fix the Foundry entries** — `sub-processors.html` lists Foundry as "United Kingdom" and
    Privacy §9 says Foundry is UK South with no transfer mechanism. **If DeepSeek runs on
    Foundry-US, both are wrong** and must show a US transfer. (If GPT stages stay UK South and only
    DeepSeek is US, the row may need to reflect both, or split.)

**D. Implementation gaps (code)**
13. **Foundry integration is a Phase-3 stub** — `apps/api/src/llm/llm.service.ts` throws
    `"provider 'azure' is not enabled yet"`. Must be built.
14. **Firebase is not in the codebase** — disclosed but not implemented. Integrate before launch;
    keep notification **payloads non-clinical**; add device push-token to Privacy Policy §2 when built.

**E. Later / housekeeping**
15. Pin exact legal entities: **Oracle UK entity** (from first invoice); **Microsoft entity**
    (likely Microsoft Ireland Operations Ltd, not "Microsoft Corporation").
16. Sector artefacts: DSPT, DTAC, DCB0129, Cyber Essentials / ISO 27001.

---

## 9. Key files

| File | Relevance |
|---|---|
| `apps/landing/sub-processors.html` | Public sub-processor table (edited) |
| `apps/landing/privacy.html` | Privacy Policy §6/§8/§9 (edited) |
| `apps/landing/terms.html` | §5 no-training promise (watch, not edited) |
| `apps/landing/styles.css` | `.subprocessor-table` styling |
| `apps/api/src/llm/model-variants.ts` | Stage→model map; Variant A (OpenAI), B (DeepSeek/OpenRouter/Alibaba — dev only), C (Azure pending) |
| `apps/api/src/llm/llm.service.ts` | `azure` provider stub (Phase 3, throws) |
| `apps/api/src/email/email.service.ts` | Resend OTP sender |
| `apps/api/src/processing/stages/cleaning.stage.ts` | Cleaning stage (sees RAW data) |
| `docs/privacy/` | Home for privacy/compliance docs |

---

## 10. One-paragraph summary for a new engineer

We're adding DeepSeek to the production LLM pipeline for a UK health app that handles
special-category data. DeepSeek is only available on Azure Foundry as a **US** deployment (not
UK/EEA), so we've accepted a **US transfer** and chosen **Microsoft Foundry** (auto-DPA,
DPF-certified). The public sub-processor page and privacy policy are partly updated but the
**Foundry entries still say "UK" and must be corrected to reflect the US transfer**. The real
remaining work is the **DPIA, TRA, and RoPA** (free ICO templates) plus filing the already-downloaded
Microsoft DPA. **The critical open question:** because pre-transfer **redaction was deferred and
moved to the US**, the DPIA's residual-risk rating may come back **"high," which would force a
mandatory 8–14 week ICO consultation before launch** — re-introducing redaction is the known lever
that avoids this. Complete the DPIA first to find out which side of that line we're on. A
synthetic-data beta can launch now; real user data cannot flow until the DPIA/TRA/RoPA are done.
