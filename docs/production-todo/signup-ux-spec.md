# Signup UX Spec — Notice + Acknowledgements (simplified for MVP)

Single-screen signup flow for LOGDit's MVP. Operationalises the lawful-basis decision in [compliance-implementation-plan.md](compliance-implementation-plan.md) Decision 1 (Art. 9(2)(h) + DPA Sch.1 Pt.1 §2(2)(f)).

**Cross-references:**
- Lawful basis: [compliance-implementation-plan.md](compliance-implementation-plan.md) Decision 1
- Privacy policy §5: [apps/landing/privacy.html](../../apps/landing/privacy.html)
- DPIA §2: [docs/privacy/DPIA_CoreReflectionPipeline_2026-05-17.md](../../docs/privacy/DPIA_CoreReflectionPipeline_2026-05-17.md)

---

## 1. Principles

1. **Lawful basis is Art. 9(2)(h) + §2(2)(f), not consent.** Use *acknowledge*, *confirm*, *agree* — never "consent" in UI copy for core processing.
2. **Two acknowledgements, both load-bearing.**
   - Eligibility — establishes the user is a UK doctor in training (required to apply §2(2)(h) correctly).
   - GMC anonymisation duty — shifts professional responsibility to the doctor and stacks evidence of "reasonable steps" under Art. 5(2) accountability.
3. **Clickwrap on the CTA**, not a separate "I have read the policy" tick.
4. **AI processing is mandatory and disclosed.** Surfaced in one sentence on-screen; full details in the linked policy.
5. **Single screen.** No multi-step legal flow. Specialty/stage selection happens after.

---

## 2. Screen sequence

```
welcome.tsx
   │
   ▼
login.tsx              ← email entry + OTP / magic link
   │
   ▼
notice-and-ack.tsx     ← THIS SPEC
   │
   ▼
select-specialty.tsx
   │
   ▼
select-stage.tsx
   │
   ▼
(tabs)/dashboard
```

Notice screen comes **after** email verification (so the acknowledgement row attaches to a real `userId`) and **before** specialty selection (so the legal moment is crisp).

No guest flow in MVP.

---

## 3. Screen design (`notice-and-ack.tsx`)

**Path:** `apps/mobile/app/(auth)/notice-and-ack.tsx`

### 3.1 Layout

```
┌───────────────────────────────────────────────┐
│  Before you start                             │
│                                               │
│  Logdit helps UK trainee doctors turn         │
│  clinical experiences into portfolio entries. │
│  Your reflections are transcribed and         │
│  analysed by AI to help draft each entry.     │
│                                               │
│  Read the [Privacy Policy ↗] and              │
│  [Terms of Service ↗] for full details.       │
│                                               │
│  ☐ I am a UK doctor in training               │
│                                               │
│  ☐ I will anonymise patient identifiers in    │
│    my reflections, in line with GMC guidance. │
│                                               │
│  [ Create account ]   ← enabled when both ✓   │
│                                               │
│  By tapping Create account you agree to       │
│  the Privacy Policy and Terms of Service.     │
└───────────────────────────────────────────────┘
```

### 3.2 Copy (v1.0)

Copy is served by the backend at `GET /api/acknowledgements/notice` (see §4.1). The mobile screen renders directly from the response — copy does **not** live in mobile locales, to avoid drift between what the server's v1.0 says and what the client renders.

| Field on `NoticeDocument` | String |
|---|---|
| `title` | "Before you start" |
| `body` | "Logdit helps UK trainee doctors turn clinical experiences into portfolio entries. Your reflections are transcribed and analysed by AI to help draft each entry." |
| `privacyPolicyUrl` | "https://logdit.app/privacy" |
| `termsUrl` | "https://logdit.app/terms" |
| `ctaLabel` | "Create account" |
| `ctaDisclaimer` | "By tapping Create account you agree to the Privacy Policy and Terms of Service." |
| `acknowledgements[0].label` | "I am a UK doctor in training" |
| `acknowledgements[1].label` | "I will anonymise patient identifiers in my reflections, in line with GMC guidance." |

