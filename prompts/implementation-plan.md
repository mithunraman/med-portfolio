# RCGP-Compliant Reflect & Follow-up Redesign — Implementation Plan

## Background

The current Reflect node uses gpt-5.4 at temperature 0.4 to generate polished first-person portfolio reflections from trainee transcripts. This violates RCGP guidelines which prohibit AI from writing reflections — AI may only prompt, structure, and organise the trainee's own words.

The redesign shifts intelligence upstream into the follow-up loop (better questions, shallow-section detection) and reduces the Reflect node to a formatting/organising role.

### RCGP Principles Driving This Work

| #   | Principle                                                        | Test                                                           |
| --- | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| P1  | AI can prompt/structure reflection, but cannot do the reflecting | Does the reflective content come from the trainee's mouth?     |
| P2  | No "cut and paste" of AI output                                  | Would the trainee need to meaningfully edit before submission? |
| P3  | All content based on real patient encounters                     | Does every sentence trace back to the trainee's words?         |
| P4  | Trainee must develop reflective skills over time                 | Does the system teach reflection, not do it for them?          |
| P5  | No patient-identifiable information in AI tools                  | Is PII redacted before reaching any LLM?                       |

---

## Phase 1: Check-Completeness — Shallow Section Detection

### Objective

Enhance check-completeness to distinguish between sections that are covered-but-shallow ("I learned a lot") and sections that are genuinely well-covered. This enables the follow-up node to probe shallow reflective sections instead of accepting them.

### Scope

**Included:**

- New `depth` field in LLM response schema: `rich | adequate | shallow`
- Updated prompt with explicit depth definitions
- Updated graph state: `SectionCoverage` changes from `Record<string, boolean>` to `Record<string, SectionAssessment>`
- Updated `missingSections` derivation to include shallow sections

**Excluded:**

- No changes to the follow-up node (Phase 2)
- No changes to the reflect node (Phase 3)
- No frontend changes

### Implementation Plan

#### Step 1: Update the LLM response schema

**File:** `apps/api/src/portfolio-graph/nodes/check-completeness.node.ts`

Add `depth` to the Zod schema:

```typescript
const sectionAssessmentSchema = z.object({
  sectionId: z.string().describe('The section ID from the template'),
  covered: z
    .boolean()
    .describe('Whether the transcript contains ANY relevant information for this section'),
  depth: z
    .enum(['rich', 'adequate', 'shallow'])
    .describe(
      'How thoroughly the section is covered. ' +
        'rich = multiple specific points with reasoning or detail (2+ meaningful sentences). ' +
        'adequate = relevant content present with at least 1 specific detail. ' +
        'shallow = only vague or generic statements (e.g., "I learned a lot") with no specifics. ' +
        'If covered is false, set depth to "shallow".'
    ),
  evidence: z
    .string()
    .describe(
      'Brief quote or summary from the transcript that covers this section, or empty string if not covered'
    ),
});
```

#### Step 2: Update the prompt

Append to the existing Instructions section in the system prompt:

```
8. For each covered section, also assess the DEPTH of coverage:
   - "rich": The trainee provided multiple specific points, clinical reasoning,
     or detailed reflection (2+ meaningful sentences of relevant content).
   - "adequate": The trainee mentioned relevant content with at least one
     specific detail. Enough to work with.
   - "shallow": The trainee said something relevant but it is vague, generic,
     or lacks any specific detail.
     Examples: "I learned a lot", "it went well", "I found it useful".
9. If a section is not covered, set depth to "shallow".
10. Be particularly attentive to depth in reflective sections (reflection,
    learning, what went well, what could improve). Factual sections
    (presentation, findings, management) are usually either covered or not
    — depth matters less for them.
```

#### Step 3: Update graph state types

**File:** `apps/api/src/portfolio-graph/portfolio-graph.state.ts`

