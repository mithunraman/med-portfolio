# Simplify: Code Review Issue Finder

You are reviewing the current code changes for reuse, quality, and efficiency. Your goal is to identify meaningful issues and explain them clearly.

You must not modify files, apply fixes, run formatters that change files, or make any code changes. This is a review-only task.

## Objective

Review all changed files and produce a detailed list of issues related to:

1. Reuse of existing code, utilities, helpers, abstractions, or patterns
2. Code quality, maintainability, and abstraction boundaries
3. Runtime efficiency, unnecessary work, and avoidable resource usage

Only report issues that are actionable, evidence-based, and worth the user's attention. Avoid style-only comments, speculative concerns, and broad refactor suggestions unless they are directly supported by the changed code.

---

## Phase 1: Identify the Changed Code

Determine the relevant changes by comparing the current branch against the repository’s primary branch.

1. Identify the primary branch:
   - Prefer `origin/main` if it exists.
   - Otherwise use `origin/master` if it exists.
   - Otherwise use local `main` if it exists.
   - Otherwise use local `master` if it exists.

2. Find the merge base between the current `HEAD` and the primary branch.

3. Run a diff from that merge base to the current working tree so the review includes:
   - Committed changes on the current branch
   - Staged changes
   - Unstaged changes

4. A typical command sequence is:

   ```bash
   BASE_BRANCH="$(git rev-parse --verify origin/main 2>/dev/null || git rev-parse --verify origin/master 2>/dev/null || git rev-parse --verify main 2>/dev/null || git rev-parse --verify master 2>/dev/null)"
   MERGE_BASE="$(git merge-base HEAD "$BASE_BRANCH")"
   git diff "$MERGE_BASE"
   ```

5. Also check staged-only changes if needed:

   ```bash
   git diff --staged
   ```

6. If there are no branch changes, staged changes, or unstaged changes, review the most recently modified files that the user mentioned or that were edited earlier in this conversation.

7. If no relevant files can be identified, stop and explain that there are no changes to review.

Use the full branch diff as the primary context. Inspect surrounding files and related modules as needed to verify whether an issue is real.

Do not edit any files.

---

## Phase 2: Launch Three Review Agents in Parallel

Use `${AGENT_TOOL_NAME}` to launch all three agents concurrently in a single message.

Pass each agent:

- The full relevant diff
- The repository context needed to inspect nearby files
- Instructions to return only actionable findings
- Instructions to include file paths, line references where possible, rationale, impact, and suggested fixes

The agents must only review and report findings. They must not modify files.

---

## Agent 1: Code Reuse Review

Review the changes for missed reuse opportunities.

Look for:

1. Newly written code that duplicates existing utilities, helpers, hooks, components, constants, types, or abstractions
2. Inline logic that should use an existing shared utility
3. Hand-rolled implementations of common behavior, including:
   - String manipulation
   - Path handling
   - Environment checks
   - Type guards
   - Formatting
   - Validation
   - Date/time handling
   - Error normalization

4. New functions that overlap with existing functions elsewhere in the codebase
5. New constants, string literals, or enum-like values that should reuse existing definitions

For each finding, include:

- File path and line reference where possible
- The duplicated or unnecessary code
- The existing utility, helper, abstraction, or pattern that should be used instead
- Why the replacement would be better
- Suggested change, described in prose or pseudocode only
- Any risks or caveats

Do not flag reuse opportunities unless the existing code is clearly applicable.

---

## Agent 2: Code Quality Review

Review the changes for maintainability and design issues.

Look for:

1. **Redundant state**
   - State that duplicates existing state
   - Cached values that could be derived
   - Effects, observers, or subscriptions that could be direct calls

2. **Parameter sprawl**
   - New parameters added to avoid a better abstraction
   - Boolean flags or optional parameters that make behavior unclear
   - Function signatures that are becoming hard to reason about

3. **Copy-paste with slight variation**
   - Near-duplicate blocks
   - Repeated control flow
   - Similar JSX or component structures that should be unified

4. **Leaky abstractions**
   - Internal implementation details exposed to callers
   - Existing abstraction boundaries bypassed or weakened
   - Callers forced to know too much about internals