`version` on this document: `"v1.0"`. The version string is what's stored on the server-side acceptance row; **no byte-pinning / hash** in MVP — git history of the frozen `notices/v1.0.ts` file is the de-facto content record (see §4.1).

### 3.3 Checkboxes

Two checkboxes, both mandatory. CTA disabled until both are ticked.

| ID (schema) | Label (UI) | Why it's there |
|---|---|---|
| `role_uk_trainee` | "I am a UK doctor in training" | Establishes the data subject is within scope of Art. 9(2)(h) + DPA §2(2)(f). Load-bearing for applying the lawful basis correctly. |
| `patient_anon_duty` | "I will anonymise patient identifiers in my reflections, in line with GMC guidance." | Shifts the GMC professional-secrecy duty explicitly onto the doctor. Strengthens the controller's "reasonable steps" narrative for ICO accountability. Reinforces the Art. 9(3) chain. Defensive evidence in GMC complaint and civil claim scenarios. |

**Behavioural reinforcement:** the `patient_anon_duty` acknowledgement at signup is the *evidentiary* artefact; the in-entry reflection template should also prompt anonymisation at the point of action (separate spec — reflection-entry UX). Signup creates the record; in-entry reduces actual breaches.

### 3.4 Behaviour

| Trigger | Action |
|---|---|
| Screen entered | Fetch `GET /api/acknowledgements/notice`. Show loading state until response. Cache `version` for use in POST. |
| Screen entered with no prior acknowledgement row for this `userId` | Render screen from notice response. CTA disabled. Both checkboxes default unchecked. |
| User checks both boxes | CTA enabled. |
| User unchecks either box | CTA re-disabled. |
| User taps "Privacy Policy" or "Terms of Service" link | Open in in-app WebView (or external browser — TBD). Return to same screen with checkbox state preserved. |
| User taps Create account | POST `/api/acknowledgements` with `{ noticeVersion: "v1.0", acknowledgements: [{ id: "role_uk_trainee", given: true }, { id: "patient_anon_duty", given: true }] }`. On success navigate to `select-specialty.tsx`. |
| API request fails | Inline error: "Couldn't save your acknowledgement. Please check your connection and try again." Retry button. Do not navigate forward. Do not consider the user onboarded. |
| User backgrounds the app before tapping Create account | No row written. On next launch, `userId` exists but no `Acknowledgement` row → route back to this screen. App is gated until acknowledgement persists. |

### 3.5 Server validation

- `noticeVersion` must match a `version` in `NOTICE_REGISTRY.all` (see §4.1). Mismatch = 400 (likely stale client).
- The set of required acknowledgement IDs comes from `NOTICE_REGISTRY.all.find(v => v.version === body.noticeVersion).acknowledgements` — all must be present with `given: true`; missing or `given: false` = 400.
- `userId` derived from JWT; client cannot supply.
- `ipAddress` and `userAgent` captured from request, not body.

---

## 4. Backend

### 4.1 Notice config (catalog)

The notice catalog lives as TypeScript config in the backend, not a database collection. Deploys = activations; counsel review = PR review. Each version's document is in its own file, frozen the day it goes active. A small registry switchboard picks which document is current.

**File layout:**

```
apps/api/src/acknowledgements/
├── notices/
│   ├── v1.0.ts          ← document. Frozen on activation; never edited again.
│   └── v1.1.ts          ← added when v1.1 ships.
├── registry.ts          ← switchboard. Tiny.
└── types.ts             ← NoticeDocument, AcknowledgementId.
```

**`notices/v1.0.ts`** — the document:

```ts
import type { NoticeDocument } from '../types';

export const NOTICE_V1_0: NoticeDocument = {
  version: 'v1.0',
  title: 'Before you start',
  body: 'Logdit helps UK trainee doctors turn clinical experiences into portfolio entries. Your reflections are transcribed and analysed by AI to help draft each entry.',
  privacyPolicyUrl: 'https://logdit.app/privacy',
  termsUrl: 'https://logdit.app/terms',
  ctaLabel: 'Create account',
  ctaDisclaimer: 'By tapping Create account you agree to the Privacy Policy and Terms of Service.',
  acknowledgements: [
    { id: 'role_uk_trainee', label: 'I am a UK doctor in training', required: true },
    { id: 'patient_anon_duty', label: 'I will anonymise patient identifiers in my reflections, in line with GMC guidance.', required: true },
  ],
} as const;
```

