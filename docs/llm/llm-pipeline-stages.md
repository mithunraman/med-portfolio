# LLM Pipeline Stages & Providers

> **Scope.** This document is the canonical map of every AI/LLM stage in the backend:
> what each stage does, how its prompt is built, and which model/provider currently
> runs it. It is derived directly from the source (`apps/api/src/...`) — where a doc
> and the code disagree, **the code is the source of truth**.
>
> Last verified against source: 2026-07.

---

## 1. Providers at a glance

Two external AI providers are used. **Nothing else in the codebase instantiates an
AI client directly** — every call funnels through one service.

| Provider | Used for | Entry point |
|---|---|---|
| **OpenAI** (via LangChain `ChatOpenAI`) | All text generation, grading, classification, cleaning, redaction | `LLMService.invokeStructured<T>()` |
| **AssemblyAI** | Audio → text transcription only | `LLMService.transcribeAudio()` |

Both live in [`apps/api/src/llm/llm.service.ts`](../../apps/api/src/llm/llm.service.ts).

### Model registry

Defined in `llm.service.ts` (`OpenAIModels`). Default model is **`gpt-4.1-mini`**
(`DEFAULT_MODEL`) — any node that does not pass an explicit `model` resolves to it.

| Alias in code | Model | Where used |
|---|---|---|
| `GPT_5_4` | `gpt-5.4` | refine |
| `GPT_5_4_NANO` | `gpt-5.4-nano` | cleaning, redaction |
| `GPT_4_1` | `gpt-4.1` | generate_followup, elicit_justification, reflect, generate_pdp |
| `GPT_4_1_MINI` | `gpt-4.1-mini` (default) | classify, check_completeness, tag_capabilities |

### How OpenAI calls are made

All OpenAI calls go through `invokeStructured<T>(messages, schema, options)`, which uses
LangChain's `withStructuredOutput(zodSchema)` so the model is constrained (via function
calling) to return an object matching a Zod schema. Defaults: `temperature 0.1`,
`maxTokens 2000`, 3-attempt exponential backoff, Sentry capture on failure.

### Provider variants (`LLM_VARIANT`)

The per-stage model map is no longer hardcoded. `LLM_VARIANT` selects one complete
**stage → model target** profile from `VARIANTS`
([`llm/model-variants.ts`](../../apps/api/src/llm/model-variants.ts)); `ModelConfigService.resolve(stage)`
returns the target and call sites never name a provider. Flipping the env var swaps every
stage's model with zero call-site edits. The tables in §3/§4/§6 below describe **Variant A**
(the OpenAI baseline).

| Variant | Provider / route | Model | Quota pool | Structured output |
|---|---|---|---|---|
| **A** *(default)* | OpenAI direct | Per-stage GPT mix (see §6) | `openai` | function calling |
| **B** | DeepSeek via OpenRouter (Atlas Cloud) | DeepSeek V4 Flash | `openrouter` | `json_schema` |
| **C** | DeepSeek via OpenRouter (Atlas Cloud) | DeepSeek V4 Pro | `openrouter` | `json_schema` |
| **D** | DeepSeek via **Azure AI Foundry** (OpenAI-compatible `/openai/v1`) | DeepSeek V4 Flash | `analysis` | `json_schema` |
| **E** | gpt-oss-120b via OpenRouter (DeepInfra, bf16) | gpt-oss-120b | `openrouter` | `json_schema` |
| **F** | **Split** — both on Azure AI Foundry | `gpt-5.4-nano` (cleaning) + DeepSeek V4 Flash (graph) | `interactive` + `analysis` | function calling / `json_schema` |

Variants B–E route **every** stage to the same model. They use `json_schema` rather than
function calling because DeepSeek's native tool-call format isn't normalized into OpenAI
`tool_calls`. **Variant F is the first non-uniform profile** — the per-stage table was built for
exactly this: cleaning runs on GPT-5.4-nano (which normalizes `tool_calls` properly, so it uses
native function calling) while the eight graph stages stay on DeepSeek.

Non-OpenAI providers require their credentials (`OPENROUTER_API_KEY`, or the pool-scoped
`AZURE_FOUNDRY_<POOL>_API_KEY_<i>` / `_BASE_URL_<i>`), enforced **per pool** at startup by
`ModelConfigService`. Reasoning control differs per provider (owned by
`LLMService.azureFoundryKwargs` / `openrouterKwargs`): on Foundry, DeepSeek V4 Flash runs
non-thinking by default and **rejects** DeepSeek's native `thinking` / `enable_thinking` params
(both 400), so `off` sends **no** reasoning param (`high`/`max` use the standard OpenAI
`reasoning_effort`); OpenRouter instead uses its normalized `reasoning` map.

