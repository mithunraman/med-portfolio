# Product Strategy: MediPortal

**Date**: 2026-04-07
**Stage**: MVP / Early Growth
**Author**: Product Team

---

## 1. Vision

**Every medical trainee walks into their ARCP confident, prepared, and with a portfolio that truly reflects the breadth and depth of their clinical growth — built not through hours of paperwork, but through the natural act of talking about their work.**

MediPortal transforms the dreaded chore of portfolio maintenance into a 5-minute voice conversation, giving trainees back hundreds of hours over their training years to focus on what matters: patient care and learning.

---

## 2. Target Segments

| Segment | Size (UK) | Pain Level | Current Alternative | Priority |
|---------|-----------|-----------|-------------------|----------|
| GP trainees (ST1-ST3) | ~12,000/yr | Very High — 14+ entry types, heavy portfolio burden | Manual typing into RCGP ePortfolio | **Primary** |
| Internal Medicine trainees (IMT1-3) | ~8,000/yr | High — broad capability framework | Manual typing into NHS ePortfolio | Secondary |
| Emergency Medicine trainees | ~2,500/yr | High — shift-based, little admin time | Manual entry between shifts | Secondary |
| Psychiatry trainees | ~2,000/yr | Moderate-High | Manual entry | Tertiary |
| Dermatology trainees | ~500/yr | Moderate | Manual entry | Tertiary |

**Primary segment**: GP trainees — largest cohort, highest portfolio burden (14+ entry types across 17 capabilities), and GP training programmes are most structured around portfolio evidence.

**Explicitly not serving (for now)**:

- **Consultants / senior doctors** — different appraisal system, different needs
- **Medical students** — no ARCP, portfolio requirements are lighter
- **Non-UK trainees** — curriculum frameworks are UK-specific (GMC/RCGP/RCP)
- **Trainers/supervisors** — read-only access may come later, but the product is trainee-first

---

## 3. Pain Points & Value Created

### GP Trainees (Primary)

| Pain Point | Current Cost | Value Delivered |
|-----------|-------------|----------------|
| Writing portfolio entries takes 30-60 min each | 50-100+ hours/year on admin | 5-minute voice entry → structured output |
| Forgetting clinical details weeks later | Shallow, generic reflections | Capture experiences same-day while fresh |
| Uncertainty about curriculum coverage | Anxiety before ARCP, last-minute scramble | Real-time coverage dashboard shows gaps early |
| Mapping experiences to capabilities is confusing | Missed capability tags, incomplete evidence | AI maps to correct capabilities with confidence scores |
| PDP goals feel like box-ticking | Generic goals that don't drive development | AI generates specific, actionable goals from real experiences |
| Patient data in notes risks GDPR breach | Manual redaction, or risky unredacted notes | Automatic PII redaction at transcription level |

### All Trainees (Cross-cutting)

- **Emotional burden**: Portfolio feels like bureaucracy, not learning. MediPortal reframes it as reflective conversation.
- **Time poverty**: Trainees work 48+ hour weeks. Every minute saved on admin is valuable.
- **ARCP anxiety**: Coverage dashboard provides ongoing confidence rather than pre-ARCP panic.

---

## 4. Value Propositions

**For GP trainees**: When they've had a meaningful clinical experience and need to document it for their portfolio, they want to capture it quickly and accurately, so they can build a comprehensive portfolio without sacrificing their evenings and weekends to paperwork.

**For IM/EM trainees**: When they're rotating through placements and accumulating diverse experiences, they want to ensure nothing falls through the cracks, so they can demonstrate broad capability coverage at their ARCP without last-minute evidence gathering.

**For all trainees approaching ARCP**: When they're preparing for their annual review, they want to see exactly where their portfolio is strong and where gaps remain, so they can target their remaining time on filling gaps rather than guessing.

---

## 5. Strategic Trade-offs

| We Choose | Over | Because |
|-----------|------|---------|
| Voice-first input | Text-first forms | Trainees are time-poor and mobile; speaking is 3-5x faster than typing and captures richer detail |
| UK-specific curriculum depth | International breadth | Curriculum mapping is the core value — going deep on RCGP/RCP frameworks creates real utility vs. generic reflections |
| Privacy-by-default (auto PII redaction) | Letting users manage their own redaction | Medical data requires healthcare-grade compliance; one breach destroys trust in the entire product |
| AI-guided structure | Free-form journaling | Trainees don't know what a "good" portfolio entry looks like — guided structure is the product, not a constraint |
| Mobile-first experience | Web-first or desktop | Trainees capture experiences on the go, between patients, on the ward — mobile is the natural form factor |
| Trainee-centric product | Multi-stakeholder platform (trainers, deaneries) | Focus creates a better product; trying to serve trainers and trainees simultaneously dilutes the experience |
| Specialty-specific entry templates | One-size-fits-all templates | A GP "Clinical Case Review" is fundamentally different from an EM "Significant Event Analysis" — specificity is the moat |

---

## 6. Key Metrics

- **North Star Metric**: **Portfolio entries completed per trainee per month** — directly measures whether trainees are building their portfolio consistently (vs. cramming before ARCP)

- **Input Metrics**:
  - Voice recordings submitted per week (acquisition → activation)
  - AI classification acceptance rate (measures AI quality)
  - Follow-up question completion rate (measures conversation UX friction)
  - Time from recording to finalized entry (measures efficiency promise)
  - Capability coverage % across active trainees (measures long-term value delivery)

