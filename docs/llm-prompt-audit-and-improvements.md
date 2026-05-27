# LLM Prompt Audit and Improvement Recommendations

This document catalogues every LLM prompt in the backend, identifies which parts of the GP specialty curriculum (`GP_SPECIALTY_CONFIG`) are injected into each, and proposes concrete improvements grounded in current prompt-engineering best practice.

---

## Part 1 — Prompt Audit: GP Curriculum Injection

The repo has **8 distinct LLM prompts** (6 in the portfolio-graph nodes, 2 in the processing pipeline). Three other portfolio-graph nodes are interrupt-only and don't call the LLM.

### `portfolio-graph/nodes/` — the analysis pipeline

#### 1. Classify entry type — [classify.node.ts:73-101](../apps/api/src/portfolio-graph/nodes/classify.node.ts#L73-L101)
- **Node**: `classifyNode` → decides which entry type (CCR, SEA, LEA…) a transcript is
- **Schema**: `classifyResponseSchema` (`isRelevant`, `entryType`, `confidence`, `reasoning`, `signalsFound[]`, `alternatives[]`)
- **Model**: GPT-4.1-mini, temp 0.1, maxTokens 800
- **Curriculum injected**:
  - **All `entryTypes[]`** via `formatEntryTypeBlock()`: `code`, `label`, `description`, `classificationSignals[]`
  - `config.name` ("General Practice")
  - **Training stage context** paragraph for the user's ST1/ST2/ST3
- **Notable**: Post-LLM `adjustConfidence()` penalises short transcripts and close top-2 alternatives. Includes prompt-injection guardrail.

#### 2. Check completeness — [check-completeness.node.ts:76-137](../apps/api/src/portfolio-graph/nodes/check-completeness.node.ts#L76-L137)
- **Node**: `checkCompletenessNode` → decides which template sections are substantively covered
- **Schema**: `completenessResponseSchema` — array of `{idea, sectionId, isSubstantive}` assignments
- **Model**: GPT-4.1-mini, temp 0.1, maxTokens 2000
- **Curriculum injected**:
  - **Filtered `template.sections[]`** (only `required: true` AND non-null `extractionQuestion`) via `formatSectionBlock()`: `id`, `label`, `description`
  - `config.name`, training stage context
- **Notable**: Assignment-based (idea→section) instead of "is X complete?" — prevents double counting. Post-processing maps to shallow/adequate/rich depth.

#### 3. Tag capabilities — [tag-capabilities.node.ts:75-103](../apps/api/src/portfolio-graph/nodes/tag-capabilities.node.ts#L75-L103)
- **Node**: `tagCapabilitiesNode` → which of the 13 RCGP capabilities the entry evidences
- **Schema**: `tagCapabilitiesResponseSchema` — array of `{code, demonstrated, confidence, reasoning}`
- **Model**: GPT-4.1-mini, temp 0.1, maxTokens 2000
- **Curriculum injected**:
  - **All `capabilities[]`** via `formatCapabilityBlock()`: `code` (C-01…C-13), `name`, `description`, `domainCode`, `domainName`
  - The classified `entryType.code` for context
  - `config.name`, training stage context
- **Notable**: Recognition-based (one yes/no per capability). Post-processing filters by confidence ≥0.5, caps at 5, sorts by confidence.

#### 4. Generate follow-up questions — [generate-followup.node.ts:43-89](../apps/api/src/portfolio-graph/nodes/generate-followup.node.ts#L43-L89)
- **Node**: `generateFollowupNode` → contextualised micro-questions for missing/shallow sections
- **Schema**: `followupQuestionsResponseSchema` — array of `{sectionId, question, hints.examples[]}`
- **Model**: GPT-4.1, temp 0.3, maxTokens 1000
- **Curriculum injected**:
  - **Missing/shallow `template.sections[]`** only (ranked by `weight`, top 3) via `formatMissingSectionBlock()`: `id`, `label`, `description`, default `extractionQuestion`, depth status
  - `config.name`, training stage context
- **Notable**: The template's own `extractionQuestion` is used as a starting point for the LLM to rephrase; fallback to it verbatim if LLM call fails.