### Quota pools

A **pool** ([`llm/llm-pools.ts`](../../apps/api/src/llm/llm-pools.ts)) is a named set of
interchangeable credentials sharing one quota policy. It is deliberately independent of the
model: on Foundry an (apiKey, baseURL) pair identifies a *resource*, and one resource hosts many
*deployments*. Rate-limiter bucket identity is therefore `(pool, indexWithinPool)` — two pools
each have an endpoint 0, and they are different quotas.

| Pool | Serves | Cap (env) | Keys |
|---|---|---|---|
| `interactive` | cleaning — user-paced, blocks the message appearing | `LLM_RPM_INTERACTIVE` (60) | 1 |
| `analysis` | the eight graph stages — machine-paced ~9-call bursts | `LLM_RPM_ANALYSIS` (35) | 2+ |
| `openai` / `openrouter` | implicit single-key pools | `LLM_MAX_REQUESTS_PER_MINUTE` (18) | 1 |

Pools exist for **two independent reasons**, and both must hold before merging any two of them:

1. **Quota** — each Azure resource has its own cap, and a limiter can only honour a per-key cap
   if it is per-key.
2. **Workload isolation** — a machine-paced analysis burst must never consume the rate-limiter
   slots interactive work needs. This holds *even if the caps converge*, so do not collapse
   pools on the grounds that their numbers match.

Routing within a pool is `hash(conversationId) % N` — sticky across restarts. **Consequence:** a
conversation is pinned to ONE key per pool, so its own throughput is bound by that key's cap
regardless of `N`. At 35 rpm the derived `minTime` is ~1714 ms, so a 9-call analysis turn spends
~15 s in pacing alone. To make a single journey faster, raise the pool's cap — adding keys
raises aggregate concurrency across users, never one journey's speed.

---

## 2. The two pipelines

A message travels through **two** distinct pipelines:

1. **Message Processing Pipeline** — runs on *every* inbound message to produce clean,
   de-identified text.
2. **Portfolio-Graph (LangGraph) Analysis** — a checkpointed state machine that turns the
   accumulated transcript into a structured portfolio artefact.

```
                    ┌─────────────── Message Processing (per message) ───────────────┐
  audio/text  ──►   Transcription ──► Cleaning ──► Redaction   ──►  clean transcript
                    (AssemblyAI)      (nano)       (regex+nano)
                                                                          │
                    ┌───────────────── Portfolio-Graph (per analysis run) ▼──────────┐
  gather_context ─► classify ─► [present_classification] ─► check_completeness
        ▲                                                        │
        │                                          ┌──── gaps ───┴──── enough ────┐
        └─── ask_followup ◄─ generate_followup ◄───┘                              ▼
                                                                      tag_capabilities
                                                                              │
                          [present_capabilities] ─► elicit_justification ─► reflect
                                                                              │
                                        generate_pdp ◄─ refine ◄──────────────┘
                                              │
                                             save ─► END
```

`[bracketed]` nodes are **interrupt points** that pause the graph for user input.

---

## 3. Message Processing Pipeline

Orchestrated by [`processing.service.ts`](../../apps/api/src/processing/processing.service.ts).
Three content fields evolve through the pipeline:

`rawContent` (original input / transcript) → `cleanedContent` (post-cleaning) → `content` (final, de-identified — used for display and analysis)

Status transitions: audio → `TRANSCRIBING → CLEANING → DEIDENTIFYING → COMPLETE`;
text skips transcription.

### 3.1 Transcription (audio only)

- **Purpose.** Convert an audio message to text, tuned for UK clinical speech.
- **Provider / model.** **AssemblyAI — Universal-3 Pro** (`speech_models: ['universal-3-pro']`), `language_code: en_uk`, EU endpoint (`api.eu.assemblyai.com`).
- **Prompt architecture.** Not a chat prompt — configured via a `keyterms_prompt` of
  ~200 UK medical terms (drugs, conditions, labs, NHS/ARCP vocabulary) from
  `medical-keyterms.ts` to bias recognition. 2-minute timeout (`Promise.race`), timeouts not retried.