```typescript
// Replace:
export type SectionCoverage = Record<string, boolean>;

// With:
export interface SectionAssessment {
  covered: boolean;
  depth: 'rich' | 'adequate' | 'shallow';
}
export type SectionCoverage = Record<string, SectionAssessment>;
```

#### Step 4: Update post-processing in check-completeness node

Update the section coverage mapping and missingSections derivation:

```typescript
const sectionCoverage: SectionCoverage = {};
for (const assessment of response.sections) {
  if (assessableIds.has(assessment.sectionId)) {
    sectionCoverage[assessment.sectionId] = {
      covered: assessment.covered,
      depth: assessment.covered ? assessment.depth : 'shallow',
    };
  }
}

// Uncovered sections default to shallow
for (const section of assessableSections) {
  if (!(section.id in sectionCoverage)) {
    sectionCoverage[section.id] = { covered: false, depth: 'shallow' };
  }
}

// Missing = uncovered OR shallow (for required sections)
const missingSections = Object.entries(sectionCoverage)
  .filter(([, assessment]) => !assessment.covered || assessment.depth === 'shallow')
  .map(([id]) => id);
```

#### Step 5: Verify completenessRouter

**File:** `apps/api/src/portfolio-graph/portfolio-graph.builder.ts`

No change needed — `completenessRouter` already checks `state.hasEnoughInfo` and `state.followUpRound`. Since `missingSections` now includes shallow sections, `hasEnoughInfo` will be `false` when shallow sections exist, and the router automatically routes to `ask_followup`.

#### Step 6: Update downstream consumers

Grep for `sectionCoverage` across the codebase. Any code reading `sectionCoverage[id]` as a boolean must read `sectionCoverage[id].covered` instead. Key files:

- `ask-followup.node.ts`: Uses `state.missingSections`, not `sectionCoverage` directly — no change
- `portfolio-graph.service.ts`: Passes `missingSections` to interrupt payload — no change
- Test files: Update assertions to use new shape

### Deliverables

- Updated Zod schema with `depth` field
- Updated prompt with depth assessment instructions
- Updated `SectionCoverage` type from `boolean` to `SectionAssessment`
- Updated `missingSections` logic to include shallow sections
- Updated unit tests for check-completeness node

### Best Industry Patterns

- **Progressive enhancement**: Adding `depth` enriches the existing schema without breaking the binary `covered` field. Downstream code that only cares about covered/uncovered still works via `assessment.covered`.
- **Schema-driven validation**: Zod schema describes the depth options inline, so the LLM's structured output is validated at parse time. No manual enum checks needed.
- **Single responsibility**: The check-completeness node detects depth; the router decides what to do about it. The completeness node doesn't know about follow-ups.

### Code Guidance

- Keep the `covered` boolean alongside `depth` — don't replace it. Some code paths only need binary covered/uncovered.
- Put the `SectionAssessment` interface in the state file alongside `SectionCoverage` — they're tightly coupled.
- The depth enum descriptions in the Zod schema are the prompt for the LLM. Make them specific and include examples of what "shallow" looks like.

### Risks & Tradeoffs

- **False shallow detection**: The LLM might mark a brief-but-adequate response as shallow. Mitigation: the prompt defines shallow as "vague/generic with no specifics," not "short." A two-sentence response with specific clinical detail is adequate, not shallow.
- **Extra follow-up round**: Some entries that currently pass completeness will now trigger follow-ups for shallow sections. This adds ~30s to those entries. Acceptable tradeoff for RCGP compliance and richer output.

---

## Phase 2: Follow-up Node — Micro-Questions with Hints

### Objective

Upgrade the follow-up node to generate focused micro-questions (one specific angle per question) with optional collapsed hints that show example responses from different clinical scenarios. This is the core RCGP P1/P4 change — better questions elicit richer trainee-authored reflective content.

### Scope

**Included:**

