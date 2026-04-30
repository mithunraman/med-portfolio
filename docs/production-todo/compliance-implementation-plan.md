# Compliance Implementation Plan — UK GDPR / DPA 2018

**Status:** Draft, pending execution
**Owner:** Solo founder
**Target:** Defensible compliance posture for launch without paid legal review at pre-revenue stage
**Scope:** Closes [findings.md](launch-audit/findings.md) rows 1, 2, 3, 8, and 18 (parts of), plus [pre-launch-fixes.md](pre-launch-fixes.md) privacy-policy placeholder

> **Important.** This plan implements a DIY compliance pack using free ICO templates because retaining a solicitor or fractional DPO is out of budget at this stage. It is designed to make the product **defensible**, not to provide legal certainty. Engage a UK privacy solicitor when (a) a B2B contract with a Trust / Deanery is on the table, (b) ICO contacts the company, or (c) external funding due-diligence begins. Until then, follow this plan and keep the audit pack current.

---

## Key Decisions (Decision Record)

These decisions resolve compliance ambiguity in [findings.md](launch-audit/findings.md) row 3 and supersede any earlier framing that leaned on individual user consent for required processing.

### Decision 1 — Lawful basis is NOT individual consent

| Layer | Basis | Reference |
|---|---|---|
| Article 6 | **6(1)(b) contract** — necessary to deliver the portfolio service | UK GDPR Art. 6(1)(b) |
| Article 9 | **9(2)(h) + DPA 2018 Sch.1 Pt.1 §2(2)(f)** — *"management of health care systems and services"* | UK GDPR Art. 9(2)(h); DPA 2018 |

**Why not consent:** UK GDPR Art. 4(11) requires consent to be "freely given." Audio transcription and AI analysis are mandatory for the product to function; making them mandatory while claiming consent invalidates the consent. §2(2)(f) explicitly contemplates infrastructure for managing the medical training system — a textbook fit for trainee portfolios and the basis NHS ePortfolio / Horus / Kaizen rely on.

**Trade-off this closes:** with consent, withdrawal mid-flight strands processing; with §2(2)(f), withdrawal isn't applicable, and the user's right is exercised through Art. 17 erasure (already built — see [account-cleanup.service.ts](../../apps/api/src/account-cleanup/account-cleanup.service.ts)).

### Decision 2 — Sub-processors disclosed by category in UI, by name on a dedicated page

UK GDPR Art. 13(1)(e) explicitly allows "categories of recipients." User-facing screens use category language (*"AI transcription providers," "AI analysis providers"*); a public `/sub-processors` page lists actual vendors (AssemblyAI, OpenAI, Linode) with countries + safeguards. Vendor swaps require a notice + 30-day in-app banner, **not** re-consent.

### Decision 3 — Guest accounts use the same basis with a 30-day TTL

Guest data is auto-purged at 30 days of inactivity. Same Art. 6(1)(b) + 9(2)(h) §2(2)(f) basis applies. Mini-notice shown at "Continue as guest." On upgrade, a fresh acknowledgement record is appended (never backdated, never overwritten).

### Decision 4 — UX is "notice + acknowledgements," not "consent toggles"

Granular consent toggles are reserved for genuinely optional processing (marketing emails, analytics) — not for required service functionality. The signup screen is a transparency notice with role/duty acknowledgements, not a consent gate.

### Decision 5 — DIY using ICO templates, defer paid legal review

Triggers for engaging a solicitor (none of which are pre-launch):
- First B2B contract negotiation with a Trust / Deanery
- ICO investigation or formal complaint
- External funding due-diligence

Until then: ICO Small Business Helpline (free phone), GMC Confidentiality Helpline (free phone), and ICO templates are the primary advisory channels.

---

## Execution Plan

### Phase 1 — Foundation (Week 1)