- **Output.** `{ text, confidence, audioDurationMs, wordCount }` → becomes `rawContent`.
- **Note.** No PII redaction happens here (no `redact_pii` flag) — redaction is a later, dedicated stage.
- **Source.** [`stages/transcription.stage.ts`](../../apps/api/src/processing/stages/transcription.stage.ts), `llm.service.ts` `transcribeAudio`.

### 3.2 Cleaning

- **Purpose.** Fix medical terminology, remove filler words, add punctuation and paragraph structure — a faithful copy-edit that must **not** change meaning.
- **Provider / model.** OpenAI **`gpt-5.4-nano`**, temperature `0.1`.
- **Prompt architecture.** Single system prompt `CLEANING_PROMPT` (see
  [`prompts/cleaning.prompt.ts`](../../apps/api/src/processing/prompts/cleaning.prompt.ts))
  with an explicit prompt-injection guard (transcript is treated as data, not instructions).
- **Output schema.** `cleaningResponseSchema` → `{ cleanedTranscript }`. Produces `cleanedContent`.
- **Source.** [`stages/cleaning.stage.ts`](../../apps/api/src/processing/stages/cleaning.stage.ts).

### 3.3 Redaction (PII de-identification)

- **Purpose.** Remove personally identifying information while **preserving** clinically
  meaningful text (eponymous conditions like Parkinson's, drug names, clinical scales,
  relative dates, ages, generic roles).
- **Provider / model.** Two layers:
  1. **Regex (deterministic)** — structured UK PII with typed placeholders
     (`[NHS-NUMBER]`, `[NI-NUMBER]`, `[POSTCODE]`, `[EMAIL]`, `[PHONE]`, `[DOB]`, …) via
     [`utils/pii-regex.ts`](../../apps/api/src/processing/utils/pii-regex.ts).
  2. **LLM (contextual)** — OpenAI **`gpt-5.4-nano`**, temperature `0` — catches
     unstructured PII: names → `[NAME]`, organisations → `[ORGANISATION]`, addresses → `[LOCATION]`.
- **Prompt architecture.** System prompt `REDACTION_PROMPT`
  ([`prompts/redaction.prompt.ts`](../../apps/api/src/processing/prompts/redaction.prompt.ts))
  with detailed preserve/redact rules and an injection guard; preserves regex placeholders from layer 1.
- **Output schema.** `redactionResponseSchema` → `{ needsRedaction, redactedText, redactedEntities[] }`. Produces the final `content`.
- **Source.** [`stages/redaction.stage.ts`](../../apps/api/src/processing/stages/redaction.stage.ts).

---

## 4. Portfolio-Graph (LangGraph) Analysis

A `StateGraph` compiled with a MongoDB checkpointer
([`portfolio-graph.builder.ts`](../../apps/api/src/portfolio-graph/portfolio-graph.builder.ts),
[`portfolio-graph.service.ts`](../../apps/api/src/portfolio-graph/portfolio-graph.service.ts)).
State flows through nodes; four **interrupt** nodes pause for user input and resume from
the checkpoint. Loop limits: max 8 follow-up rounds, max 2 clarification rounds,
classification confidence threshold 0.7.

### Nodes without an LLM call

| Node | Role |
|---|---|
| `gather_context` | Assembles `fullTranscript` from conversation messages |
| `present_classification` *(interrupt)* | User confirms/overrides entry type — resumes with `{ entryType }` |
| `ask_clarification` *(interrupt)* | Asks for clarification when confidence is low — resumes with a signal |
| `ask_followup` *(interrupt)* | Presents follow-up questions — resumes with a signal |
| `present_capabilities` *(interrupt)* | User selects capabilities — resumes with `{ selectedCodes[] }` |
| `save` | Validation gate; sets `draftStatus` before `END` |

### LLM nodes

Each row: purpose · model (temp / maxTokens) · schema · source.

#### 4.1 classify
- **Purpose.** Pick the best-matching portfolio entry type for the specialty, gate relevance, and emit a (later down-adjusted) confidence.
- **Model.** `gpt-4.1-mini` *(default)* — temp `0.1`, maxTokens `800`.
- **Prompt architecture.** `classificationPrompt` (system + human `ChatPromptTemplate`) with a prompt-injection guard. Response schema is built dynamically per specialty via `buildSpecialtySchema(validCodes)` so `entryType` is enum-constrained to that specialty's codes.
- **Output schema.** `classifyResponseSchema` → `{ reasoning, signalsFound, isRelevant, entryType, confidence, alternatives }`.
- **Source.** [`nodes/classify.node.ts`](../../apps/api/src/portfolio-graph/nodes/classify.node.ts).