- Updated follow-up prompt: micro-question generation + hints
- Updated LLM response schema: add `hints` per question
- Updated `FollowupQuestionSchema` in shared package
- Updated `FreeTextPromptSchema` in shared package to include hints
- New `PromptHintsSchema` in shared package
- Updated interrupt payload construction in `portfolio-graph.service.ts`
- Updated `formatMissingSectionBlock` to include depth status
- Model upgrade: gpt-4.1-mini → gpt-4.1 for this node
- maxTokens increase: 600 → 1000
- Updated `FreeTextPrompts` mobile component to render hints
- New `HintCard` mobile component

**Excluded:**

- Sequential question reveal (show all questions at once for now, iterate later)
- Per-question word gates
- Answer-to-question mapping/tagging

### Implementation Plan

#### Step 1: Update shared schemas

**File:** `packages/shared/src/dto/conversation.dto.ts`

```typescript
// New: hints schema
export const PromptHintsSchema = z.object({
  examples: z
    .array(z.string())
    .max(3)
    .describe('Short example responses showing expected depth, from DIFFERENT clinical scenarios'),
  reassurance: z
    .string()
    .describe('Brief normalising statement, e.g., "Even a short answer is useful here"'),
});
export type PromptHints = z.infer<typeof PromptHintsSchema>;

// Updated: add hints to FreeTextPromptSchema
export const FreeTextPromptSchema = z.object({
  key: z.string(),
  text: z.string(),
  hints: PromptHintsSchema,
});

// Updated: add hints to FollowupQuestionSchema
export const FollowupQuestionSchema = z.object({
  sectionId: z.string(),
  question: z.string(),
  hints: z.object({
    examples: z.array(z.string()).max(3),
    reassurance: z.string(),
  }),
});
```

#### Step 2: Update the follow-up LLM response schema

**File:** `apps/api/src/portfolio-graph/nodes/ask-followup.node.ts`

```typescript
const contextualisedQuestionSchema = z.object({
  sectionId: z.string().describe('The section ID this question is for'),
  question: z.string().describe('A focused micro-question targeting ONE specific aspect'),
  hints: z.object({
    examples: z
      .array(z.string())
      .max(3)
      .describe(
        'Short (1-sentence) example responses showing the expected depth. ' +
          "MUST use different clinical scenarios than the trainee's case. " +
          'Show what a good answer LOOKS LIKE, not what it should SAY.'
      ),
    reassurance: z
      .string()
      .describe('Brief normalising statement, e.g., "Even a short answer helps here"'),
  }),
});
```

#### Step 3: Rewrite the follow-up prompt

