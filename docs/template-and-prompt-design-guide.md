# Template & Prompt Design Guide

A reference for designing new entry-type templates and the LLM prompts that consume
them (Reflect, Check-completeness, Tag-capabilities, Generate-followup, Generate-PDP,
Classify). It captures the prompt-engineering and taxonomy-design practices we have
adopted, the reasoning behind them, and a launch checklist to run before shipping a
new template.

> **When to use this:** before adding a new entry type (e.g. SEA, QIP) or a new
> specialty template, and whenever you touch a section definition (`description`,
> `promptHint`, `extractionQuestion`, `weight`) or one of the node prompts.

---

## 1. Mental model: pick the right task type

Most of our nodes are **extraction / classification**, not generation. The job is
*faithfulness* (preserve what the trainee said and put it in the right place), not
*fluency* (write something new and impressive). This single distinction drives almost
every decision below.

| Node | Task type | Implication |
|---|---|---|
| Classify | Classification | Few-shot + base-rate priors + confidence anchors |
| Check-completeness | Grading / assignment | Per-section anchors (shallow/adequate/rich) |
| Tag-capabilities | Recognition | Stage-specific descriptors, negative criteria |
| Reflect | Extraction + reorganisation | Meaning-preserving rewrite, no new content |
| Generate-followup | Constrained generation | Tone anchors, stage-aware depth |
| Generate-PDP | Constrained generation | SMART checklist, only stated learning needs |

Generative best-practice ("be creative, elaborate, add context") is **actively harmful**
for the extraction nodes. Keep temperature low (0.1) for them.

---

## 2. Prompt-engineering practices (apply to the node prompts)

### 2.1 Contrastive few-shot, targeting *observed* failures
Two-to-five examples beat any amount of abstract instruction — and examples must target
the failure modes you actually see, not generic ones. Always include **near-misses**
(an OK example next to a NOT OK example that differs by exactly the thing you care about).

> One concrete counter-example is worth ten abstract rules.

### 2.2 Meaning-preserving rewrite (the form-vs-content split)
When you want better English *without* fabrication, separate the two axes:
- **Form** (grammar, punctuation, fillers, fluency, ordering) — free to change.
- **Content** (facts, numbers, entities, reasoning, sentiment) — must be identical.

Encode it as: *"Preserve every fact, claim, number, and sentiment. Change how something
is said, never what is said."* Pair it with:
- A **register lock**: "improve to a plain, professional register; keep the trainee's
  exact words for subjective, emotional, or hedging language" (stops
  "out of my depth" → "unsure").
- A **no-new-content-words** rule: introduce no noun, clinical term, drug, number, or
  named entity not in the source (the precise line between copy-editing and fabrication).
- The **"according to the trainee…"** grounding check: before writing a sentence, confirm
  you could truthfully prefix it with "according to the trainee".

### 2.3 Reasoning before answer (schema field order)
OpenAI structured outputs emit fields in schema order. Put `reasoning` **before** the
verdict field (`entryType`, `confidence`, `isSubstantive`, `demonstrated`) so the model
commits to a rationale first. There is a regression test enforcing this
(`schema-field-order.spec.ts`) — keep new evaluative schemas consistent.

### 2.4 Cache-friendly layout
Prompt caching keys on the prefix. Keep all **static** content (catalogues, specialty
name, stage context) in a stable system-message header; put the **transcript** and
user-specific fields last. Verify nothing dynamic sneaks into the header.

### 2.5 Anchor every evaluative output
For any score/confidence/depth field, include 1–2 short snippets showing what "0.9
confidence" or "shallow vs adequate vs rich" actually looks like. Anchors are the single
biggest fix for run-to-run variance.

### 2.6 Right instruction in the right field / layer
Know which nodes read which field before you edit it:
- `description` — read by **check-completeness, generate-followup, AND reflect**.
- `promptHint` — read by **Reflect only** (sorting/organisation guidance).
- `extractionQuestion` — seed for generate-followup; also the *filter* for
  check-completeness (a `null` value means "not assessed").
- `weight` — ranking only (top-N follow-ups); not injected verbatim.

Put **sorting/exclusivity rules in `promptHint`** (Reflect concern). Keep `description`
neutral and descriptive so you don't leak directives into the grader and
question-generator.

### 2.7 Positive framing first, prohibition second
"Place only X here" is followed more reliably than "don't put Y here". Lead with the
positive instruction; use the exclusion as a secondary clarifier.

---

## 3. Template / section taxonomy practices (apply to template definitions)

A reflection template is a **classification taxonomy** — the model assigns each idea to a
section. If two sections overlap, the model *correctly* double-assigns, producing
duplicated content across sections. Most "the model repeats itself" bugs are taxonomy
bugs, not prompt bugs (and will **not** be fixed by upgrading the model).

### 3.1 MECE sections — Mutually Exclusive, Collectively Exhaustive
- **Mutually exclusive:** no two sections claim the same content. Watch for shared
  phrases like "follow-up plan" appearing in two `description`s.
- **Collectively exhaustive:** every fact has exactly one home. When you tighten
  boundaries, make sure nothing becomes an orphan the model is afraid to place.