**`registry.ts`** — the switchboard:

```ts
import { NOTICE_V1_0 } from './notices/v1.0';

export const NOTICE_REGISTRY = {
  active: NOTICE_V1_0,
  all: [NOTICE_V1_0],   // used to validate POSTs that reference older versions
} as const;
```

**Invariant:** exactly one document is marked active at a time. Asserted at module init — bad merges fail at boot, not in production.

**API endpoint:**

| Verb | Path | Returns |
|---|---|---|
| `GET` | `/api/acknowledgements/notice` | `NOTICE_REGISTRY.active` — the document the client should render. |

Authed (requires JWT). The notice screen sits after login, so no public surface is needed.

**Why separate document from registry:**

- A document file is frozen on activation. Editing it is a code-review violation, not a typo someone might accidentally make. Git history of `notices/v1.0.ts` *is* the byte-record of what users saw.
- Shipping v1.1 is a new file + a 3-line registry diff. Reviewers diff one whole document (clear) and one switch flip (clear), not two near-duplicates inside a giant array.
- ICO inquiry path is trivial: acceptance row says `v1.0`, `git show <activation-commit>:notices/v1.0.ts` yields the exact bytes.
- i18n later drops in as `notices/v1.0/en-GB.ts`, `notices/v1.0/cy-GB.ts` without restructuring.

### 4.2 Acceptance log (schema)

Append-only. No update path.

```ts
{
  _id: ObjectId,
  xid: string,                          // 21-char nanoid
  userId: string,                       // required
  noticeVersion: string,                // e.g. 'v1.0' — must match NOTICE_REGISTRY.all
  acknowledgements: {
    id: 'role_uk_trainee' | 'patient_anon_duty',
    given: boolean,
  }[],
  ipAddress: string,
  userAgent: string,
  recordedAt: Date,
}
```

**Why append-only:** an ICO inquiry asks "what did this user agree to and when." A mutable record cannot answer that across copy changes. Append-only can.

**Why a version string only (no hash):** for MVP scale and ICO's SME enforcement posture, a `noticeVersion: "v1.0"` pointing at a frozen file under §4.1 is sufficient. The frozen-file discipline gives content-addressing-like properties via git history without code computing or storing hashes. Byte-pinning is hardening that can be added later if a B2B contract or audit requires it.

**Why an array of `{id, given}` instead of separate boolean columns:** the schema is forward-compatible — new acknowledgement IDs can be added without a migration. Reading code asks "was `patient_anon_duty` given for this row?" by predicate rather than column presence.

---

## 5. Notice-version changes

When the privacy policy changes materially (new sub-processor, new processing purpose, longer retention), ship a new document file under `notices/` (e.g. `v1.1.ts`) and flip `NOTICE_REGISTRY.active` to it (see §4.1). The old document file stays — never edited, never deleted — so the acceptance log can always reference its bytes.

### 5.1 Re-acknowledgement — deferred for MVP

The previous version of this spec mandated forced re-acknowledgement on next app launch after a version bump. For MVP this is deferred:

- Version bump → new users see new version on signup.
- Existing users continue without interruption.
- A material change is announced via in-app banner + email.

Re-acknowledgement becomes worth implementing if a material change adds *new* mandatory processing the existing user didn't sign up for. Until then, the lawful basis (Art. 9(2)(h)) does not depend on user consent, so re-acknowledgement isn't required for the basis to remain valid.

If you do hit that case post-launch, the design hooks are:
- Backend: existing schema accepts new `noticeVersion` rows for the same user.
- Client: foreground hook calls `GET /api/acknowledgements/me/latest`; if `latestVersion < server.currentVersion`, route to a re-ack screen.

None of that ships in v1.

---

## 6. What's NOT in this spec