```typescript
const followupPrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are a supportive UK medical portfolio assistant helping a trainee complete a {templateName} entry.

The trainee has already told you about their experience, but some sections need more detail. Your job is to ask focused micro-questions — each targeting ONE specific aspect — with optional hints.

## Trainee Context

{trainingStageContext}

## Missing or Shallow Sections

{missingSectionBlock}

## Question Design Rules

1. Ask ONE specific micro-question per section.
   BAD: "What did you learn and would you do anything differently?"
   GOOD: "Was there a moment where you felt uncertain about your decision?"

2. For reflective sections (reflection, learning, what went well, what could improve), use focused angles:
   - Uncertainty: "Was there a point where you weren't sure what to do?"
   - What worked: "What felt right about how you handled this?"
   - What you'd change: "Is there anything you'd approach differently next time?"
   - Impact on practice: "Has this changed how you'll handle similar cases?"
   Choose the angle most relevant to what's missing. Ask ONE per section.

3. For factual sections (presentation, findings, management, outcome), ask directly for the missing information.

4. Reference what the trainee has already said — acknowledge their input before asking for more.

5. Keep questions warm and professional. Use "you" language. 1-2 sentences maximum.

## Hint Rules

For EACH question, generate 2-3 example response hints:
1. Hints are SHORT (1 sentence each) example responses.
2. Hints MUST use DIFFERENT clinical scenarios than the trainee's actual case.
   If the trainee described a chest pain case, use examples from dermatology,
   paediatrics, mental health, etc.
3. Hints demonstrate the LEVEL OF DETAIL expected, not the content.
4. Include a brief reassurance (e.g., "Even a short answer is useful here").
5. For reflective questions, normalise uncertainty and imperfection in hints.`,
  ],
  ['human', '{transcript}'],
]);
```

#### Step 4: Update missingSectionBlock formatter

Include depth information so the LLM knows whether a section is missing entirely vs shallow:

```typescript
function formatMissingSectionBlock(
  sections: TemplateSection[],
  sectionCoverage: SectionCoverage
): string {
  return sections
    .map((s) => {
      const assessment = sectionCoverage[s.id];
      const status = !assessment?.covered
        ? 'Not mentioned at all'
        : assessment.depth === 'shallow'
          ? 'Mentioned but vague — needs specific detail'
          : 'Needs more detail';

      return (
        `### ${s.id} — ${s.label}\n` +
        `Status: ${status}\n` +
        `What we need: ${s.description}\n` +
        `Default question: ${s.extractionQuestion}`
      );
    })
    .join('\n\n');
}
```

Pass `state.sectionCoverage` to this formatter (already available in graph state).

#### Step 5: Update model, temperature, and token budget

```typescript
const { data: response } = await deps.llmService.invokeStructured(
  messages,
  followupQuestionsResponseSchema,
  { model: OpenAIModels.GPT_4_1, temperature: 0.3, maxTokens: 1000 }
);
```

#### Step 6: Update interrupt payload construction

**File:** `apps/api/src/portfolio-graph/portfolio-graph.service.ts`

Update the `case 'followup'` block to pass hints through to `FreeTextQuestion`:

```typescript
case 'followup': {
  const questions = interruptValue.questions as Array<{
    sectionId: string;
    question: string;
    hints: { examples: string[]; reassurance: string };
  }>;

  const question: FreeTextQuestion = {
    questionType: 'free_text',
    prompts: questions.map((q) => ({
      key: q.sectionId,
      text: q.question,
      hints: q.hints,
    })),
    missingSections: interruptValue.missingSections as string[],
    followUpRound,
    entryType: interruptValue.entryType as string,
  };
  // ... rest unchanged
}
```

#### Step 7: Rebuild shared package

```bash
cd packages/shared && pnpm build
```

Required because `FreeTextPromptSchema` and `FollowupQuestionSchema` changed. Both API and mobile import from `@acme/shared`.

#### Step 8: Update FreeTextPrompts component

**File:** `apps/mobile/src/components/chat/bubble/FreeTextPrompts.tsx`

Add hint rendering below each prompt. Remove the `missingSections` display (no longer needed — the questions themselves are more informative):

```typescript
export const FreeTextPrompts = memo(function FreeTextPrompts({ question, isActive }: Props) {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, !isActive && styles.dimmed]}>
      <View style={styles.promptList}>
        {question.prompts.map((prompt, index) => (
          <View key={prompt.key} style={styles.promptItem}>
            <View style={styles.promptRow}>
              <Text style={[styles.promptNumber, { color: colors.primary }]}>
                {index + 1}.
              </Text>
              <Text style={[styles.promptText, { color: colors.text }]}>
                {prompt.text}
              </Text>
            </View>
            <HintCard hints={prompt.hints} />
          </View>
        ))}
      </View>
    </View>
  );
});
```

#### Step 9: Create HintCard component

**File:** `apps/mobile/src/components/chat/bubble/HintCard.tsx`

A collapsible card showing hint examples and reassurance:

```typescript
import type { PromptHints } from '@acme/shared';
import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../../theme';

interface Props {
  hints: PromptHints;
}