| # | Task | Cost | Output |
|---|---|---|---|
| 1.1 | Register company as a data controller with the ICO (annual fee) | £40 | ICO registration certificate (PDF) |
| 1.2 | Confirm Ltd company incorporation (limits personal liability for processing special category data) | £12 if not already done | Companies House confirmation |
| 1.3 | Run the ICO Lawful Basis Interactive Tool, document the output as a one-page memo confirming Decision 1 | £0 | `compliance/lawful_basis_memo_v1.md` |
| 1.4 | Phone the ICO Small Business Helpline and walk through the §2(2)(f) framing for a UK trainee portfolio; capture their response | £0 | Notes appended to lawful basis memo |
| 1.5 | Phone the GMC Confidentiality Helpline regarding patient-identifier handling in reflective practice | £0 | Notes captured |
| 1.6 | Quote for cyber / professional indemnity insurance covering £1M (Hiscox, Markel, Superscript) | £300–600/yr | Policy purchased before launch |

**Exit criterion:** ICO registration live, Ltd company verified, lawful basis memo committed, insurance quote selected.

### Phase 2 — Documentation (Week 2)

All artefacts go in a new repo folder: `compliance/`.

| # | Task | Source | Time |
|---|---|---|---|
| 2.1 | Fill in the **ICO Appropriate Policy Document template** for the §2(2)(f) basis (DPA Sch.1 Pt.4 requirement) | ICO website | 1h |
| 2.2 | Fill in the **ICO ROPA Excel template** — controller details, processing activities, recipients, retention, transfers | ICO website | 2h |
| 2.3 | Run the **ICO DPIA template** for the audio + AI pipeline (high-risk processing of special category data — DPIA mandatory) | ICO website | half-day |
| 2.4 | Generate the public privacy notice with the **ICO Privacy Notice Generator**, then edit to match the structure agreed in this conversation. Version it `v1.0` | ICO website | 2h |
| 2.5 | Write a public sub-processor list page (markdown) modelled on Linear's or Notion's published format. Include AssemblyAI, OpenAI, Linode — each with country, role, transfer mechanism (SCCs / IDTAs) | Public examples | 30m |
| 2.6 | Sign vendor DPAs as customer: AssemblyAI, OpenAI, Linode (all publish standard DPAs at `<vendor>.com/legal/dpa`). Store signed PDFs | Vendor sites | 1h |
| 2.7 | Draft incident response runbook (`compliance/runbooks/breach.md`) — 72-hour clock, ICO notification template, internal escalation. Closes [findings.md](launch-audit/findings.md) row 18 | ICO breach notification template | 1h |
| 2.8 | Draft SAR response runbook (`compliance/runbooks/sar.md`) — Art. 15 export procedure + response letters | ICO SAR templates | 1h |

**Exit criterion:** all documents committed under `compliance/`, versioned, dated.

### Phase 3 — Build (Week 3)

References to existing code below assume current branch state.