#### 5. Reflect (extract & organise) — [reflect.node.ts:60-120](../apps/api/src/portfolio-graph/nodes/reflect.node.ts#L60-L120)
- **Node**: `reflectNode` → sorts the trainee's transcript into template sections, preserving their voice
- **Schema**: `reflectResponseSchema` — `{title, sections[], capabilityAnnotations[]}`
- **Model**: GPT-4.1-mini, temp 0.1, maxTokens proportional to transcript (min 2000)
- **Curriculum injected**:
  - **All `template.sections[]`** via `formatSectionBlock()`: `id`, `label`, `required`, `description`, `promptHint`
  - **Tagged `capabilities[]`** via `formatCapabilityBlock()`: `code`, `name`, plus the per-capability `reasoning` from step 3 (for the `capabilityAnnotations` mapping back to sections)
  - `config.name`, training stage context (used only for formatting calibration, not content)
- **Notable**: Must NOT add new content — only reorganise. Jaccard-overlap restatement detector flags near-duplicates.

#### 6. Generate PDP — [generate-pdp.node.ts:72-119](../apps/api/src/portfolio-graph/nodes/generate-pdp.node.ts#L72-L119)
- **Node**: `generatePdpNode` → 1-2 SMART PDP goals from the reflection + confirmed capabilities
- **Schema**: `generatePdpResponseSchema` — array of `{goal, actions: [{action, intendedEvidence}]}`
- **Model**: GPT-4.1, temp 0.2, maxTokens 1000
- **Curriculum injected**:
  - **User-confirmed `capabilities[]`** via `formatCapabilityBlock()`: `code`, `name`, plus tag-time `reasoning`
  - The classified `entryType.code`
  - Reflection sections as text (the trainee's own output, not curriculum)
  - `config.name`, training stage context
- **Notable**: Only generates from learning needs the trainee explicitly stated — does NOT infer gaps. Hard limits: max 2 goals, max 3 actions.

#### Interrupt-only nodes (no LLM call, no prompts)
- [gather-context.node.ts](../apps/api/src/portfolio-graph/nodes/gather-context.node.ts) — aggregates messages
- [ask-clarification.node.ts](../apps/api/src/portfolio-graph/nodes/ask-clarification.node.ts) — pauses for more clinical detail
- [ask-followup.node.ts](../apps/api/src/portfolio-graph/nodes/ask-followup.node.ts) — presents the questions generated in step 4
- [present-classification.node.ts](../apps/api/src/portfolio-graph/nodes/present-classification.node.ts) — user confirms entry type
- [present-capabilities.node.ts](../apps/api/src/portfolio-graph/nodes/present-capabilities.node.ts) — user confirms capabilities

These reuse pre-computed curriculum-derived options from earlier nodes but issue no new LLM call.

### `processing/` — pre-graph transcript pipeline

#### 7. Cleaning — [cleaning.prompt.ts:3-37](../apps/api/src/processing/prompts/cleaning.prompt.ts#L3-L37)
- **Service**: `CleaningStage.execute()` ([cleaning.stage.ts:20-37](../apps/api/src/processing/stages/cleaning.stage.ts#L20-L37))
- **Purpose**: Fix speech-to-text artefacts, medical terminology mishears, punctuation, paragraphing
- **Schema**: `cleaningResponseSchema` — `{cleanedTranscript}`
- **Model**: GPT-5.4-nano, temp 0.1
- **Curriculum injected**: **None.** Pure transcript hygiene. No specialty, entry-type, or capability context.

#### 8. Redaction — [redaction.prompt.ts:3-57](../apps/api/src/processing/prompts/redaction.prompt.ts#L3-L57)
- **Service**: `RedactionStage.execute()` ([redaction.stage.ts:34-78](../apps/api/src/processing/stages/redaction.stage.ts#L34-L78))
- **Purpose**: PII redaction (names, orgs, locations, DOBs, specific dates) after a regex pre-pass
- **Schema**: `redactionResponseSchema` — `{needsRedaction, redactedText, redactedEntities[]}`
- **Model**: GPT-5.4-nano, temp 0
- **Curriculum injected**: **None.** PII categories only. Preserves medical eponyms (Parkinson's, Bell's…), drugs, scales — but these are listed in the prompt itself, not pulled from `SpecialtyConfig`.

### Summary table — curriculum fields injected per prompt

| # | Prompt | `entryTypes` | `templates` (sections) | `capabilities` | `trainingStages` | `specialty.name` |
|---|---|---|---|---|---|---|
| 1 | Classify | **all**: code, label, description, classificationSignals | — | — | stage ctx | ✓ |
| 2 | Check completeness | — | required+askable: id, label, description | — | stage ctx | ✓ |
| 3 | Tag capabilities | classified code only | — | **all 13**: code, name, description, domainCode, domainName | stage ctx | ✓ |
| 4 | Generate follow-up | — | missing/shallow only: id, label, description, extractionQuestion, weight | — | stage ctx | ✓ |
| 5 | Reflect | — | **all**: id, label, required, description, promptHint | tagged: code, name, reasoning | stage ctx | ✓ |
| 6 | Generate PDP | classified code only | — | confirmed: code, name, reasoning | stage ctx | ✓ |
| 7 | Cleaning | — | — | — | — | — |
| 8 | Redaction | — | — | — | — | — |

### What's never injected anywhere

Two fields on the curriculum data are defined but **never make it into a prompt**:

- **`entryType.frequency`** (e.g., "36 per year") — declared on `EntryTypeDefinition` but unused in any LLM call. Presumably reserved for dashboard/gap-analysis UI, not LLM reasoning.
- **`template.wordCountRange`** — present on every template, but no prompt currently passes it to the LLM. The Reflect node controls length via `maxTokens` proportional to transcript instead.

If you wanted the LLM to respect target word counts, the Reflect / Generate-PDP prompts would need updating to read `template.wordCountRange`.

### Other observations

- **Every analysis-pipeline prompt is curriculum-aware**; only the two pre-graph cleanup prompts (Cleaning, Redaction) are curriculum-free, as expected — they run before classification, so they can't know the specialty's structure.
- **`promptHint` is only used by Reflect** (step 5). It's specifically positioned as guidance for generation/organisation, so this matches the design — but it does mean the Check-completeness and Generate-followup nodes are working from `description` alone, not from the richer authoring guidance in `promptHint`.
- **`extractionQuestion` is used as a seed in Generate-followup**, and as a *filter* in Check-completeness (only sections with a non-null `extractionQuestion` are graded). This makes `extractionQuestion: null` the de-facto "this section is optional and won't be assessed" signal.
- **`weight` is used only for ranking** sections in Generate-followup (top 3 by weight). It does not flow into any prompt verbatim and isn't currently used for quality scoring at the LLM layer.
- **All prompts include a prompt-injection guardrail** in the system message with a defined "abort" response shape.

---

## Part 2 — Prompt Engineering Improvements

Based on current best-practice guidance (sources at the end), here are concrete improvements for each of the 8 prompts. Cross-cutting wins first, then prompt-by-prompt.

### Cross-cutting wins (apply to most/all prompts)

1. **Add few-shot examples.** None of the current prompts include any. For classification and grading tasks the literature is unambiguous: 2–5 well-chosen examples beat any amount of instruction-tuning. Include both *positive* and *near-miss/negative* examples per category.
2. **Reasoning before answer in the Zod schema.** Several schemas have `reasoning` as a sibling field of the answer; ordering it *first* in the JSON Schema forces the model to write the chain-of-thought before committing. (OpenAI structured outputs honour key order.)
3. **Cache-friendly layout.** GPT-5/GPT-4.1 prompt caching keys on the prefix. Move *all* static content (entry-type catalogue, capability catalogue, specialty name, stage context) into a stable system-message header; put transcript + user-specific fields last. Most current prompts already do this — verify nothing dynamic sneaks into the header.
4. **Anchor scoring/confidence calibration.** For every evaluative output (confidence, isSubstantive, demonstrated, depth), include 1–2 short anchor snippets showing what "0.9 confidence" or "shallow" actually looks like. Anchors are the single biggest fix to inter-judge variance.
5. **Inject curriculum data that's currently unused:** `entryType.frequency`, `template.wordCountRange`, `section.promptHint` (outside Reflect), `section.weight`. Each unlocks a specific improvement below.
6. **"According to the trainee…" grounding clause** for extractive prompts. Research shows quoting-prompts cut hallucination materially in extraction tasks.

### 1. Classify Entry Type

What to add:

- **Few-shot examples per entry type**, especially the high-confusion triplet **CCR ↔ LEA ↔ SEA**. The classifier needs to internalise the GMC-threshold distinction (SEA = harm threshold met, LEA = no harm but learning, CCR = routine case) — this is currently *implicit* in the `description`.
- **Inject `entryType.frequency` as a prior.** "CCR: 36/year" vs "SEA: ~1 per 6 months" tells the model the base rate. Without priors, the model over-classifies rare types (SEA, QIP) because their signals are dramatic.
- **Explicit disambiguation rules** in the system message:
  > "If harm or near-miss is described → SEA, not LEA. If no specific patient → not CCR. If structured intervention with PDSA cycles → QIP, not QIA."
- **Confidence anchors:** show what 0.9 vs 0.6 vs 0.3 should look like (e.g., "0.9: ≥3 signals matched, no plausible alternative; 0.3: ≤1 signal, top alternatives within 0.2").
- **Stage-aware priors.** ST1 trainees rarely lead a full QIP. Inject the user's stage *and* a sentence like "PDPs/QIPs are uncommon outputs for ST1; require stronger evidence."
- **Schema tweak:** reorder `classifyResponseSchema` so the field order is `reasoning → signalsFound → alternatives → entryType → confidence → isRelevant`. Right now the schema has `isRelevant` before `reasoning`, which encourages premature commitment.

### 2. Check Completeness

What to add:

- **Inject `section.promptHint`** alongside `description`. The hint is the authoring intent ("what good looks like") — currently only Reflect sees it, which is exactly backwards: the *grader* needs it more than the *organiser*.
- **Inject `section.weight`** so the LLM knows which sections matter most. Currently weights are only used post-hoc to rank follow-ups. Telling the model "clinical_reasoning is the most heavily weighted section (0.25)" raises the bar for what counts as substantive there.
- **Per-section anchor examples.** This is the highest-leverage change here. For each section, include:
  > "Shallow: 'I considered different things.' (vague, no content) | Adequate: 'I considered PE given the pleuritic pain and tachycardia, but Wells score was low and the pain was reproducible on palpation, suggesting MSK.' (concrete differentials, reasoning chain)"
  >
  > Without anchors, the model defaults to its own implicit rubric, which varies run-to-run.
- **Stage calibration.** ST1 "adequate" is a lower bar than ST3. Inject a one-liner per stage: "ST1 trainees may not yet articulate full differentials; surface-level reasoning still counts as substantive."
- **Inject `wordCountRange`** so the model has a volume baseline ("for a CCR targeting 150–300 words, a 30-word section is almost certainly shallow").
- **Explicit empty-section handling.** Currently the assignment approach can leave sections with zero assignments without the model flagging it. Add: "If a section has no ideas assigned, explicitly return an empty assignment with `isSubstantive: false` so we know it's missing, not overlooked."

### 3. Tag Capabilities

What to add:

- **Stage-specific capability descriptors.** This is the **biggest data gap**. RCGP defines what each capability looks like at ST1 vs ST3 (the "descriptors" — e.g., for C-04 Data Gathering, ST1 = "takes a focused history with prompts", ST3 = "synthesises history and exam to guide investigation"). The current `CapabilityDefinition` only stores one generic `description`. Recommended schema extension:
  ```ts
  stageDescriptors?: Record<string, string>  // { ST1: "...", ST2: "...", ST3: "..." }
  ```
  Then inject *the descriptor for the user's stage* — not the generic one. This grounds "demonstrated" against the right bar.
- **Per-capability anchor pairs.** For each of the 13 capabilities, one short positive snippet + one near-miss. C-04 is routinely confused with C-05 (Clinical Management): example pair would clarify.
- **Negative criteria.** Add lines like "Ordering investigations is NOT C-04 unless the trainee describes interpreting them" — counter-examples are highly effective.
- **Domain-level diversity hint.** The prompt already groups by `domainName`. Add: "A typical CCR demonstrates 2–4 capabilities, usually spanning at least 2 domains. Tagging 5+ from one domain is unusual — re-check." This dampens over-tagging within a domain.
- **Inject the chosen entry type's `description`**, not just its `code`. The code alone ("CLINICAL_CASE_REVIEW") gives less context than "Reflection on a patient case personally seen…".

### 4. Generate Follow-up Questions

What to add:

- **Inject `section.promptHint`** in addition to `description` and `extractionQuestion`. The hint tells the LLM what content the section is *supposed* to elicit, so it can phrase its question to draw that content out.
- **Inject already-covered sections** (as a list of section IDs). Right now the prompt sees only the gaps; it doesn't know that `clinical_reasoning` is rich — useful context for phrasing ("Given you've already covered the diagnosis well, can you say more about the management?").
- **Inject prior Q&A turns.** If the user has already been asked one round and gave a thin answer, the second-round question should acknowledge it ("You mentioned you considered PE — what made you decide against it?"). Currently the node doesn't see prior follow-up answers.
- **Tone anchors.** Add a good-vs-bad example pair: bad = "Why didn't you do an ECG?" (interrogative); good = "What additional investigations did you consider, and what guided your choice?" Trainees disengage from interrogative tone.
- **Stage-aware depth.** ST1 follow-ups should be simpler ("What did you find on examination?"); ST3 follow-ups can probe meta-cognition ("How did your prior bias affect this consultation?"). Inject the stage descriptor and add a one-liner about question complexity.
- **Word-count deficit hint.** "Current word count: 85; target 150–300; you're ~50% short" tells the LLM *how much* more it needs, not just *what's* missing.

### 5. Reflect

This is the best-instrumented prompt already. Improvements:

- **Inject `wordCountRange`** explicitly: "Target length: 150–300 words across all sections combined." Currently length is controlled by `maxTokens`, which is a budget cap, not a target.
- **Inject `section.extractionQuestion`** alongside `promptHint`. The extraction question tells the model *what question each section answers*, which sharpens placement of borderline content.
- **One full worked example.** A short anonymised transcript → ideal organised output. This is high cost (long prompt) but high return — Reflect drives the perceived quality of the whole product.
- **Stronger anti-paraphrase guard.** Right now the system says "Use ONLY the trainee's own words". Add a concrete negative example:
  > "Trainee says: 'BP was high'. ❌ Do NOT write: 'Blood pressure was elevated, consistent with stage 2 hypertension.' ✓ Write: 'BP was high.'"
  >
  > One concrete counter-example is worth ten abstract rules.
- **"According to the trainee…" prefix instruction.** Asking the model to mentally prepend each sentence with "According to the trainee…" before writing it is a documented technique for cutting paraphrase drift.
- **Annotation grounding.** For `capabilityAnnotations`, require the model to cite the *section* the capability is demonstrated in (already done) AND a short *quote* from the transcript. Quotes prevent fabricated annotation reasoning.

### 6. Generate PDP

What to add:

- **Inject the completeness gaps**, not only the confirmed capabilities. Right now only positive evidence flows in, but PDP goals come from *gaps* the trainee acknowledged. If the reflection has a shallow `clinical_reasoning` section, that's a learning need — the PDP node currently doesn't see this signal.
- **Inject prior PDP goals from the user's history.** Avoid recommending the same goal twice; ideally build on prior incomplete actions. (Requires DB lookup the node doesn't currently do.)
- **SMART rubric as a structured checklist**, not free text. Have the model fill: `{ specific, measurable, achievable, relevant, timeBound }` per goal, each as a short string explaining how the criterion is satisfied. This forces the model to *check* SMART, not just claim it.
- **Anchor examples:** one vague PDP goal (rejected) + one SMART PDP goal (accepted) per common entry type.
- **ARCP horizon awareness.** "User is ST2, ~14 months from ARCP." Goals should be achievable within that horizon. Currently the stage descriptor is injected but the *time-to-ARCP* dimension isn't.
- **Inject capability stage descriptors** (same data extension as for #3) so the LLM understands the gap between current performance and the next-stage descriptor — that gap *is* the PDP goal.

### 7. Cleaning

Curriculum injection here is genuinely optional, but a few wins:

- **Specialty-specific medical glossary.** Inject a small lexicon of common GP terms and their typical mishears (e.g., "Metformin" ↔ "met four men", "ramipril" ↔ "ram a pill", "BNF" ↔ "B and F"). Build this lexicon once per specialty; cache it in the prompt header.
- **Stage-aware vocabulary bias.** ST1 in A&E uses different vocabulary than ST3 in GP. Pass the stage so the model favours likely terminology ("ED" vs "surgery", "MEWS" vs "QOF").
- **Prior cleaned segments from the same conversation.** Continuity across audio chunks — preserves capitalisation choices ("Mr A" vs "Mr A.") and acronym expansions.
- **No need for chain-of-thought** here — this is a transformation task, not a reasoning task. Keep temp at 0.1.

### 8. Redaction

Curriculum data won't help much (PII is universal), but:

- **NHS-specific patterns.** NHS Trust naming conventions, GP practice names ("…Surgery", "…Medical Centre"), training programme/deanery names. These are NHS structural patterns the model may not redact consistently.
- **Stage/role context** to disambiguate ambiguous names. "The trainee is an ST2 in a Birmingham deanery" → the model is less likely to redact "Birmingham" out of clinical context like "Birmingham vasculitis score" (which it should preserve as a medical term).
- **Few-shot per category.** Current prompt has a table of entity types; replace 2–3 categories with worked examples ("Input: 'I called Dr Patel about the case' → Output: 'I called [NAME] about the case'"). Tables underperform examples for extraction tasks.
- **Lower temperature is already 0** — good; consider explicit `seed` for fully deterministic output (important for audit trails in NHS context).

### Highest-leverage changes ranked

If you can only do 3 things:

1. **Add stage-specific capability descriptors** to `CapabilityDefinition` and inject them into the Tag Capabilities + Generate PDP prompts. This is a schema extension, not just a prompt tweak — but it fixes the deepest grounding gap (the LLM is currently grading against a one-size-fits-all definition of each capability).
2. **Add few-shot anchor examples** to Classify (entry-type confusables) and Check Completeness (shallow vs adequate vs rich per section). Single biggest improvement on Day-1 output quality with no schema change.
3. **Reorder Zod schemas so reasoning fields come before answer fields** across all 6 portfolio-graph prompts. Free win — no prompt change needed, just key order in the schema. Forces chain-of-thought before commitment, which is documented to improve accuracy 10–30% on classification and rubric tasks.

---

## Sources

- [OpenAI Best practices for prompt engineering](https://help.openai.com/en/articles/6654000-best-practices-for-prompt-engineering-with-the-openai-api)
- [OpenAI Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI Prompt Engineering Best Practices 2026](https://promptbuilder.cc/blog/openai-prompt-engineering-guide-best-practices-2026)
- [Prompt Engineering Best Practices 2026 — Wiegold](https://thomas-wiegold.com/blog/prompt-engineering-best-practices-2026/)
- [PromptHub — Chain of Thought Prompting Guide](https://www.prompthub.us/blog/chain-of-thought-prompting-guide)
- [Prompting Guide — Few-Shot Prompting](https://www.promptingguide.ai/techniques/fewshot)
- [IBM — What is few-shot prompting?](https://www.ibm.com/think/topics/few-shot-prompting)
- ["According to ..." — Prompting Language Models Improves Quoting (arXiv)](https://arxiv.org/pdf/2305.13252)
- [Microsoft — Best Practices for Mitigating Hallucinations in LLMs](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/best-practices-for-mitigating-hallucinations-in-large-language-models-llms/4403129)
- [Neptune — A Researcher's Guide to LLM Grounding](https://neptune.ai/blog/llm-grounding)
- [Promptfoo — How to Measure and Prevent LLM Hallucinations](https://www.promptfoo.dev/docs/guides/prevent-llm-hallucations/)
- [PulseGeek — Prompt Evaluation Rubric Examples](https://pulsegeek.com/articles/prompt-evaluation-rubric-examples-scoring-criteria-test-sets-and-a-b-methods/)
- [RULERS — Locked Rubrics and Evidence-Anchored Scoring (arXiv)](https://arxiv.org/pdf/2601.08654)
- [Braintrust — What is prompt evaluation?](https://www.braintrust.dev/articles/what-is-prompt-evaluation)