export const HintCard = memo(function HintCard({ hints }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <Pressable onPress={() => setExpanded((v) => !v)} style={styles.toggle}>
        <Text style={[styles.toggleText, { color: colors.textSecondary }]}>
          {expanded ? '▾' : '▸'} Need inspiration?
        </Text>
      </Pressable>
      {expanded && (
        <View style={[styles.content, { backgroundColor: colors.surfaceSecondary }]}>
          {hints.examples.map((example, i) => (
            <Text key={i} style={[styles.example, { color: colors.textSecondary }]}>
              {example}
            </Text>
          ))}
          <Text style={[styles.reassurance, { color: colors.textTertiary }]}>
            {hints.reassurance}
          </Text>
        </View>
      )}
    </View>
  );
});
```

### Deliverables

- Updated `FollowupQuestionSchema` and `FreeTextPromptSchema` in shared package
- New `PromptHintsSchema` in shared package
- Rewritten follow-up prompt with micro-question + hint rules
- Model upgrade to gpt-4.1 in follow-up node
- Updated `formatMissingSectionBlock` with depth status
- Updated interrupt payload to pass hints through
- New `HintCard` component on mobile
- Updated `FreeTextPrompts` to render hints
- Rebuilt shared package

### Best Industry Patterns

- **Schema-first design**: Updating the shared Zod schemas first ensures type safety flows from backend → API response → mobile. A schema change in one place propagates compile-time errors everywhere it's consumed.
- **Progressive disclosure**: Hints are collapsed by default. Most trainees won't need them. Those who are stuck can expand. Respects experts while supporting novices.
- **No backwards compatibility needed**: The app is not live, so `hints` is required on `FreeTextPromptSchema` — no need for optional handling of old messages.

### Code Guidance

- `HintCard` is a generic component — it takes `PromptHints` and renders them. Don't couple it to `FreeTextPrompts`. It could be reused elsewhere (e.g., PDP goal editing).
- Consider extracting the follow-up prompt to a separate file (`apps/api/src/portfolio-graph/prompts/followup.prompt.ts`) following the pattern used in `apps/api/src/processing/prompts/`. The prompt is getting long enough to warrant its own file.
- Keep `formatMissingSectionBlock` as a pure function — data in, string out, no side effects.

### Risks & Tradeoffs

- **Hint quality**: gpt-4.1 must generate hints from different clinical scenarios without being case-specific. If hints are too close to the trainee's case, they become copy-pasteable templates (violating P2). Monitor during testing.
- **maxTokens increase**: 600 → 1000 to accommodate hints. ~40% cost increase per follow-up call. Acceptable given the overall pipeline cost decreases in Phase 3.
- **Shared package rebuild**: Both API and mobile depend on `@acme/shared`. Must rebuild after schema changes. Add a note to `CLAUDE.md` if not already there.

---

## Phase 3: Reflect Node — Organise, Don't Generate

### Objective

Rewrite the Reflect node from a reflective writing generator to a transcript organiser. The AI's role changes from "write a reflection in the trainee's voice" to "sort the trainee's own words into the correct template sections." This is the primary RCGP compliance change.

### Scope

**Included:**

- Complete prompt rewrite: generation → extraction/organisation
- Schema update: add `sectionId`, `covered` per section; add `capabilityAnnotations` as separate metadata
- Model downgrade: gpt-5.4 → gpt-4.1-mini
- Temperature reduction: 0.4 → 0.1
- Remove word count targeting; token budget proportional to transcript length
- Remove capability weaving instructions — capabilities become metadata
- Updated graph state types
- Updated save node for new schema shape

**Excluded:**

- Frontend changes to handle new schema (Phase 4)
- Generate PDP changes (Phase 4)
- Compliance guardrail post-check (future enhancement)

### Implementation Plan

#### Step 1: Update the Zod response schema

**File:** `apps/api/src/portfolio-graph/nodes/reflect.node.ts`

```typescript
const reflectResponseSchema = z.object({
  title: z
    .string()
    .max(100)
    .describe('A concise title summarising the artefact for list views (max 100 chars)'),
  sections: z
    .array(
      z.object({
        sectionId: z.string().describe('Template section ID, e.g., "clinical_reasoning"'),
        title: z.string().describe('Section heading, e.g., "Clinical Reasoning"'),
        text: z
          .string()
          .describe(
            "The trainee's own words organised for this section. " +
              'Empty string if no content maps to this section.'
          ),
        covered: z.boolean().describe('Whether the transcript contained content for this section'),
      })
    )
    .describe('All template sections in order, including empty ones'),
  capabilityAnnotations: z
    .array(
      z.object({
        sectionId: z.string().describe('Which section demonstrates this capability'),
        capabilityCode: z.string().describe('Capability code, e.g., "C-06"'),
        evidence: z.string().describe('Direct quote from the transcript as evidence'),
      })
    )
    .describe('Capabilities mapped to sections as metadata — NOT embedded in section text'),
});
```

#### Step 2: Rewrite the prompt

Replace the entire system prompt:

```typescript
const reflectPrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are a medical portfolio formatting assistant for {specialtyName} trainees.

