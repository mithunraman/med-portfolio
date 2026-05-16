# Signup UX Spec — Notice + Acknowledgements

Implementation spec for the mobile signup/onboarding UX required by the compliance lawful-basis decisions. This document is the design layer that sits on top of [compliance-implementation-plan.md](compliance-implementation-plan.md); it does not re-derive the legal reasoning — it operationalises it.

**Cross-references:**
- Lawful basis: [compliance-implementation-plan.md](compliance-implementation-plan.md) Decision 1 — Art. 6(1)(b) + Art. 9(2)(h) / DPA 2018 Sch.1 §2(2)(f)
- UX paradigm: same doc, Decision 4 — "notice + acknowledgements, not consent toggles"
- Guest mode: same doc, Decision 3 — 30-day TTL
- Data model: same doc, "Schema: `Acknowledgement`"
- Backend task: same doc, Phase 3.1 (schema + repo) and Phase 3.2 (UI)

---

## 1. Principles

1. **Never use the word "consent"** in copy or component names. Lawful basis is contract + §2(2)(f), not Art. 9(2)(a). Use *acknowledge*, *understand*, *confirm*.
2. **Mandatory acknowledgements only for things required by the lawful basis** — role + duty. Everything else either belongs in the notice prose (transparency) or in a separate optional opt-in screen (genuinely optional processing).
3. **No granular toggles for required processing.** A toggle implies a real "no" — for AI transcription/analysis there isn't one (the product is the AI). Toggles are reserved for marketing emails, analytics, beta enrolment.
4. **Append-only audit trail.** Every shown notice records an `Acknowledgement` row with `noticeHash`. Copy changes ship as new versions; existing records remain pinned to the bytes the user originally saw.
5. **Plain English, not legalese.** Art. 13 requires the key facts be surfaced in the UI in concise, intelligible form. The full notice lives at `/privacy`; the screen renders a short transparency summary.

---

## 2. Screen sequence

### 2.1 New account flow

```
welcome.tsx
   │
   ▼
login.tsx              ← email entry + magic-link / OTP
   │
   ▼
notice-and-ack.tsx     ← NEW (this spec)
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

The notice screen comes **after** email verification and **before** specialty selection. Reasons:
- Email verification first means the `Acknowledgement` row can be tied to a real `userId` rather than an anonymous session.
- Specialty/stage selection is product configuration, not legal — placing it after the notice keeps the legal moment crisp.

### 2.2 Guest flow

```
welcome.tsx
   │
   ▼  [ Continue as guest ]
   │
guest-notice.tsx       ← NEW (this spec)
   │
   ▼
select-specialty.tsx
   │
   ▼
select-stage.tsx
   │
   ▼
