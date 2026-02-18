# UK Compliance Checklist - Medical Portfolio Platform

> **Product**: Medical Training Portfolio for UK Doctors (ARCP)
> **Last Updated**: 2026-02-18
> **Review Frequency**: Quarterly or after any service/feature change

---

## External Services Used

| Service | Purpose | Data Location | DPA Required |
|---------|---------|---------------|--------------|
| Linode Servers | Application hosting | London, UK | Yes |
| Linode Object Storage (S3) | Temporary audio storage | London, UK | Yes |
| AssemblyAI | Audio transcription + PII redaction | Dublin, EU | Yes |
| OpenAI | Transcript cleaning + PDF generation | US (with DPA) | Yes |

---

## 1. Data Processing Agreements (DPAs)

### Required Actions

- [ ] **Linode DPA** - Sign Data Processing Addendum
  - URL: https://www.linode.com/legal-dpa/
  - Covers: Server hosting, S3 storage
  - Ensure UK/EU data residency clause included

- [ ] **AssemblyAI DPA** - Sign Data Processing Addendum
  - URL: https://www.assemblyai.com/legal/data-processing-addendum
  - Covers: Audio processing, transcription
  - Enable EU data residency in dashboard (Dublin)

- [ ] **OpenAI DPA** - Sign Data Processing Addendum
  - URL: https://openai.com/policies/data-processing-addendum
  - Covers: Transcript processing, PDF generation
  - Request zero data retention (ZDR) if available

### Verification

- [ ] Store signed copies of all DPAs in secure location
- [ ] Calendar reminder set for annual DPA review
- [ ] Document subprocessors used by each service

---

## 2. UK GDPR Compliance

### Lawful Basis for Processing

- [ ] **Documented lawful basis**: Legitimate interests / Contract performance
- [ ] **Record of Processing Activities (ROPA)** maintained
- [ ] Lawful basis documented for each data type:

| Data Type | Lawful Basis | Justification |
|-----------|--------------|---------------|
| Doctor account data | Contract | Required for service delivery |
| Audio recordings | Legitimate interests | Temporary processing for transcription |
| Transcripts (PII-redacted) | Legitimate interests | Professional development records |
| Clinical case notes | Legitimate interests | ARCP portfolio requirements |

### Data Subject Rights

Ensure systems support:

- [ ] **Right of Access** - Doctor can export all their data
- [ ] **Right to Rectification** - Doctor can edit/correct entries
- [ ] **Right to Erasure** - Doctor can delete account and all data
- [ ] **Right to Data Portability** - Export in machine-readable format (JSON/PDF)
- [ ] **Right to Object** - Mechanism to opt-out of processing
- [ ] **Automated Decision-Making** - AI suggestions are reviewable, not final

### Implementation Checklist

- [ ] Data subject access request (DSAR) process documented
- [ ] Response within 30 days guaranteed
- [ ] Identity verification process for DSARs
- [ ] Deletion cascades to all services (Linode, AssemblyAI, OpenAI)

---

## 3. Data Protection Act 2018 - Special Category Data

Medical data is "special category data" under Article 9.

### Required Safeguards

- [ ] **Explicit consent** obtained OR processing necessary for health purposes
- [ ] Consent mechanism records:
  - What was consented to
  - When consent was given
  - How consent was given
  - Ability to withdraw consent