5. **Stringly-typed code**
   - Raw strings where constants, enums, string unions, branded types, or existing identifiers should be used

6. **Unnecessary JSX nesting**
   - Wrapper elements that add no semantic or layout value
   - Boxes, divs, or fragments that can be removed
   - Layout props that could be applied directly to an existing component

7. **Unnecessary comments**
   - Comments that explain what the code already clearly says
   - Comments narrating the change or referencing the task/caller
   - Comments that should be replaced by better names or structure

Keep comments only when they explain non-obvious why, such as subtle invariants, external constraints, compatibility issues, or intentional workarounds.

For each finding, include:

- File path and line reference where possible
- The specific quality issue
- Why it matters
- The likely maintenance impact
- Suggested change, described in prose or pseudocode only
- Whether the issue is high, medium, or low priority

Do not recommend abstraction for its own sake. Prefer simple, local recommendations.

---

## Agent 3: Efficiency Review

Review the changes for avoidable inefficiency.

Look for:

1. **Unnecessary work**
   - Redundant computations
   - Repeated parsing or formatting
   - Repeated file reads
   - Duplicate network/API calls
   - N+1 patterns

2. **Missed concurrency**
   - Independent async operations run sequentially
   - Work that can safely be batched or parallelized

3. **Hot-path bloat**
   - New blocking work during startup
   - New work added to per-request, per-render, polling, or event-handler paths
   - Expensive work that should be memoized, cached, deferred, or moved out of the hot path

4. **Recurring no-op updates**
   - State/store updates inside polling loops, intervals, subscriptions, or event handlers that fire even when nothing changed
   - Missing change-detection guards
   - Wrapper updater functions that fail to preserve same-reference returns or the project’s equivalent “no change” signal

5. **Unnecessary existence checks**
   - Pre-checking whether files/resources exist before operating on them
   - TOCTOU-prone patterns where the operation should be attempted directly and errors handled

6. **Memory issues**
   - Unbounded data structures
   - Missing cleanup
   - Event listener leaks
   - Retained references that could grow over time

7. **Overly broad operations**
   - Reading entire files when only part is needed
   - Loading all records when only one or a filtered subset is needed
   - Performing global scans when the scope can be narrowed

For each finding, include:

- File path and line reference where possible
- The inefficient pattern
- Why it matters in this code path
- The likely runtime or resource impact
- Suggested change, described in prose or pseudocode only
- Whether the issue is high, medium, or low priority

Do not flag theoretical performance concerns unless they are plausible in the changed code path.

---

## Phase 3: Synthesize Findings

Wait for all three agents to complete.

Aggregate their findings into a single review list.

For each finding:

1. Verify whether it is valid by inspecting the relevant code.
2. Ignore false positives, speculative concerns, style-only preferences, or issues not worth addressing.
3. Do not argue with weak findings. Skip them silently unless there is useful context to mention.
4. Deduplicate overlapping findings across agents.
5. Prioritize issues that are:
   - Clearly correct
   - Local to the changed code
   - Actionable
   - Meaningfully related to reuse, quality, or efficiency

Do not modify files.

---

## Phase 4: Final Report

Provide a detailed final report with the following sections:

### Summary

Briefly state whether issues were found. If no issues were found, say that the reviewed changes look clean based on the requested criteria.

### Issues Found

For each issue, include:

- **Title**
- **Priority**: High, Medium, or Low
- **Category**: Reuse, Quality, or Efficiency
- **Location**: File path and line reference where possible
- **Problem**: What is wrong
- **Why it matters**: The practical impact or risk
- **Suggested fix**: A clear recommendation in prose or pseudocode
- **Confidence**: High, Medium, or Low

### Skipped Findings

Briefly list any notable agent findings that were intentionally skipped because they were false positives, speculative, too broad, or not worth addressing.

### Validation

List what was reviewed or checked, such as:

- Primary branch diff
- Staged diff
- Unstaged diff
- Related files
- Existing utilities or patterns
- Agent outputs

Do not claim that tests, linting, formatting, or type-checking were run unless they were actually run. Do not run tools that modify files.