(tabs)/dashboard       ← guest banner shown in app shell
```

### 2.3 Guest → real account upgrade

```
(tabs)/* + "Create account" CTA
   │
   ▼
login.tsx              ← email entry
   │
   ▼
notice-and-ack.tsx     ← same screen as new flow
   │
   ▼
upgrade-choice.tsx     ← migrate guest data vs start fresh
   │
   ▼
(tabs)/dashboard
```

A fresh `Acknowledgement` row is appended on upgrade with `upgradedFromGuestId` populated. Never backdate, never overwrite.

---

## 3. Notice & Acknowledgement screen (`notice-and-ack.tsx`)

**Path:** `apps/mobile/app/(auth)/notice-and-ack.tsx`

### 3.1 Layout

```
┌─────────────────────────────────────────┐
│  Before you start using Logdit          │   ← H1
├─────────────────────────────────────────┤
│                                         │
│  How your data is handled               │   ← H2
│  • bullet                               │
│  • bullet                               │
│  • bullet                               │
│                                         │
│  Your responsibilities as a doctor      │   ← H2
│  • bullet                               │
│  • bullet                               │
│                                         │
│  Your rights                            │   ← H2
│  • bullet                               │
│  • bullet                               │
│                                         │
│  [Read the full privacy notice ↗]       │   ← link, opens WebView
│  [Read the terms of service     ↗]      │   ← link, opens WebView
│  [See our sub-processors        ↗]      │   ← link, opens WebView
│                                         │
├─────────────────────────────────────────┤
│  ☐ I am a UK doctor in training         │   ← role_uk_trainee
│                                         │
│  ☐ I will anonymise patient             │   ← patient_anon_duty
│    identifiers in my reflections,       │
│    in line with GMC guidance.           │
│                                         │
│  [ Continue ]                           │   ← disabled until both checked
└─────────────────────────────────────────┘
```

### 3.2 Copy (v1.0)

> **Before you start using Logdit**
>
> Logdit helps UK trainee doctors turn clinical experiences into structured portfolio entries.
>
> **How your data is handled**
> - Your reflections — including any voice notes — are transcribed by AssemblyAI (EU) and analysed by OpenAI (Ireland) to help draft your entry.
> - Identifying patient details are automatically removed before AI analysis.
> - Your data is stored encrypted on servers in the UK and Ireland. We never sell your data and never use it to train AI models.
>
> **Your responsibilities as a doctor**
> - You must anonymise patient identifiers in your reflections, in line with GMC confidentiality guidance.
> - You remain responsible for reviewing AI-generated drafts before saving them to your portfolio.
>
> **Your rights**
> - You can export or delete all your data at any time from Settings.
> - You can email us at admin@logdit.app for any data-protection question.
>
> [Read the full privacy notice ↗] [Read the terms of service ↗] [See our sub-processors ↗]

Frozen copy is stored at `compliance/privacy_notice/screen_notice_v1.0.md`. The hash of that file's exact bytes is the `noticeHash` written to each `Acknowledgement` row.

### 3.3 Checkbox labels

Two checkboxes only, exactly as per Phase 3.2 of the implementation plan:

| ID (matches schema) | Label (rendered) |
|---|---|
| `role_uk_trainee` | "I am a UK doctor in training" |
| `patient_anon_duty` | "I will anonymise patient identifiers in my reflections, in line with GMC guidance." |

Both are mandatory. `[ Continue ]` button stays disabled until both are checked. **No third "I have read the privacy policy" checkbox** — that would imply consent semantics and conflict with Decision 4. The links to the policy/ToS/sub-processors above the checkboxes provide the discoverability that Art. 13 requires; the user is not asked to claim they read them.

### 3.4 Behaviour

| Trigger | Action |
|---|---|
| User checks both boxes and taps Continue | POST `/api/acknowledgements` with `{ noticeVersion: 'v1.0', noticeHash: '<sha256>', acknowledgements: [{id:'role_uk_trainee',given:true},{id:'patient_anon_duty',given:true}] }`. Then navigate to `select-specialty.tsx`. |
| User unchecks a box | Continue button re-disables. |
| API request fails | Inline error: *"Couldn't save your acknowledgement. Please check your connection and try again."* Retry button. Do not navigate forward until the row is persisted. |
| User taps a link (privacy/ToS/sub-processors) | Open in WebView; on close, return to the same screen with state preserved. |
| User backs out / closes app before Continue | No row written. On next launch, route back to this screen — `userId` exists but no `Acknowledgement` row → block entry. |

### 3.5 Validation rules (server)

- Endpoint accepts `noticeVersion` only if it matches a frozen version on disk.
- Endpoint accepts `noticeHash` only if it matches the canonical hash for that version. Mismatch = 400 + log (could indicate a client-side tamper or a stale build).
- `userId` is derived from the JWT; client cannot supply it.
- `ipAddress` and `userAgent` are captured from the request, not the body.

---

## 4. Guest notice screen (`guest-notice.tsx`)

**Path:** `apps/mobile/app/(auth)/guest-notice.tsx`

### 4.1 Layout

Same structure as `notice-and-ack.tsx`, with three differences:
1. Title: *"Try Logdit as a guest"*
2. Added paragraph in "How your data is handled":
   > Guest data is automatically deleted after **30 days of inactivity**. You can convert to a full account from Settings at any time to keep your entries.
3. Third checkbox added for guest-specific term:

| ID | Label |
|---|---|
| `role_uk_trainee` | "I am a UK doctor in training" |
| `patient_anon_duty` | "I will anonymise patient identifiers in my reflections, in line with GMC guidance." |
| `guest_terms` | "I understand that guest data is automatically deleted after 30 days of inactivity." |

### 4.2 Behaviour

- `Acknowledgement` row written with `guestId` (no `userId`), `noticeVersion: 'v1.0-guest'`, and `expiresAt = recordedAt + 30 days`.
- Banner persists in app shell: *"Guest mode — your data will be deleted after 30 days of inactivity. [Create account]"*

---

## 5. First-recording audio notice

The user is informed at signup that audio is transcribed and analysed. The first time they actually start a recording, a one-time inline notice surfaces the same disclosure at the point of action — best-practice transparency under Art. 13(3) ("further information necessary to ensure fair and transparent processing").

### 5.1 Trigger

First tap of the microphone / start-recording control in the user's lifetime, regardless of conversation. Tracked via a single per-user flag (`audio_notice_seen_v1`) — not an `Acknowledgement` row, because nothing legal turns on it (the lawful basis is already established).

### 5.2 Copy

> **Recording your reflection**
>
> Your audio is sent to AssemblyAI (EU) for transcription, then to OpenAI (Ireland) for analysis. Identifying patient details are removed before AI analysis. Audio files are deleted from our servers within 24 hours of transcription.
>
> **Remember:** Anonymise patient identifiers as you speak — names, dates, NHS numbers, locations.
>
> [ Got it ]

### 5.3 Behaviour

- Single dismissable sheet.
- `[ Got it ]` persists the per-user flag; subsequent recordings show no notice.
- No checkbox. Not an `Acknowledgement` event.
- Copy lives at `compliance/privacy_notice/audio_notice_v1.0.md` (frozen) so it can be referenced from the audit pack even though it's not part of the legal acknowledgement chain.

---

## 6. Notice-version change re-acknowledgement

When the privacy notice copy changes materially (new sub-processor, new processing purpose, changed retention), a new `noticeVersion` is published and existing users see the new screen on next launch.

### 6.1 Trigger

On app foreground, the client calls `GET /api/acknowledgements/me/latest`. If the server's current `noticeVersion` is newer than the user's most recent acknowledgement row, the client routes to `notice-and-ack.tsx` in **re-ack mode** before any other gated screens.

### 6.2 Re-ack mode differences

- Title changes to *"We've updated our notice"*.
- A "What's new" callout summarises the diff in plain English (2–4 bullets).
- Checkboxes are identical. Both must be re-checked. Continue persists a new `Acknowledgement` row pointing to the new `noticeVersion` and `noticeHash`.
- The old row is preserved untouched — append-only.

### 6.3 What counts as a "material" change requiring re-ack?

| Change | Re-ack? |
|---|---|
| New sub-processor added | Yes |
| New processing purpose | Yes |
| Changed retention period (longer) | Yes |
| Changed retention period (shorter) | No |
| Typo / wording / formatting fix | No (new version, no re-ack) |
| Updated company address / contact | No |

Re-ack is expensive (forces every user through a screen). Use it sparingly; for non-material changes bump the version (e.g. `v1.0.1`) without forcing re-ack.

---

## 7. Optional opt-in toggles (post-signup, separate screen)

Reserved for genuinely optional processing. **Not in MVP.** When added, lives at `(tabs)/settings/notifications-and-privacy.tsx`, NOT in the signup flow.

### 7.1 Layout (when implemented)

```
Help us improve Logdit?

These are optional. Change anytime in Settings.

☐ Send me product updates and tips (about 1 email/month)

☐ Allow anonymous usage analytics to help improve the app

[ Save ]
```

Both unchecked by default. These **are** consent under Art. 6(1)(a) and require:
- Independent withdrawal in Settings
- Separate `OptIn` collection (not the `Acknowledgement` collection — different lawful basis, different audit semantics)
- PECR-compliant cookie banner on the web landing page if analytics covers the site

Out of scope for this spec — added here only so the boundary is clear.

---

## 8. Acknowledgement ID → screen mapping

Schema lists four IDs in `Acknowledgement.acknowledgements[].id`. How each is used:

| ID | Where captured | Required? |
|---|---|---|
| `role_uk_trainee` | `notice-and-ack.tsx`, `guest-notice.tsx` | Yes — gates progression |
| `patient_anon_duty` | `notice-and-ack.tsx`, `guest-notice.tsx` | Yes — gates progression |
| `gmc_duty` | **Not used in MVP.** Reserved for future: e.g. a specialty-specific reflection prompt about confidentiality. Don't render a checkbox for this until product surfaces a moment that warrants it. | n/a |
| `guest_terms` | `guest-notice.tsx` only | Yes (guest flow) — gates progression |

This keeps the visible-checkbox count at two for full accounts and three for guests, in line with Decision 4.

---

## 9. Copy bank — single source of truth

All user-facing copy strings on these screens live in `apps/mobile/src/locales/en/legal.ts` (or current i18n convention). Each string carries a stable key referenced from screen components. The frozen `compliance/privacy_notice/screen_notice_v1.0.md` is the *authoritative* prose; the i18n file mirrors it. CI check (future): fail if the rendered notice on the device does not byte-match the frozen file for the declared `noticeVersion`.

---

## 10. Open questions for product / legal review

1. **Do we want a "trainee year" or "GMC number" capture step** before letting users record reflections? Decision 1 leans on the user being a registered health professional. Today we ask them to tick a box; an actual GMC-number capture would harden the §2(2)(f) basis but adds onboarding friction.
2. **Multi-language support.** Welsh-medium trainees: in scope or out for v1.0? If in scope, every frozen notice version doubles.
3. **Accessibility.** WCAG AA on the notice screen — line height, font scaling, screen-reader order, the checkbox labels must be readable as a single unit (not "checkbox" then unrelated paragraph).
4. **Recording an acknowledgement when the user denies microphone permission later.** Currently the first-recording notice is gated on tapping the mic. If permission is denied at OS level, the notice never shows. Not a legal issue (lawful basis is already established at signup), but worth knowing.

---

## 11. Estimate

| Task | Effort |
|---|---|
| Notice screen UI + i18n strings + WebView links | 0.5d |
| Guest notice screen variant | 0.25d |
| First-recording audio sheet | 0.25d |
| Re-ack mode + version check on foreground | 0.5d |
| Wire to existing acknowledgement endpoint (Phase 3.1) | 0.25d |
| QA on iOS + Android, including screen-reader pass | 0.5d |
| **Total** | **~2.25d** |

Frontend work only — assumes Phase 3.1 backend schema + endpoint already merged.