#### 4.2 check_completeness
- **Purpose.** Grade how well the transcript covers each template section — partition every idea to a section, then tier each covered section (strong / adequate / shallow) against a depth rubric. Drives the follow-up loop.
- **Model.** `gpt-4.1-mini` *(default)* — temp `0.1`, maxTokens `2000`.
- **Prompt architecture.** `completenessPrompt` (versioned `completeness-v2-tier`). Schema built dynamically via `buildAssessableSchema(assessableIds)` to constrain `assignments`/`sectionGrades` to real section ids.
- **Output schema.** `completenessResponseSchema` → `{ assignments[], sectionGrades[] }`; code derives readiness/score.
- **Source.** [`nodes/check-completeness.node.ts`](../../apps/api/src/portfolio-graph/nodes/check-completeness.node.ts).

#### 4.3 generate_followup
- **Purpose.** Generate a single, leverage-ranked Socratic follow-up question targeting the weakest unmet rubric dimension, with anti-redundancy against previously asked questions. **The stage that helps the author think and complete their portfolio.**
- **Model.** `gpt-4.1` — temp `0.3`, maxTokens `1000`.
- **Prompt architecture.** Composed from a static, cacheable `FOLLOWUP_SYSTEM_INSTRUCTIONS` prefix + a per-call `FOLLOWUP_CONTEXT` (assembled in `followupPrompt`). One question per round (`MAX_QUESTIONS_PER_ROUND = 1`); falls back to default questions on failure.
- **Output schema.** `followupQuestionsResponseSchema` → array of `{ sectionId, unmetDimension, question, hints.examples }`.
- **Source.** [`nodes/generate-followup.node.ts`](../../apps/api/src/portfolio-graph/nodes/generate-followup.node.ts).

#### 4.4 tag_capabilities
- **Purpose.** Grade every curriculum capability against its descriptor using verbatim-quote evidence, with anti-inflation rules; keep only `adequate`+ with a real quote, capped at 5.
- **Model.** `gpt-4.1-mini` *(default)* — temp `0.1`, maxTokens `2000`.
- **Prompt architecture.** `tagCapabilitiesPrompt` (versioned `tag-v3-anti-inflation`). Recognition-based grading with explicit anti-inflation guardrails; post-filter verifies each quote appears in the transcript.
- **Output schema.** `tagCapabilitiesResponseSchema` → array of `{ code, quote, reasoning, tier }`.
- **Source.** [`nodes/tag-capabilities.node.ts`](../../apps/api/src/portfolio-graph/nodes/tag-capabilities.node.ts).

#### 4.5 elicit_justification
- **Purpose.** Write a first-person, paste-ready justification linking the trainee's own action (verbatim source quote) to a specific descriptor clause; graded on a tier ladder.
- **Model.** `gpt-4.1` — temp `0.3`, maxTokens `1500`.
- **Prompt architecture.** `justificationPrompt` with faithfulness rules (must ground in the source quote). Post-processing enforces first person and downgrades unverifiable quotes.
- **Output schema.** `elicitJustificationResponseSchema` → array of `{ code, sourceQuote, descriptorClause, justification, justificationTier }`.
- **Source.** [`nodes/elicit-justification.node.ts`](../../apps/api/src/portfolio-graph/nodes/elicit-justification.node.ts).

#### 4.6 reflect
- **Purpose.** Compose the transcript into structured template sections and section narratives (organise + copy-edit, **not** invent) and produce a title.
- **Model.** `gpt-4.1` — temp `0.3`, maxTokens dynamic (`max(transcriptWords × 2, 2000)`).
- **Prompt architecture.** `reflectPrompt` with strict faithfulness rules. Output runs through a **deterministic fabrication tripwire** (`compose-verify.util.ts`, `verifyComposed`) — telemetry only — that flags novel numbers/words.
- **Output schema.** `reflectResponseSchema` → `{ title, sections[] (probes[], narrative) }` → assembled into `composedDocument`.
- **Source.** [`nodes/reflect.node.ts`](../../apps/api/src/portfolio-graph/nodes/reflect.node.ts).