Your task: organise the trainee's transcript into the template sections below. You are NOT writing a reflection — you are sorting and lightly formatting what the trainee has already said.

## Trainee Context

{trainingStageContext}

Use this context to calibrate formatting only:
- For earlier-stage trainees, more cleanup of speech fragments is expected.
- For later-stage trainees, preserve more precise clinical language.
- Do NOT use training stage to add content or change what the trainee said.

## Sections

Organise the transcript into these sections, in order. Return ALL sections — set covered: false and text: "" for sections with no matching content.

{sectionBlock}

## Formatting Rules

1. Use ONLY the trainee's own words and phrasing.
2. You may fix grammar, punctuation, and sentence fragments from speech-to-text.
3. You may reorder sentences so related content sits together within a section.
4. Do NOT add reflective language, clinical reasoning, or insights the trainee did not express.
5. Do NOT paraphrase or synthesise — preserve the trainee's voice.
6. Do NOT expand brief statements into detailed paragraphs.
7. Write in first person ("I"), matching the trainee's own voice.

## What "lightly formatting" means — examples

OK: Joining fragments ("the ECG was. normal sinus" → "The ECG was normal sinus rhythm.")
OK: Fixing speech-to-text errors ("met four men" → "Metformin")
OK: Adding paragraph breaks between distinct points within a section
NOT OK: "I was a bit relieved" → "I experienced initial reassurance"
NOT OK: Adding transition phrases the trainee didn't say
NOT OK: "I learned a lot" → "This case deepened my understanding of..."

## Capability Annotations

The following capabilities were confirmed by the trainee. For each, identify which section demonstrates it and provide a brief evidence quote from the transcript.

Do NOT mention capabilities in the section text. Return them as capabilityAnnotations only.

{capabilityBlock}`,
  ],
  ['human', '{transcript}'],
]);
```

#### Step 3: Update the sectionBlock formatter

Guide extraction, not generation:

