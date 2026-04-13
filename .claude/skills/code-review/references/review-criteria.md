# Review Criteria

## Guiding principle

The goal is to determine whether the original author would **appreciate** each issue being flagged.

## Guideline precedence

These are default criteria. Project-specific guidelines — CLAUDE.md, linting configs, style guides, or instructions in the user's message — override these general rules wherever they conflict.

## When to flag an issue

Flag only when ALL apply:

Meaningfully impacts accuracy, performance, security, or maintainability.

Discrete and actionable — not a general codebase issue or multiple issues combined.

Fixing it does not demand a level of rigor absent from the rest of the codebase (e.g., one-off scripts in personal projects don't need exhaustive input validation or detailed comments).

Introduced in this diff — do not flag pre-existing bugs.

Author would likely fix it if made aware.

Does not rely on unstated assumptions about codebase or author intent.

It is not enough to speculate that a change may disrupt another part of the codebase — to qualify, identify the other parts of the code that are provably affected.

Clearly not an intentional change by the author.

## Writing the finding body

State clearly why the issue is a bug.

Communicate severity accurately — do not overstate.

One paragraph max. No mid-paragraph line breaks unless a code fragment requires it.

Code snippets ≤3 lines, wrapped in inline code or fenced blocks.

Explicitly state the scenarios, environments, or inputs necessary for the bug to arise. Immediately indicate that severity depends on these factors.

Tone: matter-of-fact. Not accusatory, not overly positive. Read as a helpful AI assistant suggestion — do not sound too much like a human reviewer.

Written so the author grasps the idea immediately without close reading.

No flattery or filler ("Great job…", "Thanks for…").

## Volume

Output all findings the original author would fix if they knew about them. If there is no finding that a person would **definitely love to see and fix**, prefer outputting zero findings. Do not stop at the first qualifying finding — continue until every qualifying finding is listed.

## Priority tiers

Prefix each finding title:

| Tag | Meaning |

|------|---------|

| [P0] | Drop everything. Blocking release/ops/major usage. Universal — no input assumptions. |

| [P1] | Urgent. Address next cycle. |

| [P2] | Normal. Fix eventually. |

| [P3] | Low. Nice to have. |

## Suggestion blocks

- Only for concrete replacement code — no commentary inside.

- Preserve exact leading whitespace of replaced lines.

- Do not change indentation level unless that IS the fix.

- Keep minimal: replacement lines only.

## Overall correctness

After findings, deliver a verdict:

- **Correct** — existing code/tests won't break; no bugs or blocking issues.

- **Incorrect** — at least one blocking issue.

- Non-blocking issues (style, formatting, typos, docs) do not affect correctness.
