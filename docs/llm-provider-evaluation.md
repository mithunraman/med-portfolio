# LLM Provider Evaluation: OpenAI vs Groq

**Status**: Research / planning — not yet implemented
**Date**: 2026-05-17
**Decision**: Pending. Resume here when ready to act.

---

## 1. Current LLM prompt inventory (backend)

All 8 prompts run through `llmService.invokeStructured<T>()` (OpenAI structured outputs with Zod schemas).

### Processing pipeline (pre-classification)

| # | Stage | File | Model | Temp | Purpose |
|---|---|---|---|---|---|
| 1 | Cleaning | [apps/api/src/processing/prompts/cleaning.prompt.ts:3-37](../apps/api/src/processing/prompts/cleaning.prompt.ts#L3-L37) | GPT-5.4-nano | 0.1 | Fix medical terminology in speech-to-text (e.g. "met four men" → "Metformin") |
| 2 | PII redaction | [apps/api/src/processing/prompts/redaction.prompt.ts:3-57](../apps/api/src/processing/prompts/redaction.prompt.ts#L3-L57) | GPT-5.4-nano | 0 | Second-pass PII catch after regex; tags `[NAME]`, `[ORGANISATION]`, etc. |

### Portfolio graph nodes

| # | Stage | File | Model | Temp | Purpose |
|---|---|---|---|---|---|
| 3 | Classify | [apps/api/src/portfolio-graph/nodes/classify.node.ts:73-101](../apps/api/src/portfolio-graph/nodes/classify.node.ts#L73-L101) | GPT-4.1 | 0.1 | Pick portfolio entry type for trainee's specialty |
| 4 | Check completeness | [apps/api/src/portfolio-graph/nodes/check-completeness.node.ts:66-104](../apps/api/src/portfolio-graph/nodes/check-completeness.node.ts#L66-L104) | GPT-4.1 | 0.1 | Assign transcript content to template sections, rate depth |
| 5 | Generate followup | [apps/api/src/portfolio-graph/nodes/generate-followup.node.ts:43-89](../apps/api/src/portfolio-graph/nodes/generate-followup.node.ts#L43-L89) | GPT-4.1 | 0.3 | Micro-questions for incomplete sections |
| 6 | Reflect / format | [apps/api/src/portfolio-graph/nodes/reflect.node.ts:60-113](../apps/api/src/portfolio-graph/nodes/reflect.node.ts#L60-L113) | GPT-4.1-mini | 0.1 | Organise transcript into sections using only trainee's own words |
| 7 | Tag capabilities | [apps/api/src/portfolio-graph/nodes/tag-capabilities.node.ts:75-103](../apps/api/src/portfolio-graph/nodes/tag-capabilities.node.ts#L75-L103) | GPT-4.1 | 0.1 | Per-capability yes/no recognition against curriculum |
| 8 | Generate PDP | [apps/api/src/portfolio-graph/nodes/generate-pdp.node.ts:72-119](../apps/api/src/portfolio-graph/nodes/generate-pdp.node.ts#L72-L119) | GPT-4.1 | 0.2 | 1–2 SMART goals from trainee-identified learning needs |

### Nodes without LLM calls
`ask-followup`, `ask-clarification`, `present-classification`, `present-capabilities`, `gather-context` — interrupt-only or pure assembly.

---

## 2. Groq alternative mapping (cost-first)

Groq pricing reference: https://groq.com/pricing

| Current (OpenAI) | Groq alternative | Input $/M | Output $/M | Speed |
|---|---|---|---|---|
| GPT-5.4-nano | Llama 3.1 8B Instant | $0.05 | $0.08 | 840 TPS |
| GPT-5.4-nano | GPT-OSS-20B | $0.075 | $0.30 | 1000 TPS |
| GPT-4.1 | GPT-OSS-120B | $0.15 | $0.60 | 500 TPS |
| GPT-4.1 | Llama 3.3 70B Versatile | $0.59 | $0.79 | 394 TPS |
| GPT-4.1-mini | Llama 4 Scout | $0.11 | $0.34 | 594 TPS |

---

## 3. Cost estimate per artefact

Token estimates per full artefact pipeline:

| Stage | Input tok | Output tok |
|---|---|---|
| Cleaning | 1,600 | 1,200 |
| Redaction | 1,800 | 1,200 |
| Classify | 2,700 | 200 |
| Completeness | 2,700 | 800 |
| Followup | 2,500 | 500 |
| Reflect | 3,000 | 1,500 |
| Capabilities | 4,500 | 800 |
| PDP | 3,000 | 600 |
| **Total** | **21,800** | **6,800** |

### Cost comparison

| Tier | OpenAI | Groq (cheapest swap) | Savings |
|---|---|---|---|
| Nano stages (cleaning + redaction) | $0.00113 | $0.00036 | 3.1× |
| GPT-4.1 stages (×5) | $0.0540 | $0.00405 | 13.3× |
| GPT-4.1-mini stage | $0.0036 | $0.00084 | 4.3× |
| **Per artefact** | **~$0.059** | **~$0.0053** | **~11×** |

### At scale

| Artefacts / month | OpenAI | Groq cost-min |
|---|---|---|
| 1,000 | $59 | $5.30 |
| 10,000 | $590 | $53 |
| 100,000 | $5,900 | $530 |

**Caveats**: followup loop runs 1–3× per artefact (add ~$0.01 OpenAI / $0.001 Groq per round). Capability prompt is the cost driver; prompt-caching can shave 30–40%. Transcription (AssemblyAI) not included.

---

## 4. GDPR / data residency analysis

### Groq position (from their DPA)
- **No UK/EEA data residency.** DPA states data "may be transferred and processed in the United States and other countries."
- EU SCCs Module 2 + UK IDTA incorporated — transfers are *legally permitted* but data leaves UK/EEA.
- DPA: https://console.groq.com/docs/legal/customer-data-processing-addendum
- Sub-processor list: https://trust.groq.com/subprocessors
- Data deletion: within 180 days of termination

### Current OpenAI position (confirmed)
- [apps/api/src/llm/llm.service.ts:141-148](../apps/api/src/llm/llm.service.ts#L141-L148): `ChatOpenAI` constructed with no `baseURL` → defaults to `https://api.openai.com/v1` (US infrastructure).
- No endpoint env var exists in [apps/api/src/config/app.config.ts](../apps/api/src/config/app.config.ts).
- **Conclusion**: residency gap exists today regardless of Groq.

### Sector-specific concerns (UK medical)
- NHS Digital DSPT and National Data Guardian standards prefer UK/EEA hosting for clinical reflection data — even when patient identifiers are redacted.
- Trainee remains a data subject under UK GDPR for every LLM call, not just pre-redaction ones.
- Some trusts have explicit no-US-LLM policies.

### Residency fix options (independent of Groq decision)
1. **OpenAI EU endpoint** (`eu.api.openai.com` + ZDR) — smallest code change; requires Enterprise/Team contract.
2. **Azure OpenAI UK South / West Europe** — mature DPA, NHS-friendly; bigger refactor.
3. **AWS Bedrock `eu-west-2`** — unlocks Claude/Llama/Mistral with UK residency.

**Important**: pre-redaction calls (cleaning, redaction itself) see raw PII. Highest-sensitivity calls.

---

## 5. Benchmark verdict by use case

Sources: [llm-stats](https://llm-stats.com/), [Vellum](https://www.vellum.ai/blog/llama-3-3-70b-vs-gpt-4o), [Helicone](https://www.helicone.ai/blog/meta-llama-3-3-70-b-instruct), [Meta Llama 4](https://www.llama.com/models/llama-4/), [NEJM AI: LLM Anonymizer](https://ai.nejm.org/doi/full/10.1056/AIdbp2400537), [OpenAI GPT-OSS](https://openai.com/index/introducing-gpt-oss/).

### Headline benchmarks

| Model | MMLU | MMLU-Pro | IFEval | Tool/JSON |
|---|---|---|---|---|
| GPT-4.1 (OpenAI) | ~90% | — | strong | strict mode |
| GPT-OSS-120B (Groq) | 87–90% | ~79% | strong | matches o4-mini on Tau-Bench |
| Llama 3.3 70B (Groq) | 86% | 68.9% | **92.1%** | mature, well-tested |
| Llama 4 Scout (Groq) | 79.6% | 74.3% | DPO-tuned | "potential challenges in structured-output fidelity" |
| GPT-OSS-20B (Groq) | ~70% | — | mid | supports tools |
| Llama 3.1 8B (Groq) | 68.4% | — | weak | weak structured output |

### Notable findings
- **PII redaction**: Llama-3 70B achieves 99.24% PII success — lowest false-negative rate among tested LLMs (NEJM AI study). Strongly relevant for redaction stage.
- **Llama 3.3 70B IFEval (92.1%)** beats GPT-4o (84.6%) — important because portfolio prompts are heavily instruction-bound.
- **Llama 4 Scout flagged** for structured-output fidelity — risky for reflect stage where preserving exact wording is the hard constraint.

### Structured-output risk (cross-cutting)
Current `invokeStructured<T>()` relies on OpenAI's **strict JSON schema mode** (`response_format: json_schema`, `strict: true`). Groq supports JSON mode and tool calling but **not strict schema enforcement**. Expect schema-pass-rate drops on deeper nested schemas (completeness section assignments, capability arrays).

Mitigation: retry-on-parse-failure with validation error fed back; Zod `safeParse` + single repair pass before throwing; track `schema_pass_rate` per call site.

---

## 6. Recommended Groq stack at OpenAI budget (~$0.059/artefact)

**Strategy**: stop optimising for cost, upgrade every stage to strongest viable Groq model, spend headroom on quality-safety mechanisms.

| Stage | Recommended model | Rationale |
|---|---|---|
| Cleaning | Llama 3.3 70B | Medical knowledge required; nano models will mis-recover UK drug names |
| Redaction | Llama 3.3 70B + verifier pass | 99.24% PII success documented; verifier catches false negatives |
| Classify | GPT-OSS-120B | OpenAI-trained → schema honouring; matches o4-mini on tool use |
| Completeness | Llama 3.3 70B | 92.1% IFEval — beats GPT-4o on "assign to ONE section" instructions |
| Followup | Llama 3.3 70B | Instruction discipline for "ONE specific aspect per question" |
| Reflect | Llama 3.3 70B | Fidelity to user wording — bigger model = less paraphrasing drift |
| Capabilities | Llama 3.3 70B + self-consistency (n=3, majority vote) | 50+ independent yes/no judgements benefit from voting |
| PDP | GPT-OSS-120B | Strong structured output; lower cost frees budget for capabilities voting |

### Cost breakdown

| Line item | Cost |
|---|---|
| Cleaning (3.3 70B) | $0.00189 |
| Redaction (3.3 70B) | $0.00201 |
| Redaction verifier (3.3 70B) | $0.00104 |
| Classify (OSS-120B) | $0.00053 |
| Completeness (3.3 70B) | $0.00222 |
| Followup (3.3 70B) | $0.00187 |
| Reflect (3.3 70B) | $0.00296 |
| Capabilities (3.3 70B × 3 voting) | $0.00987 |
| PDP (OSS-120B) | $0.00081 |
| Schema-repair retry budget (10%) | $0.00200 |
| **Total** | **~$0.0252** |

**Headroom remaining**: ~$0.034 vs $0.059 OpenAI budget.

### Quality safety mechanisms added
1. **Self-consistency on capabilities (n=3 + majority vote)** — run same prompt 3× at temp 0.3, intersect high-confidence capabilities.
2. **Redaction verifier pass** — second LLM call given original + redacted output, asked to list any remaining PII.
3. **Schema-repair retry on parse failure** — on `safeParse` failure, send validation error back for single repair attempt.
4. **Temperature discipline** — 0–0.1 on extraction stages (classify, completeness, redaction, reflect, capabilities); 0.2–0.3 only on generative stages (followup, PDP).

### Further-quality options (still within budget)
- Capabilities self-consistency n=5 instead of 3 — adds ~$0.007
- Dual-model classify (3.3 70B + GPT-OSS-120B, flag disagreement) — adds ~$0.002
- Reflect verifier ("does this preserve trainee's exact wording?") — adds ~$0.002
- A/B test Qwen3 32B (reasoning model, cheaper than 3.3 70B) for completeness stage

---

## 7. Open questions / next actions

1. **Residency decision first.** Groq doesn't fix UK/EEA residency — neither does current OpenAI setup. Decide target (OpenAI EU endpoint vs Azure UK South vs Bedrock eu-west-2) before model-quality work.
2. **Validate benchmark extrapolation.** Build shadow-evaluation harness comparing OpenAI vs recommended Groq stack on 50-artefact sample. Cost: <$5. Compare (a) schema-pass rate, (b) classification agreement, (c) human-rated quality.
3. **Adapter refactor.** [apps/api/src/llm/llm.service.ts:141-148](../apps/api/src/llm/llm.service.ts#L141-L148) currently hardcodes `ChatOpenAI` with no configurable `baseURL`. Needs per-call-site provider strategy + Zod schema repair layer for Groq.
4. **Prompt caching.** Capability prompt (~4,500 input tokens × 3 voting runs) is the cost concentration. Groq offers 50% cached-input discount — worth instrumenting.
5. **Transcription separately.** AssemblyAI residency status unknown. Whisper Large v3 Turbo on Groq is $0.04/hour but US-hosted and needs PII-pipeline rework.

---

## 8. Resume checklist

When resuming:
- [ ] Decide residency target (drives whether Groq is even on the table for production)
- [ ] If Groq is viable: build shadow harness, run on 50 artefacts
- [ ] Add `baseURL` + provider config to `llm.service.ts`
- [ ] Implement schema-repair retry wrapper around `invokeStructured`
- [ ] Implement self-consistency wrapper for capabilities node
- [ ] Implement redaction verifier pass
- [ ] Confirm OpenAI EU endpoint cost/contract before assuming Groq is the answer