- [ ] **Health professional exemption** documented if applicable
  - Doctor is processing their own professional records
  - Not patient medical records (these are doctor's reflections)

### Technical Safeguards

- [ ] Encryption at rest (AES-256 minimum)
- [ ] Encryption in transit (TLS 1.2+ minimum)
- [ ] Access controls (role-based)
- [ ] Audit logging enabled
- [ ] Regular security testing

---

## 4. Data Minimisation & Storage Limitation

### Audio File Handling

| Stage | Retention | Action Required |
|-------|-----------|-----------------|
| Upload to Linode S3 | Maximum 24 hours | Auto-delete after transcription |
| AssemblyAI processing | 0 hours (immediate delete) | Verify in AssemblyAI settings |
| Failed transcription | Maximum 72 hours | Retry then delete |

### Implementation

- [ ] **S3 Lifecycle Policy** configured for auto-deletion
  ```
  Rule: Delete objects older than 24 hours
  Prefix: audio/*
  ```

- [ ] **Post-transcription deletion** in code
  ```typescript
  // After successful transcription
  await s3.deleteObject({ Bucket, Key });
  ```

- [ ] **AssemblyAI data deletion** verified
  - Check: Settings → Data Retention → "Delete audio after processing"

- [ ] **Orphaned file cleanup** - Weekly job to remove unprocessed files

### Transcript Storage

- [ ] Only PII-redacted transcripts stored in database
- [ ] Raw transcripts (if any) deleted after cleaning stage
- [ ] No patient-identifiable information in final storage

---

## 5. PII Redaction Configuration

### AssemblyAI PII Policies

Ensure the following policies are enabled:

```typescript
redact_pii: true,
redact_pii_policies: [
  'person_name',           // Patient and other names
  'date_of_birth',         // DOBs
  'phone_number',          // Contact numbers
  'email_address',         // Email addresses
  'location',              // Addresses, hospital names
  'medical_record_number', // NHS numbers
  'drivers_license',       // ID documents
  'credit_card_number',    // Financial data
  'banking_information',   // Bank details
  'organization',          // Trust names if identifying
]
```

### Verification Checklist

- [ ] PII redaction enabled in AssemblyAI API calls
- [ ] Test transcription with sample PII to verify redaction
- [ ] Redacted format confirmed: `[PERSON_NAME]`, `[DATE_OF_BIRTH]`, etc.
- [ ] Audio redaction (`redact_pii_audio: true`) enabled if storing audio
- [ ] Regular spot-checks of transcripts for PII leakage

### OpenAI Safeguards

- [ ] System prompts instruct model NOT to include any identifying information
- [ ] Output validation checks for PII patterns before storage
- [ ] Consider regex post-processing for NHS number patterns: `\d{3}\s?\d{3}\s?\d{4}`

---

## 6. International Data Transfers

### Transfer Mechanisms

| Transfer | Mechanism | Status |
|----------|-----------|--------|
| UK → Linode (UK) | No transfer (domestic) | N/A |
| UK → AssemblyAI (EU/Dublin) | UK Adequacy Decision | Valid |
| UK → OpenAI (US) | Standard Contractual Clauses (SCCs) | Required |

### Required Actions

- [ ] **AssemblyAI**: Verify EU data residency enabled (Dublin)
- [ ] **OpenAI**: Confirm SCCs included in DPA
- [ ] Document all international transfers in ROPA
- [ ] Review UK adequacy decisions annually (may change post-Brexit)

### Transfer Impact Assessment (TIA)

For US transfers (OpenAI):

- [ ] TIA conducted and documented
- [ ] Supplementary measures identified:
  - Data sent is already PII-redacted
  - Minimal data exposure (transcript text only)
  - No patient-identifiable information transferred

---

## 7. Security Measures

### Technical Controls

| Control | Requirement | Implementation |
|---------|-------------|----------------|
| Encryption at rest | AES-256 | MongoDB encryption, S3 encryption |
| Encryption in transit | TLS 1.2+ | HTTPS only, verify certificates |
| Authentication | Strong passwords | Bcrypt hashing, complexity rules |
| Session management | Secure tokens | JWT with expiry, httpOnly cookies |
| Access logging | Audit trail | Log all data access events |
| Rate limiting | Prevent abuse | API rate limits configured |

### Verification

- [ ] SSL/TLS certificate valid and auto-renewing
- [ ] HSTS header enabled
- [ ] Security headers configured (CSP, X-Frame-Options, etc.)
- [ ] Dependencies regularly updated (npm audit)
- [ ] No secrets in code repository
- [ ] Environment variables for all credentials

### Penetration Testing

- [ ] Annual penetration test by CREST-accredited provider
- [ ] Vulnerability scan after major releases
- [ ] Findings remediated within:
  - Critical: 24 hours
  - High: 7 days
  - Medium: 30 days
  - Low: 90 days

---

## 8. Data Protection Impact Assessment (DPIA)

A DPIA is **required** because:
- Processing special category data (health-related)
- Using new technologies (AI/ML)
- Systematic processing of personal data

### DPIA Checklist

- [ ] DPIA conducted before go-live
- [ ] DPIA document includes:
  - [ ] Description of processing operations
  - [ ] Purpose and lawful basis
  - [ ] Necessity and proportionality assessment
  - [ ] Risk assessment to individuals
  - [ ] Measures to mitigate risks
- [ ] DPIA reviewed after significant changes
- [ ] ICO consultation if high residual risk (unlikely if PII redacted)

### DPIA Review Triggers

Conduct new DPIA review if:
- [ ] New external service added
- [ ] New category of data processed
- [ ] Processing expanded to new user groups
- [ ] Significant security incident occurs

---

## 9. Privacy Policy & Transparency

### Privacy Policy Must Include

- [ ] Identity and contact details of data controller
- [ ] Purpose of processing
- [ ] Lawful basis for processing
- [ ] Categories of personal data
- [ ] Recipients of data (Linode, AssemblyAI, OpenAI)
- [ ] International transfers and safeguards
- [ ] Retention periods
- [ ] Data subject rights
- [ ] Right to complain to ICO
- [ ] Automated decision-making explanation

### User-Facing Documentation

- [ ] Privacy Policy accessible from registration page
- [ ] Privacy Policy accessible from app settings
- [ ] Terms of Service include data processing terms
- [ ] Cookie policy (if applicable)
- [ ] Clear explanation of AI processing

---

## 10. Incident Response

### Data Breach Procedure

| Timeframe | Action |
|-----------|--------|
| Immediately | Contain breach, preserve evidence |
| Within 24 hours | Internal assessment and escalation |
| Within 72 hours | Notify ICO if required (high risk to individuals) |
| Without undue delay | Notify affected individuals if high risk |

### Breach Response Checklist

- [ ] Incident response plan documented
- [ ] Breach register maintained
- [ ] ICO notification template prepared
- [ ] User notification template prepared
- [ ] Contact details for:
  - [ ] Linode security team
  - [ ] AssemblyAI security team
  - [ ] OpenAI security team
- [ ] Post-incident review process defined

### ICO Notification Criteria

Notify ICO if breach likely to result in risk to individuals.
**For this product**: If PII redaction fails and patient data is exposed, notify ICO.

ICO breach reporting: https://ico.org.uk/make-a-complaint/data-protection-complaints/data-protection-complaints/

---

## 11. Staff & Access Controls

### Access Management

- [ ] Principle of least privilege implemented
- [ ] Admin access limited to essential personnel
- [ ] Access reviews conducted quarterly
- [ ] Offboarding process removes all access immediately
- [ ] Multi-factor authentication (MFA) for admin access

### Training

- [ ] Data protection training for all staff with data access
- [ ] Training records maintained
- [ ] Annual refresher training
- [ ] Specific training on handling medical data

---

## 12. Vendor Management

### Ongoing Monitoring

| Vendor | Review Frequency | Check |
|--------|------------------|-------|
| Linode | Annually | Security certifications, DPA validity |
| AssemblyAI | Annually | SOC 2 report, DPA validity, data residency |
| OpenAI | Annually | Security practices, DPA validity, policy changes |

### Vendor Review Checklist

- [ ] Verify current security certifications (SOC 2, ISO 27001)
- [ ] Review any policy/terms changes
- [ ] Confirm data processing locations unchanged
- [ ] Check for security incidents reported
- [ ] Update subprocessor list if changed

---

## 13. Record Keeping

### Required Documentation

Maintain the following records:

- [ ] **Record of Processing Activities (ROPA)**
- [ ] **Data Protection Impact Assessment (DPIA)**
- [ ] **Signed DPAs** with all vendors
- [ ] **Privacy Policy** (version history)
- [ ] **Consent records** (if applicable)
- [ ] **Data breach register**
- [ ] **DSAR log** (requests and responses)
- [ ] **Training records**
- [ ] **Security audit reports**

### Retention of Compliance Records

| Document | Retention Period |
|----------|------------------|
| DPAs | Duration of contract + 6 years |
| DPIA | Duration of processing + 6 years |
| Breach records | 6 years minimum |
| DSAR records | 6 years |
| Consent records | Duration of consent + 6 years |
| Training records | Duration of employment + 6 years |

---

## 14. Certification Summary

### Current Vendor Certifications

| Vendor | SOC 2 | ISO 27001 | GDPR | Other |
|--------|-------|-----------|------|-------|
| Linode | Type 2 | Yes | Yes | PCI-DSS |
| AssemblyAI | Type 2 | Yes | Yes | PCI-DSS 4.0, HIPAA BAA |
| OpenAI | Type 2 | Yes | Yes | - |

### Your Organisation

- [ ] Consider ISO 27001 certification if scaling
- [ ] Consider Cyber Essentials certification (UK government standard)
- [ ] NHS Data Security and Protection Toolkit (if NHS integration planned)

---

## Quick Reference: Key Contacts

| Purpose | Contact |
|---------|---------|
| ICO (UK Data Protection Authority) | https://ico.org.uk / 0303 123 1113 |
| ICO Breach Reporting | https://ico.org.uk/make-a-complaint/ |
| Linode Support | https://www.linode.com/support/ |
| AssemblyAI Support | support@assemblyai.com |
| OpenAI Support | https://help.openai.com |

---

## Compliance Sign-Off

| Review Date | Reviewer | Status | Notes |
|-------------|----------|--------|-------|
| YYYY-MM-DD | Name | Pending/Complete | Initial review |
| | | | |
| | | | |

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-02-18 | Initial checklist created | - |
| | | |
