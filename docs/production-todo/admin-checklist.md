# Non-Technical Admin Checklist for Production Launch

Consolidated from: `gtm-launch-plan.md`, `strategic-market-scan.md`, `security-assessment.md`, `production-readiness-review.md`

**Last updated:** 2026-04-06

---

## Legal & Compliance (Blocks App Store + ICO)

- [ ] **Write and host Privacy Policy** — must cover: data collected, lawful basis (consent), sub-processors (OpenAI, AssemblyAI, cloud host), data residency, retention periods, user rights (access, deletion, portability, withdrawal), PII redaction approach, DPO/contact details. Required for both App Store and GDPR.
  - *Source: gtm-launch-plan.md Phase 0 item #1*

- [ ] **Write and host Terms of Service** — must cover: acceptable use, AI-generated content disclaimer, user responsibility for review, RCGP guidance alignment, limitation of liability.
  - *Source: gtm-launch-plan.md Phase 0 item #2, production-readiness-review.md item #23*

- [ ] **Register with ICO** — £52/year for small organisations. Mandatory for any UK business processing personal data. Online form at ico.org.uk.
  - *Source: gtm-launch-plan.md Phase 0 item #5*

- [ ] **Sign Data Processing Agreements (DPAs) with sub-processors** — OpenAI (available on their website), AssemblyAI (request from legal team), cloud/hosting provider (standard).
  - *Source: gtm-launch-plan.md Phase 0 item #6*

- [ ] **Complete a Data Protection Impact Assessment (DPIA)** — required when processing health-adjacent data. Document: data flows, risks, mitigations, lawful basis. Use ICO template.
  - *Source: gtm-launch-plan.md Phase 0 item #7*

- [ ] **Audit data residency** — document where data is stored and processed (MongoDB region, S3 region, OpenAI processing location, AssemblyAI processing location). If US processing, ensure Standard Contractual Clauses are in place via DPAs.
  - *Source: gtm-launch-plan.md Phase 0 item #9*

- [ ] **Define and document PII retention policy** — `rawContent` and `cleanedContent` fields store unredacted text. GDPR Article 5(1)(e) requires storage limitation. Decide retention window (e.g. 7 days) and document in privacy policy.
  - *Source: gtm-launch-plan.md risk #11*

---

## App Store Submission

- [ ] **Create Apple Developer account** — $99/year. Required for App Store submission.

- [ ] **Create Google Play Developer account** — $25 one-time. Required for Play Store submission.

- [ ] **Prepare App Store listing** — screenshots (voice input, structured entry, coverage dashboard), description (lead with time saved), keywords (GP portfolio, ARCP, medical reflection, clinical logbook), category selection.
  - *Source: gtm-launch-plan.md Phase 2 item #1*

- [ ] **Prepare Google Play listing** — similar assets plus data safety section declaration.
  - *Source: gtm-launch-plan.md Phase 2 item #3*

- [ ] **Privacy policy URL** — must be live and linked in both app store listings before submission.

- [ ] **App Tracking Transparency declaration** — if any analytics are used, declare in App Store Connect.

---

## Business & Accounts

- [ ] **Set up a real support email** — replace `support@example.com` placeholder. Consider a dedicated domain email (e.g. support@portfoliopulse.com).
  - *Source: production-readiness-review.md item #9, gtm-launch-plan.md Phase 0 item #10*

- [ ] **Set up transactional email service account** — Resend, SendGrid, or AWS SES. Required for OTP delivery. Verify sender domain (SPF, DKIM, DMARC).

- [ ] **Domain and hosting** — production API hosting, domain for landing page, domain for privacy policy/ToS hosting.

- [ ] **Set up error tracking / monitoring account** — Sentry (or equivalent) for backend + mobile crash reporting. (Engineering will integrate, but the account needs to exist.)

- [ ] **Decide on pricing implementation** — free tier (3 entries/month, text only) vs Pro (£7.99/month or £59.99/year). Set up payment provider (Stripe, RevenueCat for mobile IAP, or Apple/Google in-app purchases).
  - *Source: gtm-launch-plan.md Pricing section*

---

## Pre-Launch Community & Marketing

- [ ] **Build landing page** — hero with demo video, 3 value props, download links, privacy/RCGP compliance badges, beta user quotes.
  - *Source: gtm-launch-plan.md Phase 2 item #4*

- [ ] **Start Reddit community presence** — be helpful in r/DoctorsUK portfolio/ARCP threads for 2-3 weeks before launch. Share tips, not product links.
  - *Source: gtm-launch-plan.md Phase 2 item #5*

- [ ] **Recruit 15-20 GP trainees for closed beta** — personal network, Reddit DMs, GP trainee Facebook groups. Offer free Pro access for 6 months.
  - *Source: gtm-launch-plan.md Phase 1 item #1*

- [ ] **Set up beta feedback channel** — private WhatsApp group or Discord.
  - *Source: gtm-launch-plan.md Phase 1 item #2*

- [ ] **Prepare demo video** — 60-second screen recording: voice note to structured entry to coverage dashboard.
  - *Source: gtm-launch-plan.md Phase 3*

- [ ] **Brief beta advocates** — ask 5-8 beta users to post honest reviews on launch day and share in their VTS groups.
  - *Source: gtm-launch-plan.md Phase 2 item #6*

- [ ] **Prepare messaging materials** — key messages for each audience (time-poor trainee, ARCP-anxious, sceptical, privacy-conscious). Never say "writes your portfolio for you."
  - *Source: gtm-launch-plan.md Messaging section*

---

## Competitor & Regulatory Monitoring

- [ ] **Set up monitoring cadence** for:
  - FourteenFish product updates / AI features (monthly)
  - Learner+ (CMEfy) scaling / funding (monthly)
  - RCGP AI policy changes (monthly)
  - ICO edtech code of practice (quarterly)
  - UK AI healthcare regulation (quarterly)
  - *Source: strategic-market-scan.md Monitoring Plan*

---

## Launch Day Prep

- [ ] **Draft Reddit launch post** — honest founder story, demo video, free tier, ask for feedback. Not a sales pitch.
  - *Source: gtm-launch-plan.md Phase 3*

- [ ] **Plan launch day response capacity** — respond to every Reddit comment, app review, email, and social mention within 24 hours.
  - *Source: gtm-launch-plan.md Phase 3*

- [ ] **Prepare week-1 metrics dashboard** — downloads, signups, activation (first entry), errors, app store rating.
  - *Source: gtm-launch-plan.md Success Metrics*

---

## Summary

| Category | Items | Blocks launch? |
|----------|-------|---------------|
| Legal & Compliance | 7 | Yes — App Store + ICO |
| App Store Submission | 6 | Yes |
| Business & Accounts | 5 | Yes (email, hosting, payments) |
| Community & Marketing | 7 | No, but strongly recommended |
| Monitoring | 1 | No |
| Launch Day | 3 | No |
| **Total** | **29** | |