```typescript
function formatSectionBlock(
  sections: {
    id: string;
    label: string;
    required: boolean;
    description: string;
    promptHint: string;
  }[]
): string {
  return sections
    .map(
      (s) =>
        `### ${s.id} — ${s.label}${s.required ? '' : ' (optional)'}\n` +
        `Content to look for: ${s.description}\n` +
        `Sorting guidance: ${s.promptHint}`
    )
    .join('\n\n');
}
```

#### Step 4: Update model, temperature, and token budget

```typescript
const { data: response } = await deps.llmService.invokeStructured(messages, reflectResponseSchema, {
  model: OpenAIModels.GPT_4_1_MINI,
  temperature: 0.1,
  maxTokens: Math.max(Math.ceil(state.fullTranscript.split(/\s+/).length * 2), 2000),
});
```

Token budget proportional to transcript length (2x for JSON overhead + headings), floor at 2000. Removes the word-count-based calculation that incentivised padding.

#### Step 5: Update graph state

**File:** `apps/api/src/portfolio-graph/portfolio-graph.state.ts`

Add capability annotation type:

```typescript
export interface CapabilityAnnotation {
  sectionId: string;
  capabilityCode: string;
  evidence: string;
}
```

Add to `PortfolioState`:

```typescript
capabilityAnnotations: Annotation<CapabilityAnnotation[]>({
  reducer: (_, next) => next,
  default: () => [],
}),
```

Update the reflection type:

```typescript
reflection: Annotation<Array<{
  sectionId: string;
  title: string;
  text: string;
  covered: boolean;
}> | null>({
  reducer: (_, next) => next,
  default: () => null,
}),
```

#### Step 6: Update the node's return value

```typescript
return {
  title: response.title,
  reflection: response.sections,
  capabilityAnnotations: response.capabilityAnnotations,
};
```

#### Step 7: Update the save node

The save node writes the reflection to the artefact document. Update it to persist `sectionId`, `covered`, and `capabilityAnnotations`. Check the save node's current implementation and update the artefact write to include the new fields.

### Deliverables

- Rewritten reflect prompt (extraction/organisation, not generation)
- Updated Zod response schema with `sectionId`, `covered`, `capabilityAnnotations`
- Model change: gpt-5.4 → gpt-4.1-mini
- Temperature change: 0.4 → 0.1
- Token budget proportional to transcript length
- Updated graph state types
- Updated save node
- Updated unit tests

### Best Industry Patterns

- **Extraction over generation**: The prompt is an information extraction task, not a creative writing task. Lower temperatures and smaller models perform as well or better for extraction. The model choice is itself an architectural guardrail — gpt-4.1-mini cannot generate the same quality of creative writing as gpt-5.4, which is the point.
- **Schema as contract**: The `capabilityAnnotations` array is a separate output channel from section text. Enforces at the schema level that capabilities cannot be embedded in prose.
- **Proportional resource allocation**: Token budget scales with input size, not a fixed target. No padding incentive.

### Code Guidance

- The prompt is the most important artefact in this phase. Every sentence prevents a specific failure mode. The "What lightly formatting means" examples section is the primary guardrail — include concrete OK/NOT OK pairs.
- Remove the comment about "moderate temperature (0.4) because this is generative writing" — the node is no longer generative.
- Keep `capabilityAnnotations` as a flat array, not nested inside sections. Makes it easy to query without iterating through sections.
- Update the `formatCapabilityBlock` helper — it no longer needs to instruct the LLM to "weave naturally." Just list capabilities for the LLM to map to sections.

### Risks & Tradeoffs

- **Output quality perception**: Trainees accustomed to polished AI-generated reflections will see rougher output. This is intentional and is the RCGP compliance story — the output is their words organised, not AI prose.
- **Empty sections**: With the generation model, every section got content. With the organisation model, sections without trainee input are empty. The frontend must handle this (Phase 4).

---

## Phase 4: Frontend Adaptation & PDP Node Update

### Objective

Update the mobile app to render the new reflection format (sections with `covered` status, capability annotations as tags, empty sections as editable placeholders) and update the Generate PDP node to work with organised (not generated) reflections.

### Scope

**Included:**

- Updated artefact detail screen to handle `covered: false` sections
- Capability annotations rendered as tags alongside sections
- Empty section CTA using template's `extractionQuestion`
- Generate PDP model downgrade: gpt-5.4 → gpt-4.1
- Updated PDP prompt for organised reflections

**Excluded:**

- Before/after comparison view (future enhancement)
- Sequential question reveal (future UX iteration)
- Section-by-section edit mode redesign

### Implementation Plan

#### Step 1: Update artefact section rendering

The artefact detail screen currently renders `reflection` as `Array<{ title, text }>`. Update to handle the new shape:

- If `covered: true` and `text` non-empty: render normally (editable)
- If `covered: false` or `text` empty: render a placeholder card prompting the trainee to add content. Use the section label: "Tap to add your thoughts on [Reflection & Learning]"

#### Step 2: Render capability annotations

Create a `CapabilityTag` component — a small badge showing capability code + name, rendered below the section it's annotated to:

```typescript
<SectionCard title="Clinical Reasoning" text="..." covered={true}>
  <CapabilityTag code="C-06" name="Clinical Reasoning" evidence="..." />
  <CapabilityTag code="C-12" name="Managing Risk" evidence="..." />