- **Health Metrics** (guardrails):
  - PII redaction accuracy (must stay >99.5% — compliance critical)
  - Transcript quality / word error rate
  - LLM cost per entry (unit economics viability)
  - Guest → registered conversion rate
  - Weekly active trainees / monthly active trainees ratio (stickiness)
  - ARCP outcome correlation (long-term: do MediPortal users pass at higher rates?)

---

## 7. Growth Engine

### Primary loop: Peer recommendation (viral within training cohorts)

Medical trainees work in small cohorts (8-12 per GP practice, 20-30 per rotation). When one trainee shows up to a portfolio review with a comprehensive, well-structured portfolio built in a fraction of the time, others ask "how did you do that?"

The coverage dashboard is inherently shareable — trainees compare progress.

**Mechanism**: Word-of-mouth within training practices and deaneries.

### Secondary loop: Training programme adoption (top-down)

GP Training Programme Directors and Educational Supervisors recommend tools to their trainees. If MediPortal demonstrably improves ARCP outcomes, programme directors become evangelists.

**Mechanism**: Case studies → outreach to TPDs → cohort onboarding.

### Activation strategy

- Guest mode lowers the barrier — try it with one real clinical experience before signing up.
- Onboarding captures specialty + training stage to immediately personalize the experience.
- First entry should feel magical: speak for 3 minutes, get a portfolio-ready entry with mapped capabilities.

### Expansion

- New specialties (currently 5, expanding to cover all major UK training programmes)
- PDP tracking becomes sticky — trainees return to update goal progress
- Pre-ARCP coverage review becomes a seasonal spike driver

---

## 8. Core Capabilities

| Capability | Build / Buy / Partner | Investment Level | Timeline |
|-----------|---------------------|-----------------|----------|
| Voice transcription with PII redaction | Buy (AssemblyAI) | Medium (per-minute cost) | Done |
| LLM-powered structured analysis (LangGraph) | Build | High (core IP) | Done — iterating |
| Specialty-specific curriculum frameworks | Build (domain expertise) | High (per-specialty effort) | 5 specialties done, ongoing |
| Mobile app (iOS/Android) | Build (Expo/React Native) | High | Done — iterating |
| Coverage dashboard & gap analysis | Build | Medium | Done |
| PDP goal tracking | Build | Medium | Done |
| Healthcare-grade data compliance | Build + process | High (ongoing) | In progress |
| Entry export to NHS ePortfolio format | Build / Partner | Medium | Hypothesis — not yet built |

---

## 9. Defensibility

### Current moats (emerging)

1. **Specialty-specific curriculum depth** — Each specialty's entry types, capability frameworks, and reflection templates are hand-crafted with domain expertise. A competitor can't just point an LLM at "medical portfolios" — they need deep understanding of RCGP's 17 capabilities, IMT's domains, etc. This is slow, hard work that compounds over time.

2. **Prompt engineering & LangGraph pipeline** — The multi-step, interrupt-driven analysis flow (classify → completeness check → follow-up → capability tagging → reflection → PDP) is non-trivial to replicate well. Each node has specialty-aware system prompts tuned for quality.

3. **Data flywheel (emerging)** — As more trainees use the system, classification accuracy improves, follow-up questions become more targeted, and reflection quality increases. User corrections (e.g., changing a classification) become training signal.

4. **Switching costs** — Once a trainee has 6+ months of entries, PDP goals, and coverage data in MediPortal, migrating is painful. The portfolio becomes the system of record for their training progression.

### Honest assessment of moat gaps

- No network effects yet (trainees don't interact with each other in-product)
- Brand is early-stage — not yet a recognized name in medical education
- LLM capabilities are commoditizing — the moat is in the domain-specific pipeline, not the raw AI
- If NHS ePortfolio built similar AI features natively, that would be a significant threat (but NHS digital moves slowly)

---

## Strategic Risks

1. **NHS ePortfolio integration barrier** — If trainees still need to manually copy entries into the official ePortfolio, the "time savings" story weakens. An export/integration feature may be critical for retention. Alternatively, if NHS builds AI features into the official platform, MediPortal's value proposition erodes.

2. **LLM cost economics** — Each entry involves transcription + multiple LLM calls (classification, completeness, capabilities, reflection, PDP). At scale, unit economics may not support a low price point that trainees (who are not well-paid) can afford. Need to monitor cost-per-entry closely.

3. **Regulatory / trust risk** — One incident of patient-identifiable data leaking through the AI pipeline could be catastrophic for a healthcare product. The PII redaction system is load-bearing — it must be essentially perfect, and "essentially perfect" is expensive to guarantee.

---

## Next Steps

1. **Validate with real trainees** — Get the product into the hands of 20-30 GP trainees for a training rotation and measure: entries created, time saved, coverage improvement, qualitative satisfaction.
2. **Investigate ePortfolio export** — Research RCGP and NHS ePortfolio APIs or export formats. Even a "copy-paste ready" format would reduce friction.
3. **Unit economics modeling** — Calculate cost-per-entry at current and projected scale. Determine sustainable pricing.
4. **Talk to Training Programme Directors** — Validate the top-down growth hypothesis. Would they recommend this to their cohort?