Explicit list, with reasoning, to prevent scope creep:

| Item | Why deferred |
|---|---|
| Frozen `noticeHash` of exact bytes on the acceptance row | Audit hygiene, not legal floor. Frozen `notices/v1.x.ts` files already give a content-record via git history (see §4.1). Add later if B2B procurement requires it. |
| First-recording inline audio notice | Art. 13(3) recommends "just-in-time" notices for high-risk processing; signup notice already discloses AI/audio, so this is incremental defence-in-depth, not a launch requirement. |
| Re-acknowledgement on version change | See §5.1. Not needed at MVP under §2(2)(h) basis. |
| Guest mode notice | Guest mode itself is deferred from MVP. |
| Optional opt-in toggles (marketing, analytics) | Lives in Settings, not signup. Not in v1. |
| CI byte-match check of rendered notice vs frozen markdown | Audit hygiene; not legal floor. |
| Welsh-medium / multi-language | Out of scope for v1. |
| `gmc_duty` and `guest_terms` enum values from prior spec | `gmc_duty` was never used; `guest_terms` belonged to the deferred guest flow. |

---

## 7. Acceptance criteria

- [ ] User cannot reach `(tabs)` without an `Acknowledgement` row for their `userId`.
- [ ] CTA is disabled until both checkboxes are ticked.
- [ ] Privacy Policy and Terms links open in-app WebView (or external browser).
- [ ] POST `/api/acknowledgements` is idempotent — retries do not create duplicate rows for the same `userId` + `noticeVersion`.
- [ ] On API failure, user stays on the screen with a retry option; no forward navigation.
- [ ] Backgrounding the app mid-flow does not write a partial row.
- [ ] The phrase "consent" does not appear in any copy on this screen.
- [ ] Accessibility: each checkbox label is readable as a single screen-reader unit with its associated checkbox; WCAG AA on contrast and font scaling.

---

## 8. Estimate

| Task | Effort |
|---|---|
| Notice config: types, `notices/v1.0.ts`, registry, init invariant, `GET /notice` | 0.25d |
| Acknowledgement schema + repository + POST endpoint (append-only) | 0.5d |
| Notice screen UI + WebView links (renders from API response, no locale strings) | 0.5d |
| Wire mobile client to fetch notice + POST `/api/acknowledgements` | 0.25d |
| Gate `(tabs)` on presence of acknowledgement row | 0.25d |
| QA iOS + Android, including screen-reader pass | 0.25d |
| **Total** | **~2d** |

Frontend + backend together. Estimate assumes no prior backend scaffolding for the acknowledgements module; if Phase 3.1 from the compliance plan is already merged, subtract ~0.5d.

---

## 9. Summary of what changed from the previous (v0) spec

| Previous spec (v0) | This spec (v1) | Why |
|---|---|---|
| Lawful basis ambiguous; some prose implied consent | Lawful basis is Art. 9(2)(h) + §2(2)(f); explicitly not consent | Decision finalised in compliance plan + privacy policy + DPIA |
| Frozen `noticeHash` + byte-pinned versioning + CI byte-match | `noticeVersion` string only | Audit hygiene, not legal floor; can layer in later |
| First-recording inline audio notice (§5 of old spec) | Removed | Signup notice already covers AI/audio; defer |
| Re-acknowledgement on notice-version change (§6 of old spec) | Deferred to post-MVP | Not needed under §2(2)(h) basis |
| Guest flow (§2.2, §4 of old spec) | Removed | Guest mode itself deferred from MVP |
| Multi-paragraph "How your data is handled / responsibilities / rights" prose on the screen | Single sentence + link to policy | Art. 13 disclosure satisfied by linked policy; less UI noise |
| 4 acknowledgement IDs in the enum (`role_uk_trainee`, `patient_anon_duty`, `gmc_duty`, `guest_terms`) | 2 (`role_uk_trainee`, `patient_anon_duty`) | Matches actual UI; deferred items removed from enum |
| ~2.25d estimate | ~1.75d estimate | Less surface, but kept the second checkbox for defensive value |
