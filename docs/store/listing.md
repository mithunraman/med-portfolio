# App Store listing — Logdit (iOS)

Source of truth for App Store Connect metadata. Edit here, then copy into ASC —
not the other way round. Keeping it in the repo makes the copy reviewable,
diffable and recoverable, and records *why* each declaration was made.

Last reviewed: 2026-08-01 · App version 1.0.0

---

## Identity

| Field | Value | Limit |
|---|---|---|
| Name | `Logdit: GP Portfolio AI` | 30 (24 used) |
| Subtitle | `Speak a case. Get an entry.` | 30 (28 used) |
| Primary category | **Education** | — |
| Secondary category | **Medical** | — |
| Age rating | 4+ | — |
| Price | Free | — |

**Why Education primary.** FourteenFish Portfolio — the RCGP portfolio of record
and the app every GP trainee already has — sits in Education, which makes
related-app adjacency a real discovery channel. It is also consistent with the
regulated-medical-device declaration below: Logdit is educational and
administrative software, not clinical software, and the store category should not
say otherwise. Education additionally avoids the heavier App Review scrutiny
applied to the Medical category.

Category changes ride with a version submission — this is not a field to iterate
on casually.

## Keywords (100 chars)

```
arcp,rcgp,trainee,registrar,reflection,cpd,appraisal,eportfolio,gpst,revalidation
```

Deliberately excludes terms already carried by Name and Subtitle (`logdit`, `gp`,
`portfolio`) — those are indexed from those fields, so repeating them wastes
budget. The iOS description is **not** indexed, so no keyword stuffing there.

## Promotional text (170 chars)

Editable without a build — use it for anything time-sensitive.

```
Talk through a case after clinic. Logdit organises your own words into a structured, curriculum-mapped portfolio entry — and tracks your capability coverage as you go.
```

Rotations for later: ARCP season — *"ARCP coming up? See which capabilities
you've actually evidenced — and which ones still need work."*

## Description

Only the first ~170 characters show before "more", so the opening must stand
alone as the whole pitch.

```
Portfolio admin is the part of GP training nobody signed up for.

Logdit fixes it. After clinic, just talk through the case the way you'd tell a
colleague — and get a structured, curriculum-mapped portfolio entry back.

No signup needed to start.


HOW IT WORKS

1. Talk. Record a voice note, or type, in whatever order it comes out.

2. Answer a few questions. Logdit asks the follow-ups that actually matter —
   each one with an example answer, so you're never staring at a blank box.

3. Review and export. Your entry arrives structured into the right sections,
   mapped to the capabilities it evidences. Edit anything. Export as a PDF or
   copy it straight across.

Five minutes, start to finish.


YOUR WORDS STAY YOURS

This matters more than any feature, so we built the whole thing around it.

Logdit does not write your reflection. It organises what you actually said —
fixing grammar, cutting the ums, sorting your points into the right sections.
It will not add reasoning you didn't voice, and it keeps your own phrasing for
how you felt, exactly as you said it. If you said you were worried, it says
worried.

You confirm which capabilities the case evidences. You edit any line. Every
change is versioned, so you can always go back.


STAY AHEAD OF YOUR ARCP

Set up your review period and Logdit tracks coverage across all thirteen
capabilities — so you can see at a glance which areas are well evidenced and
which are still thin, months before anyone asks.

Learning needs you raise become PDP goals with specific, evidenceable actions.
Track the ones you want to follow up. Ignore the rest.


WHAT'S INSIDE

• Voice or text capture — however you think best
• Every entry type: case reviews, significant events, reflections on feedback,
  leadership, academic work, out of hours, QI projects and activities,
  prescribing
• A live readiness score, so you know when an entry is strong enough
• Capability coverage tracking across your review period
• PDP goals with SMART actions and review dates
• Full editing, with version history and restore
• PDF export and copy-to-clipboard
• Private notes on any entry
• Dark mode


BUILT FOR CONFIDENTIALITY

Patient identifiers are automatically removed from your transcript before any
AI processes it — NHS numbers, names, dates and contact details included.

Your account is yours to close: request deletion in the app at any time.


WHO IT'S FOR

UK GP specialty trainees, ST1 to ST3, building an RCGP training portfolio.

Start as a guest and log your first case in the next five minutes. Create an
account whenever you're ready — everything you've written comes with you.


Logdit is an independent app and is not affiliated with, endorsed by, or
connected to the Royal College of General Practitioners. Logdit supports
portfolio documentation only and does not provide clinical advice.
```

**Copy rules.** Never write "beta", "trial", "preview" or "early access"
(Guideline 2.2). Never name a competing product. Never claim clinical benefit,
improved patient outcomes, or that Logdit writes the reflection — the last of
these is both an RCGP/GMC problem and the thing that would undermine the
medical-device declaration, since classification turns on the manufacturer's
stated intended purpose.

---

## Screenshots

Capture order, and the message each frame carries.