| # | Task | Files | Effort |
|---|---|---|---|
| 3.1 | Add `Acknowledgement` schema + repository (append-only audit log of role + duty acknowledgements). See [Schema](#schema-acknowledgement) below. | `apps/api/src/acknowledgements/` (new module) | 0.5d |
| 3.2 | Replace any prior "consent toggle" UI with the **notice + acknowledgements** signup screen (Decision 4). Two checkboxes only: "I am a UK doctor in training" + "I will anonymise patient identifiers per GMC guidance" | `apps/mobile/src/app/(auth)/...` | 1d |
| 3.3 | Build the public `/sub-processors` page in [apps/web](../../apps/web) and link from privacy notice + footer | `apps/web/src/pages/sub-processors.tsx` | 0.5d |
| 3.4 | Replace `Alert.alert('Privacy Policy', ...)` placeholder with `WebView` pointing to the hosted privacy notice. Closes [findings.md](launch-audit/findings.md) row 10 | `apps/mobile/src/...` (locate placeholder) | 0.5d |
| 3.5 | Build `GET /api/users/me/export` (Art. 15 SAR endpoint) — returns user's full data as JSON. Closes [findings.md](launch-audit/findings.md) row 2 | `apps/api/src/users/` | 1d |
| 3.6 | Guest mode: persistent `guestId` in SecureStore, `Acknowledgement` written on guest start with `expiresAt = +30d`, banner shown in app shell, scheduled job purges expired guests | `apps/mobile/src/...` + `apps/api/src/account-cleanup/` | 1d |
| 3.7 | Guest → real account upgrade flow: append new `Acknowledgement` record, link via `upgradedFromGuestId`, offer "migrate data" vs "start fresh" | `apps/mobile/src/app/(auth)/upgrade.tsx` (new) | 1d |
| 3.8 | Sub-processor deletion at account-cleanup: persist `assemblyAiTranscriptId` on messages, call AssemblyAI `DELETE /v2/transcript/:id` during cleanup. Closes [findings.md](launch-audit/findings.md) row 7 remaining gap | `apps/api/src/account-cleanup/account-cleanup.service.ts`, message schema | 0.5d |
| 3.9 | 7-day content expiry cron — nullify `rawContent` + `cleanedContent` on messages > 7d. Closes [findings.md](launch-audit/findings.md) row 6 | `apps/api/src/processing/` (or new cron module) | 0.5d |
| 3.10 | Redaction-efficacy instrumentation: counter metric for redaction events + entity types, weekly sampling job, alert threshold. Closes [findings.md](launch-audit/findings.md) row 17 | `apps/api/src/processing/stages/redaction.stage.ts` + new audit cron | 1d |

**Exit criterion:** all rows above merged, integration tests passing, `compliance/` audit pack regenerable on demand.

### Phase 4 — Sanity Check (Week 4)

| # | Task | Cost |
|---|---|---|
| 4.1 | One-month LawDepot or RocketLawyer subscription. Run privacy notice + ToS through their template review + use one "ask a lawyer" Q&A credit on the §2(2)(f) framing. **Cancel after the month.** | ~£25 |
| 4.2 | Post anonymised privacy notice draft to r/UKLaw / r/LawUK / IAPP community for peer review | £0 |
| 4.3 | Walk a friendly trainee doctor through the signup flow + privacy notice. Capture confusion points; iterate copy | £0 |
| 4.4 | Generate the audit pack zip from `compliance/` folder; verify completeness against the [Audit Pack Checklist](#audit-pack-checklist) | £0 |
| 4.5 | Purchase cyber insurance policy selected in 1.6 | £300–600/yr |

**Exit criterion:** audit pack frozen as `compliance/audit_pack_v1.0_<date>.zip`, insurance active, launch-ready.

---

## Schemas & Code Artefacts

### Schema: `Acknowledgement`

Append-only collection. Every signup, guest start, upgrade, or notice-version change writes a new row — never updates an existing one.

```ts
{
  _id: ObjectId,
  xid: string,                          // 21-char nanoid
  userId?: string,                      // present once user has account
  guestId?: string,                     // present during guest mode
  noticeVersion: string,                // e.g. 'v1.0' or 'v1.0-guest'
  noticeHash: string,                   // sha256 of exact bytes shown
  acknowledgements: {
    id: 'role_uk_trainee'
      | 'patient_anon_duty'
      | 'gmc_duty'
      | 'guest_terms',
    given: boolean,
  }[],
  ipAddress: string,
  userAgent: string,
  recordedAt: Date,
  expiresAt?: Date,                     // 30d for guests
  upgradedFromGuestId?: string,         // upgrade audit link
}
```

**Why append-only:** an ICO inquiry asks "what did this user agree to and when." A mutable record can't answer that across copy changes; an append-only log can.

### Privacy notice versioning

- Stored as markdown in `compliance/privacy_notice/v1.0.md`, `v1.1.md`, etc.
- Hosted on the marketing site at `/privacy` (current version) and `/privacy/v1.0` (frozen versions).
- `noticeHash` in the `Acknowledgement` record references the exact bytes served. Bytes never change once published.

### Sub-processor change procedure

1. Update `compliance/sub_processors.md` (new version, dated).
2. Deploy updated `/sub-processors` web page.
3. Push in-app banner + send email to all users **30 days before** the change goes live.
4. Update ROPA + DPIA in `compliance/`.
5. No re-acknowledgement required (category-level disclosure stands).

---

## Audit Pack Checklist

Final folder structure committed to repo (or stored in private S3 bucket if size warrants):

```
compliance/
├── ico_registration.pdf
├── companies_house_certificate.pdf
├── lawful_basis_memo_v1.md
├── appropriate_policy_document_v1.md      ← DPA Sch.1 Pt.4 mandatory
├── ropa_v1.xlsx                           ← Art. 30 mandatory
├── dpia_audio_ai_v1.md                    ← Art. 35 mandatory for this pipeline
├── privacy_notice/
│   ├── v1.0.md
│   └── (future versions)
├── sub_processors.md
├── dpas/
│   ├── assemblyai_dpa_signed.pdf
│   ├── openai_dpa_signed.pdf
│   └── linode_dpa_signed.pdf
├── runbooks/
│   ├── breach.md                          ← 72hr ICO notification
│   └── sar.md                             ← Art. 15 response procedure
├── insurance_policy.pdf
└── audit_pack_v1.0_YYYY-MM-DD.zip         ← regenerable snapshot
```

`Acknowledgement` audit data lives in MongoDB and can be exported to CSV on demand — not committed to the repo.

---

## What This Plan Deliberately Defers

These items are out of scope for pre-launch and will be addressed when triggers fire:

| Deferred item | Trigger to address |
|---|---|
| Bespoke DPA template for B2B customers | First Trust / Deanery contract enquiry |
| Solicitor-reviewed privacy notice | Funding due-diligence or first formal complaint |
| Fractional DPO retainer | Revenue justifies ~£200–500/mo, or B2B customers require a named DPO |
| Detailed legitimate-interests assessments for analytics | When analytics tooling is added (currently none) |
| Children's data handling | Out of scope — service is for qualified UK trainee doctors, all 18+ |

---

## Risk Calibration

The realistic worst case at this stage is **not a fine** — it's an ICO enforcement notice telling the company to stop processing until issues are fixed. Mitigations:

- ICO's published SME enforcement posture is "support over sanction" for first-time good-faith errors.
- Headline ICO fines target large platforms with millions of subjects, not solo founders with documented compliance attempts.
- The audit pack above is the evidence of "reasonable steps" the ICO weighs as a mitigating factor.
- Cyber insurance (Phase 1.6, Phase 4.5) covers legal cost of responding to investigations.

The plan sequences items so the **highest-risk surface ships last**: text-only reflections + acknowledgements first, audio + AI analysis when the redaction efficacy instrumentation (3.10) is in place.

---

## Cross-References

- [findings.md](launch-audit/findings.md) — closes rows 2, 3, 6, 7, 8, 10, 17, 18 (in part)
- [pre-launch-fixes.md](pre-launch-fixes.md) — closes privacy-policy placeholder
- [redaction.stage.ts](../../apps/api/src/processing/stages/redaction.stage.ts) — referenced by 3.10
- [account-cleanup.service.ts](../../apps/api/src/account-cleanup/account-cleanup.service.ts) — extended by 3.8

---

## Status Tracking

Update this section as phases complete. Mark each row Done / In Progress / Blocked with a date.

| Phase | Status | Date | Notes |
|---|---|---|---|
| 1. Foundation | Not started | — | |
| 2. Documentation | Not started | — | |
| 3. Build | Not started | — | |
| 4. Sanity check | Not started | — | |