### 3.2 Define each section by a discriminating axis, not an item list
Item lists ("treatment, investigations, referrals…") invite overlap. A one-line
distinguishing question is more robust. Example axis used for Management vs Outcome —
**agency + time**:
- *Did the trainee do/plan this?* → **Management & Actions**
- *Did it happen as a result, or did someone else do it afterwards?* → **Patient Outcome**

### 3.3 Name the known collision with an explicit tie-breaker
Don't rely on general guidance for the case you know breaks. Spell it out in `promptHint`,
e.g. *"a specialist clinic starting a drug → Patient Outcome, not Management"*.

### 3.4 Apply boundaries consistently across specialties
The same overlap usually exists in every specialty's version of a section (GP, IM,
psychiatry). Fix it uniformly or you get per-specialty drift.

---

## 4. Choosing the model

- Default the extraction nodes to a mid-tier model, but **match the tier to the
  difficulty of the constraint**, not the node's name.
- Subtle faithfulness constraints (e.g. "narrate, don't infer") can exceed a smaller
  model's instruction-following — that's a **capability ceiling**, and a model upgrade is
  the right lever. (Upgrading Reflect from `gpt-4.1-mini` → `gpt-4.1` removed
  causal-inference insertions that contrastive examples alone could not.)
- A taxonomy/overlap problem is **not** a capability problem — upgrading the model will
  not fix duplicated sections. Fix the taxonomy.
- It's a cheap experiment: change one model arg, re-run the same transcript, compare.

---

## 5. Verification — don't trust the model to police itself

Prompt rules reduce drift; verification *catches* it. Prefer machine-checkable contracts.

- **Substring guarantee** (exact match, no normalization): if a field must be a verbatim
  quote, drop it in code unless it is a substring of the source. Makes fabrication
  impossible to ship.
- **Number diff**: extract numbers from input and output; flag any output number not in
  the input. High precision; start log-only, then promote to a hard guard.
- **Entity diff**: same idea for clinical terms/drugs — but needs an abbreviation/synonym
  allowlist (SOB ↔ shortness of breath), so keep it a soft signal until tuned.
- **What diffs can't catch:** added *reasoning* built from existing words
  ("X supported Y") introduces no new entity or number. Use the prompt rules (§2.2) and a
  capable model for that class.

---

## 6. New-template launch checklist

Taxonomy
- [ ] Sections are **MECE** — no two `description`s claim the same content; every fact has
      exactly one home.
- [ ] Each section has a clear **discriminating axis**, not just an item list.
- [ ] Known boundary collisions have an explicit **tie-breaker** in `promptHint`.
- [ ] Sorting/exclusivity rules are in `promptHint`, not `description`.
- [ ] `extractionQuestion` set for assessed sections; `null` only where you intend
      "not assessed".
- [ ] `weight` reflects relative importance (used for follow-up ranking).
- [ ] Boundaries applied consistently across all specialties that share the section.

Prompts
- [ ] Contrastive few-shot examples cover the **failures you expect** for this template.
- [ ] Evaluative schemas order `reasoning` before the verdict field.
- [ ] Static content in the cache-friendly header; transcript last.
- [ ] Scoring/depth fields have anchors.
- [ ] Extraction prompts use the meaning-preserving rewrite + register lock.

Model & verification
- [ ] Model tier matches the hardest constraint in the prompt.
- [ ] Verifiable contracts (verbatim quotes, numbers) are checked in code, not just asked
      for in the prompt.

Testing
- [ ] Run a deliberately messy transcript (fillers, restatements, STT mishears,
      multi-turn) through the full pipeline.
- [ ] Confirm the known boundary facts land in exactly one section each.
- [ ] Confirm no fabricated numbers/entities and no softened/elevated voice.
- [ ] Run the node unit tests, including `schema-field-order.spec.ts`.

---

## 7. Worked examples from our pipeline

These are the concrete fixes that produced this guide — useful as patterns.

- **Title leaked training stage** ("ST2 GP trainee managing…"). Fix: case-focused
  `title` field description + a good/bad example pair. *Principle: §2.1, right field.*
- **Voice softening** ("a bit out of my depth" → "unsure"). Fix: register lock + a NOT OK
  example. *Principle: §2.2.*
- **Added clinical reasoning** ("the ECG showed LVH, supporting heart involvement"). The
  contrastive example alone did not stop it on `gpt-4.1-mini`; the `gpt-4.1` upgrade did.
  *Principle: §2.2 + §4 (capability ceiling).*
- **Capability "evidence" was generated prose, not a quote.** Root cause: the artefact's
  `evidence` field is populated from `CapabilityTag.reasoning` (the tag node's
  explanation) at persistence time — Reflect's own quote-shaped `capabilityAnnotations`
  are discarded. *Principle: §2.6 (know the data flow); fix belongs in the tag node +
  persistence, not Reflect.*
- **Management & Outcome duplicated content** (clinic meds, follow-up, review-in-a-month
  appeared in both). Root cause: both `description`s claimed "follow-up / ongoing plan".
  Fix: MECE split on the agency+time axis, with a named tie-breaker. *Principle: §3.*
