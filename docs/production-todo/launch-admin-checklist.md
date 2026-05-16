# Launch Admin Checklist

Non-technical administrative, legal, operational, and business tasks required before public launch. Engineering/feature work is intentionally excluded — see `docs/production-todo/launch-audit/findings.md` for that.

Source docs cross-referenced:
- `compliance-checklist.md`
- `docs/gtm-launch-plan.md`
- `docs/production-readiness-review.md`
- `docs/production-todo/launch-audit/findings.md`
- `docs/production-todo/compliance-implementation-plan.md`
- `docs/production-todo/admin-checklist.md`

Legend: `[ ]` pending · `[~]` partial / unclear · `[x]` done

---

## 1. Legal & Compliance (LAUNCH-BLOCKING)

### 1.1 Data Processing Agreements (DPAs) with sub-processors

All DPAs in this list are **auto-incorporated** into the vendor's Terms of Service / Master Agreement that we accepted at signup — none of them require a manual signature. The work here is *archiving dated copies and documenting provenance*, not signing.

- [x] **Linode (Akamai) Customer DPA** — auto-incorporated via Akamai MPA accepted at signup. PDF archived in `compliance/dpas/`. *(Partner DPA at `partner-data-protection-agreement.pdf` is the wrong document — that's for channel resellers, not customers.)*
- [x] **AssemblyAI DPA** — auto-incorporated via ToS, "deemed signed" per the DPA itself + EU SCCs. PDF captured via browser print and archived. Production code switched to EU endpoint (`api.eu.assemblyai.com`) so audio stays in the EU under adequacy.
- [x] **MongoDB Atlas DPA** — auto-incorporated via Cloud Terms of Service for self-serve customers (confirmed by MongoDB Privacy Hub §2.1). PDF captured and archived. Cluster region: AWS `eu-west-1` (Ireland), covered by UK→EEA adequacy.
- [~] **OpenAI DPA** — auto-incorporated via Services Agreement (effective 2026-01-01). PDF archived. **Half-complete:** the DPA itself is in place, but the **ZDR amendment + UK data residency request** is deferred pending one of the documented trigger criteria (NHS sales, 1000+ users, institutional funding, ICO inquiry, redaction-bypass feature). Today the API runs on the default US-region Project under UK IDTA + EU SCCs — legally adequate, but not the strongest posture. A low-effort probe email to `sales@openai.com` is optional.
- [x] PDFs archived in `compliance/dpas/` with provenance notes in `compliance/dpas/README.md`
- **Why:** UK GDPR Art. 28 mandates DPAs for any processor handling personal/health data — but signature is not the mechanism for any of our vendors; incorporation-by-reference via ToS is.
- **Source:** `compliance-checklist.md` §1
- **Status:** **Mostly complete.** Three of four vendors fully done. OpenAI DPA itself is done; ZDR + UK residency upgrade deferred with documented trigger criteria.

### 1.2 Write and host a Privacy Policy
- [ ] Draft covering data collected, lawful basis, sub-processors, retention, user rights, PII redaction approach, DPO/contact
- [ ] Host publicly (e.g. `yourapp.com/privacy`)
- [ ] Replace mobile placeholder `Alert.alert('Privacy Policy', 'will be available soon')` with link/WebView
- [ ] Link from App Store + Play Store listings
- [ ] Version the document so acknowledgements can reference exact bytes shown
- **Why:** App stores reject submissions without a live privacy policy; UK GDPR Art. 13–14 require disclosure.
- **Source:** `docs/production-readiness-review.md` (Critical #4); `docs/gtm-launch-plan.md` Phase 0 #1
- **Status:** Pending

### 1.3 Write and host Terms of Service
- [ ] Draft covering acceptable use, AI-content disclaimer, user responsibility to review drafts, RCGP alignment, liability limits
- [ ] Host alongside privacy policy
- [ ] Link from app + store listings
- **Why:** App Store requirement; defines liability boundary for AI-generated portfolio content.
- **Source:** `docs/gtm-launch-plan.md` Phase 0 #2; `docs/production-readiness-review.md` (Low #23)
- **Status:** Pending

### 1.4 Register with the ICO as a data controller
- [x] Submitted application at ico.org.uk on 2026-05-12 (Tier 1, £52, Software Development, admin@logdit.app)
- [ ] Pay annual fee — payment confirmation pending
- [ ] Archive registration certificate + reference number to `compliance/ico-registration.pdf`
- [ ] Add ICO reference number to `compliance/company_details.md` and to the Privacy Policy footer (1.2)
- [ ] Set calendar reminder for renewal: 2027-04-12 (one month before anniversary)
- **Why:** Mandatory for any UK business processing personal data. Non-registration fine up to £4,000 and aggravates any downstream enforcement action.
- **Source:** `docs/gtm-launch-plan.md` Phase 0 #5; `docs/production-todo/compliance-implementation-plan.md` Phase 1.1
- **Status:** **Submitted — awaiting confirmation.** Online registrations are usually confirmed within a few working days.

### 1.5 Complete a Data Protection Impact Assessment (DPIA)
- [ ] Use ICO DPIA template
- [ ] Document data flow (audio → AssemblyAI → OpenAI → MongoDB)
- [ ] Document lawful basis, risk assessment, mitigations
- [ ] Store as `compliance/dpia_v1.md`
- **Why:** UK GDPR Art. 35 makes a DPIA mandatory when processing special-category health data with AI.
- **Source:** `compliance-checklist.md` §8; `docs/gtm-launch-plan.md` Phase 0 #7
- **Status:** Pending

### 1.6 Maintain a Record of Processing Activities (ROPA)
- [ ] Fill ICO ROPA Excel template
- [ ] Cover signup, transcription, AI analysis, storage, deletion activities
- [ ] Include retention periods, transfer mechanisms, sub-processors
- [ ] Version control
- **Why:** UK GDPR Art. 30 requires this; regulators and auditors demand it.
- **Source:** `compliance-checklist.md` §2; `docs/production-todo/compliance-implementation-plan.md` Phase 2.2
- **Status:** Pending

### 1.7 Document an Incident Response / Breach Notification Plan
- [ ] Create `compliance/runbooks/breach.md`
- [ ] Containment steps, internal escalation tree
- [ ] 72-hour ICO notification template
- [ ] User-notification template for high-risk breaches
- [ ] Walk through procedure once before launch
- **Why:** GDPR sets a 72-hour ICO notification clock for breaches.
- **Source:** `compliance-checklist.md` §10; `docs/production-todo/launch-audit/findings.md` (High #18)
- **Status:** Pending

### 1.8 UK Limited Company registration
- [x] Filed at Companies House — **approved 2026-05-12**, company number received
- [ ] Archive Certificate of Incorporation as `compliance/companies_house_certificate.pdf`
- [ ] Record company number, registered office, and incorporation date in `compliance/company_details.md`
- **Why:** Limits personal liability for special-category data processing; expected by ICO, app stores, insurers.
- **Source:** `docs/production-todo/compliance-implementation-plan.md` Phase 1.2
- **Status:** **Incorporated.** Remaining: archive the certificate PDF and record the company details file. Unblocks ICO registration (1.4), insurance quotes (1.9), and Apple/Google Developer enrollments (2.1/2.2) being filed under the Ltd rather than personal.

### 1.9 Purchase cyber liability / professional indemnity insurance
- [ ] Quote from Hiscox
- [ ] Quote from Markel
- [ ] Quote from Superscript
- [ ] Purchase policy (target £1M cover, ~£300–600/yr)
- **Why:** Medical data + AI exposure. Covers breach legal costs and harm claims.
- **Source:** `docs/production-todo/compliance-implementation-plan.md` Phase 1.6 / 4.5
- **Status:** Pending

---

## 2. App Store / Marketplace Setup (LAUNCH-BLOCKING)

### 2.1 Create Apple Developer account
- [ ] Enroll at developer.apple.com ($99/yr)
- [ ] Complete identity verification
- [ ] Set up tax + banking forms (W-8BEN-E if non-US)
- [ ] Register under Ltd company, not personal Apple ID
- **Why:** Required for App Store submission; identity check can take days.
- **Source:** `docs/production-todo/admin-checklist.md`
- **Status:** Pending

### 2.2 Create Google Play Developer account
- [ ] Register at play.google.com/console ($25 one-time)
- [ ] Complete identity + tax + banking setup
- **Why:** Required for Play Store submission.
- **Source:** `docs/production-todo/admin-checklist.md`
- **Status:** Pending

### 2.3 Prepare store listing assets
- [ ] 4–5 screenshots (voice input, structured entry, coverage dashboard, etc.)
- [ ] Description (lead with time-saved value prop)
- [ ] Keywords (GP portfolio, ARCP, medical reflection, clinical logbook)
- [ ] Category (Medical or Productivity)
- [ ] Age rating
- [ ] Apple App Privacy "nutrition label" questionnaire
- [ ] Google Data Safety form
- **Why:** All mandatory submission inputs.
- **Source:** `docs/gtm-launch-plan.md` Phase 2 #1
- **Status:** Pending

### 2.4 Record demo video (60s)
- [ ] Record voice-note → structured entry → coverage dashboard flow
- [ ] Export MP4
- [ ] Upload to app store listings + landing page + social
- **Why:** Drives both app-store conversion and Reddit/social launch traction.
- **Source:** `docs/gtm-launch-plan.md` Phase 2; `docs/production-todo/admin-checklist.md`
- **Status:** Pending

---

## 3. Business Operations & Vendor Setup

### 3.1 Register domain
- [x] Registered `logdit.app`
- [x] DNS configured (Google Workspace MX records active per 3.2)
- **Why:** Needed for privacy policy hosting, landing page, support email, store contact URL.
- **Source:** `docs/production-todo/admin-checklist.md`
- **Status:** **Done.**

### 3.2 Real support email + monitored inbox
- [x] Google Workspace provisioned on `logdit.app` (mailbox substrate)
- [x] `support@logdit.app` mailbox created
- [ ] Forward to monitored inbox / define monitoring owner
- [x] Replaced `support@example.com` placeholder in app ([apps/mobile/app/(profile-settings)/privacy-support.tsx:66](../../apps/mobile/app/(profile-settings)/privacy-support.tsx#L66))
- [ ] Define 24h response SLA
- **Why:** App currently links to placeholder email; required for user trust + app-store policies.
- **Source:** `docs/production-readiness-review.md` (High #9); `docs/gtm-launch-plan.md` Phase 0 #10
- **Status:** **Mailbox live + in-app placeholder swapped.** Remaining: define monitoring owner and 24h response SLA.

### 3.3 Provision transactional email service (admin side)
- [ ] Sign up (Resend / SendGrid / SES)
- [ ] Verify sender domain (SPF, DKIM, DMARC)
- [ ] Obtain API key + hand off to engineering
- **Why:** OTP login depends on deliverable email. Backend code exists; account does not.
- **Source:** `docs/production-todo/admin-checklist.md`; `docs/production-todo/launch-audit/findings.md` (Critical #13)
- **Status:** Pending (admin side)

### 3.4 Build a simple landing page
- [ ] Hero with demo video
- [ ] 3 value props
- [ ] App Store + Play Store download buttons
- [ ] Privacy / RCGP compliance badges
- [ ] Beta user quotes
- [ ] Footer link to privacy policy + ToS
- **Why:** Hosts privacy/ToS, gives organic traffic a destination, holds store badges.
- **Source:** `docs/gtm-launch-plan.md` Phase 2 #4
- **Status:** Pending

---

## 4. Customer Support & Launch Readiness

### 4.1 Define customer-support process
- [ ] Decide channel (email vs. Intercom/Zendesk)
- [ ] Set 24h response SLA
- [ ] Draft canned responses for login, billing, deletion requests
- **Why:** Medical users expect fast, credible responses.
- **Source:** `docs/production-todo/admin-checklist.md`
- **Status:** Pending

### 4.2 Recruit closed beta cohort (15–20 GP trainees)
- [ ] Personal network outreach
- [ ] r/DoctorsUK DMs
- [ ] GP trainee Facebook / WhatsApp groups
- [ ] Offer 6 months free Pro in exchange for feedback + launch-day advocacy
- [ ] Set up private feedback channel (WhatsApp / Discord)
- [ ] Gate launch: 10+ users with 3+ entries each, >60% completion, zero critical bugs
- **Why:** Validates PMF and surfaces UX issues; gates public launch per GTM plan.
- **Source:** `docs/gtm-launch-plan.md` Phase 1 #1
- **Status:** Pending

### 4.3 Competitor / regulatory monitoring cadence
- [ ] Monthly: FourteenFish, Learner+/CMEfy, RCGP AI policy
- [ ] Quarterly: ICO edtech code, UK AI healthcare regulation
- [ ] Log findings in `compliance/monitoring-log.md`
- **Why:** RCGP, FourteenFish, ICO changes can force product/strategy shifts.
- **Source:** `docs/production-todo/admin-checklist.md` "Monitoring"
- **Status:** Pending

---

## 5. Billing / Payments (Pre-monetisation Admin)

### 5.1 Provision payment infrastructure
- [ ] Choose model: Apple IAP + Google IAP (mandatory on mobile) and/or Stripe (web)
- [ ] Consider RevenueCat to abstract IAP complexity
- [ ] Apple paid-apps contract + banking + tax forms
- [ ] Google Play merchant + banking + tax forms
- [ ] UK VAT considerations (and EU OSS if selling EU)
- [ ] Refund / cancellation policy page (Consumer Rights Act 14-day cooling-off)
- **Why:** Cannot collect revenue without merchant accounts; pricing set at £7.99/mo or £59.99/yr Pro.
- **Source:** `docs/gtm-launch-plan.md` Pricing
- **Status:** Pending (does not block free launch; blocks monetisation)

---

## 6. Likely Missing Admin Tasks (not explicitly in repo docs)

These are not currently tracked in source docs but should be considered before launch.

### 6.1 Tax & banking forms for stores
- [ ] Apple tax interview (W-8BEN-E if non-US) + banking
- [ ] Google Play tax + banking
- **Why:** Required before listing paid apps; often slow.

### 6.2 Store-specific privacy disclosures
- [ ] Apple App Privacy "nutrition label"
- [ ] Google Data Safety form
- **Why:** Separate from privacy policy; structured questionnaires mandatory at submission.

### 6.3 MHRA medical-device classification check
- [ ] Document in writing that the product is **not** a medical device under UK MDR 2002
- [ ] Keep reasoning on file as a defensible position
- **Why:** Portfolio/reflection tooling can get caught by MDR if it makes diagnostic suggestions.

### 6.4 GMC / RCGP positioning statement
- [ ] Short written stance on alignment with GMC confidentiality + RCGP AI-in-portfolio policy
- **Why:** Reduces sales friction with VTS programmes and educator queries.

### 6.5 Trademark
- [ ] UK trademark search for product name + logo
- [ ] (Optional) File registration (~£170 per class)
- **Why:** Avoid rebranding pain after press/Reddit launch.

### 6.6 Refund / cancellation policy page
- [ ] Draft and host
- **Why:** UK Consumer Rights Act 14-day digital-content cooling-off; Apple/Google policy.

### 6.7 Cookie / analytics policy (if landing page uses GA/PostHog)
- [ ] Cookie banner
- [ ] Disclosure page (PECR)
- **Why:** UK PECR rules on cookies and similar technologies.

### 6.8 DPO appointment decision
- [ ] Either appoint a DPO, or document on file why one is not required
- **Why:** Special-category processing may trigger DPO obligation under UK GDPR Art. 37.

### 6.9 Beta-tester consent form
- [ ] Written permission to quote feedback, capture screen recordings
- **Why:** Use beta quotes in marketing without IP/privacy risk.

### 6.10 Domain email / Workspace
- [ ] Google Workspace or Microsoft 365 for `support@`, `legal@`, `dpo@`
- **Why:** Credible mailboxes; needed on ICO + DPA contact records.

### 6.11 Business banking + accounting
- [ ] Business bank account
- [ ] Accounting software (Xero / FreeAgent)
- [ ] Track UK VAT threshold (£90k)
- **Why:** Required for paid apps; clean books for tax + due diligence.

### 6.12 Press kit
- [ ] Logo files, screenshots, founder bio
- [ ] One-line / short / long descriptions
- **Why:** For journalists, partners, podcast guests.

### 6.13 Founder personal-data check
- [ ] Decide what seller name + address appears on App Store listing
- [ ] Use registered office (not home) if preferable
- **Why:** App Store seller info is public.

---

## Suggested Timeline (from GTM plan)

| Week | Focus |
|------|-------|
| 1 | ICO registration, Ltd company confirmation, start DPA signing, insurance quotes |
| 2 | Privacy Policy, ToS, DPIA, ROPA, Incident Response Plan |
| 2–3 | Apple + Google Developer accounts, domain, transactional email, store assets, demo video |
| 3 | Engineering closes consent flow, data export, sub-processor deletion, PII expiry cron, placeholder replacements |
| 4 | End-to-end compliance + deletion test; legal sanity check on Privacy Policy; OTP delivery test |
| 5 | Closed beta — recruit, run, gather feedback |
| 6–7 | App Store + Play Store submission; landing page live |
| 8 | Public launch — Reddit, VTS networks |

---

## Summary

| Bucket | Items | Status |
|--------|-------|--------|
| Legal & Compliance | 9 | 1.1 done; 1.4 submitted (awaiting confirmation); 1.8 incorporated (cert/details file pending); rest pending |
| App Store Setup | 4 | All pending |
| Business Ops | 4 | 3.1 done; 3.2 mailbox + placeholder swap done (monitoring owner + SLA pending); 3.3/3.4 pending |
| Support & Launch Readiness | 3 | All pending |
| Billing / Payments | 1 | Pending (post-MVP) |
| Likely Missing | 13 | To be triaged |

**~15 items block public launch.** Realistic timeline: 6–8 weeks if compliance work starts immediately and beta recruitment begins in parallel.