| # | Screen | Headline |
|---|---|---|
| 0 | Title card | Five minutes. One complete entry. |
| 1 | Chat, mid-recording | Just talk it through |
| 2 | Follow-up bubble with example answers | The AI asks. You just answer. |
| 3 | Entry detail — sections + capabilities (names only, no codes) | Your words, not the AI's |
| 4 | Entry detail — PDP goals | Goals from the needs you named |
| 5 | Review period coverage | Know exactly where you're thin |
| 6 | Chat with readiness header | See it get stronger as you talk |
| 7 | Home dashboard | Your portfolio, always up to date |
| 8 | Entry-type picker | Every RCGP entry type |
| 9 | Export sheet | One tap into your portfolio |

Frame 8 is the first to cut if a slot is needed — the description can carry the
entry-type list in words; none of the other frames can be conveyed in text.

Use a seeded demo account with fully de-identified content. Frames 1 and 5
depend on UI added specifically for legibility (recording indicator, domain
completeness bars) — verify those render before capturing.

---

## Declarations

### Regulated medical device: **No** (EU/EEA, UK, US)

Logdit is educational and administrative software. It does not diagnose, does not
recommend treatment, and does not assess clinical correctness — `check_completeness`
grades documentation completeness against rubrics, and `elicit-justification` is
explicitly prohibited from narrating what the trainee could have done better. The
app operates retrospectively on a closed encounter and has no prospective role in
any patient's care.

Under EU MDR 2017/745 / UK MDR 2002, classification turns on intended purpose, and
MDCG 2019-11 places education, training and administrative software outside the
definition. MHRA guidance excludes software limited to storage, archival,
communication and simple search.

*Would change this:* any feature that flags a possible missed diagnosis, prompts
reconsideration of management, or evaluates whether care met a standard. Get
regulatory advice before building, not before shipping.

### Content rights: **Yes — contains third-party content, and I have the necessary rights**

The RCGP capability codes, names and domain groupings in `gp.capabilities.ts` are
third-party in origin (descriptions and `descriptorCriteria` rubrics are original
Logdit authorship — see the provenance header in that file). Icon fonts ship under
MIT/SIL-OFL. Answering "No" would be inaccurate, and inaccuracy is the expensive
failure mode.

### Age rating: **4+**

| Question | Answer |
|---|---|
| Parental Controls | No |
| Age Assurance | No |
| Unrestricted Web Access | No — in-app browser opens admin-authored notice links only |
| User-Generated Content | No — content is never distributed to other users |
| Social Media | No |
| Social media disabled for under-13s | No — no age API is called; nothing to mitigate |
| Profanity / Crude Humor | None |
| Horror/Fear Themes | None |
| Alcohol, Tobacco, Drug Use | None |
| Medical or Treatment Information | None — Logdit elicits, it does not inform |
| Health or Wellness Topics | No |
| Age category override | Not Applicable |

**On the override.** Terms §1 requires users to be 18+, which permits an override,
but content rating measures suitability, not contractual eligibility. An 18+ rating
would risk the app being blocked by MDM content-rating restrictions on
NHS-managed devices — the exact handset the product is for.

### Data collection: **Yes**

All twelve types: purpose **App Functionality** only, **Linked to user**, **not used for tracking**.

| Type | Note |
|---|---|
| Name | OTP verify; editable in settings |
| Email Address | OTP auth; transmitted to Resend |
| Health | Case content — conservative declaration; see below |
| Sensitive Info | Case content may contain Article 9 categories about patients |
| Audio Data | Voice notes → object storage, AssemblyAI |
| Other User Content | Reflections, messages, notes, PDP goals |
| User ID | Account xid; also `Sentry.setUser({ id })` |
| Product Interaction | Quota rows retained per AI operation |
| Crash Data | Sentry |
| Performance Data | Sentry, 20% trace sampling |
| Other Diagnostic Data | Sentry breadcrumbs, device context |
| Other Data | Specialty, training stage |

**Diagnostics are Linked.** `sendDefaultPii: false` prevents Sentry inferring extra
personal data but does not undo the `setUser({ id })` calls in `authSlice.ts`.

**Open item — Health and Sensitive Info.** Declared conservatively. The content is
medical but concerns patients rather than the user, and Apple's categories are
otherwise framed around the user. FourteenFish declares neither, but may not
transmit clinical text to third-party AI vendors as Logdit does. Confirm with the
data-protection adviser and keep consistent with the DPIA and privacy policy.

**Tracking: No** across all types. No ad SDKs, no data brokers, no cross-app
linkage. Uploading the email list to an ad platform as a custom audience *would*
make this Yes and require ATT — do not do so without revisiting.

### Purposes — currently App Functionality only

Two changes would require updating the label:

1. Sending any non-transactional email (launch note, newsletter) adds
   **Developer's Advertising or Marketing** to Email Address. UK PECR also needs a
   consent mechanism, which the signup flow does not yet capture.
2. Using quota or Sentry data for product decisions adds **Analytics**.

Privacy labels can be updated in ASC without a build, so declare current practice
rather than future intent.

---

## Required URLs

| Field | Value |
|---|---|
| Privacy Policy URL | https://logdit.app/privacy.html |
| Support URL | https://logdit.app/ |
| Marketing URL | https://logdit.app/ |

These must match `apps/mobile/src/constants/legal.ts`, which drives the in-app links.