</SectionCard>
```

Tapping a tag shows the evidence quote in a bottom sheet or tooltip.

#### Step 3: Update Generate PDP node

**File:** `apps/api/src/portfolio-graph/nodes/generate-pdp.node.ts`

Model change: `OpenAIModels.GPT_5_4` → `OpenAIModels.GPT_4_1`. Temperature stays at 0.2.

Add framing to the prompt:

```
The reflection below contains the trainee's own words, organised by section.
Generate PDP goals based on learning needs the TRAINEE identified — do not
infer gaps the trainee did not mention. If the trainee identified no clear
learning needs, generate ONE goal based on the strongest capability
demonstrated, suggesting how to deepen it.
```

#### Step 4: Build and test end-to-end

- Rebuild shared package and api-client package
- Run API unit tests for all modified nodes
- Run API integration tests
- Test on mobile: full flow from dictation → follow-ups → organised reflection → PDP

### Deliverables

- Updated artefact section rendering with covered/empty states
- New `CapabilityTag` component
- Updated Generate PDP node (model + prompt)
- End-to-end tested flow

### Best Industry Patterns

- **Recognition over recall** (Nielsen): Empty sections have a clear CTA telling the trainee what's expected. Turns a gap into an affordance.

### Code Guidance

- `CapabilityTag` accepts generic `{ code, name, evidence }` props — don't couple it to the graph state type.
- Keep the PDP prompt change minimal — lower risk, lower priority than reflect and follow-up changes.

### Risks & Tradeoffs

- **Trainee editing effort increases**: With organised (not generated) output, trainees do more editing — especially for empty sections. Monitor completion rates and time-to-submit.
- **PDP quality**: The current PDP node benefits from rich AI-generated reflection. With rougher trainee words, goals might be less polished. gpt-4.1 should still handle gap identification.

---

## Phase Summary

| Phase | What Changes               | Backend                                 | Frontend                          | Model Impact                   |
| ----- | -------------------------- | --------------------------------------- | --------------------------------- | ------------------------------ |
| **1** | Shallow section detection  | check-completeness, graph state         | None                              | Same model, same cost          |
| **2** | Micro-questions with hints | follow-up node, shared schemas, service | FreeTextPrompts + HintCard        | gpt-4.1-mini → gpt-4.1 (+$$)   |
| **3** | Organise, don't generate   | reflect node, graph state, save node    | None                              | gpt-5.4 → gpt-4.1-mini (−$$$$) |
| **4** | Frontend + PDP             | PDP node                                | Artefact rendering, CapabilityTag | gpt-5.4 → gpt-4.1 (−$$$)       |

### Dependency Chain

```
Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4
                            │
                            └── Can start in parallel with Phase 2
                                if shared schema changes are agreed upfront
```

- **Phase 1 first**: Phase 2 needs `depth` in `sectionCoverage` to tell the follow-up node whether a section is shallow vs missing.
- **Phase 2 and 3 parallelisable**: They modify different nodes. Shared schema changes (`packages/shared`) need coordination but the node implementations are independent.
- **Phase 4 last**: Depends on Phase 3's reflection schema changes.

### Net Model Cost Impact

| Node         | Before       | After        | Direction |
| ------------ | ------------ | ------------ | --------- |
| Follow-up    | gpt-4.1-mini | gpt-4.1      | +$$       |
| Reflect      | gpt-5.4      | gpt-4.1-mini | −$$$$     |
| Generate PDP | gpt-5.4      | gpt-4.1      | −$$$      |

**Net: significant cost reduction per entry, with better RCGP compliance.**