#### 4.7 refine
- **Purpose.** Final prose polish — merge restatements and smooth the composed document per section, faithfully (no new facts or sentiment). The only stage on the flagship model.
- **Model.** `gpt-5.4` — temp `0`, maxTokens dynamic (`max(wordCount × 2, 1000)`).
- **Prompt architecture.** `refinePrompt` (per-section polish with faithfulness constraints). Keeps the original section text if a section is omitted/blank; falls back to reflect output on failure.
- **Output schema.** `refineResponseSchema` → `{ sections[] (sectionId, text) }` → updates `composedDocument`.
- **Source.** [`nodes/refine.node.ts`](../../apps/api/src/portfolio-graph/nodes/refine.node.ts).

#### 4.8 generate_pdp
- **Purpose.** Generate 1–2 SMART Personal Development Plan goals (with actions and intended evidence) grounded in the trainee's expressed learning needs from the reflection.
- **Model.** `gpt-4.1` — temp `0.3`, maxTokens `1000`.
- **Prompt architecture.** `generatePdpPrompt`; the human message is the **composed reflection**, not the raw transcript. Post-validation caps goals (2) and actions per goal (3).
- **Output schema.** `generatePdpResponseSchema` → `{ goals[] (learningNeed, goal, actions[]) }`.
- **Source.** [`nodes/generate-pdp.node.ts`](../../apps/api/src/portfolio-graph/nodes/generate-pdp.node.ts).

---

## 5. Cross-cutting prompt-architecture conventions

- **Structured output everywhere.** Every OpenAI call is constrained to a Zod schema via
  `invokeStructured` → LangChain `withStructuredOutput`. Nodes never parse free text.
- **Dynamic enum-constrained schemas.** Stages that must return domain ids build their
  schema at call time (`buildSpecialtySchema`, `buildAssessableSchema`) so the model
  cannot hallucinate out-of-vocabulary codes.
- **Prompt versioning.** Grading prompts carry a version tag (`completeness-v2-tier`,
  `tag-v3-anti-inflation`) for traceability across changes.
- **Injection guards.** User-supplied transcript is framed as data, not instructions, in
  cleaning, redaction, and classify.
- **Faithfulness guardrails.** Generative stages (reflect, refine, elicit_justification,
  generate_pdp) carry explicit "do not invent" rules; reflect additionally has a
  deterministic fabrication tripwire.
- **System/context split for caching.** `generate_followup` separates a static, cacheable
  system prefix from per-call context.
- **Graceful degradation.** Nodes fall back to safe defaults (default questions, prior
  output, lowered confidence) rather than throwing.

---

## 6. Current stage → provider summary

| # | Stage | Pipeline | Provider / Model | Temp | maxTokens |
|--:|---|---|---|--:|--:|
| — | Transcription | Processing | AssemblyAI Universal-3 Pro | — | — |
| 1 | Cleaning | Processing | OpenAI `gpt-5.4-nano` | 0.1 | default |
| 2 | Redaction | Processing | regex + OpenAI `gpt-5.4-nano` | 0 | default |
| 3 | classify | Graph | OpenAI `gpt-4.1-mini` *(default)* | 0.1 | 800 |
| 4 | check_completeness | Graph | OpenAI `gpt-4.1-mini` *(default)* | 0.1 | 2000 |
| 5 | generate_followup | Graph | OpenAI `gpt-4.1` | 0.3 | 1000 |
| 6 | tag_capabilities | Graph | OpenAI `gpt-4.1-mini` *(default)* | 0.1 | 2000 |
| 7 | elicit_justification | Graph | OpenAI `gpt-4.1` | 0.3 | 1500 |
| 8 | reflect | Graph | OpenAI `gpt-4.1` | 0.3 | dynamic |
| 9 | refine | Graph | OpenAI `gpt-5.4` | 0 | dynamic |
| 10 | generate_pdp | Graph | OpenAI `gpt-4.1` | 0.3 | 1000 |

**All text stages are OpenAI under the default Variant A**, accessed via LangChain through the
single `LLMService.invokeStructured` chokepoint; audio transcription is AssemblyAI. Swapping a
provider for any stage is a matter of editing that stage's row in `VARIANTS` — all nine call
sites already spread `modelConfig.resolve(Stage.X)`, so no call site changes.

Under **Variant F** the same table becomes:

| # | Stage | Pipeline | Provider / Model | Pool |
|--:|---|---|---|---|
| 1 | Cleaning | Processing | Foundry `gpt-5.4-nano` | `interactive` |
| 3–10 | classify … generate_pdp | Graph | Foundry DeepSeek V4 Flash | `analysis` |

Redaction (§3.3) is Azure AI Language, not `LLMService`, so it is unaffected by variant or pool.
