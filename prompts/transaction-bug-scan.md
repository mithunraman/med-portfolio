Audit the entire `apps/api/src/` directory for MongoDB transaction correctness bugs related to missing session propagation.

## Objective

Find cases where code uses `TransactionService.withTransaction()` or otherwise uses a MongoDB `ClientSession`, but one or more database operations inside the transactional flow do **not** use the same `session`.

This is a correctness audit only. **Do not modify code.** Report findings only.

---

## Bug Pattern to Detect

When code runs inside `TransactionService.withTransaction(async (session) => { ... })` or any MongoDB session-based transaction, **every database operation that is intended to participate in that transaction must use the same `session`**.

Missing `session` on a DB operation is a bug because:

1. **Read without session**
   - The read executes outside the transaction’s snapshot isolation.
   - This can observe stale or non-transactional state.
   - A common race: two concurrent requests both read “nothing exists” and both proceed to create/update conflicting state.

2. **Write without session**
   - The write executes outside the transaction entirely.
   - It may commit immediately and will not roll back if the transaction later aborts.
   - This can leave partial mutations committed even though the surrounding transaction failed.

---

## Scope

1. Search all `*.service.ts` files under `apps/api/src/`.
2. Find:
   - `withTransaction(...)`
   - any use of `ClientSession`
   - any explicit `.startSession()` / transaction callback patterns
3. For each transactional flow, inspect the entire callback body and audit **all DB operations** inside it.
4. Also identify multi-step **read-then-write** flows that are **not wrapped in a transaction at all**, especially when the read guards a conditional write.

---

## What Counts as a DB Operation

Treat all of the following as database operations that must participate in the transaction when executed inside the transaction callback:

- Repository method calls that wrap Mongoose/model access
  - e.g. `this.userRepository.create(...)`
  - e.g. `this.periodRepository.findActiveByUserId(...)`
  - e.g. `this.someRepository.updateStatus(...)`

- Direct model/query calls
  - `find`, `findOne`, `findById`
  - `countDocuments`, `exists`
  - `create`, `insertMany`
  - `updateOne`, `updateMany`, `findOneAndUpdate`, `findByIdAndUpdate`
  - `deleteOne`, `deleteMany`, `findOneAndDelete`
  - `save`
  - aggregation or bulk operations if applicable

A DB call is considered correctly transaction-bound only if the session is actually propagated, for example via:

- a `session` argument passed into a repository method
- `{ session }` in query options
- `.session(session)` on the query
- document `.save({ session })`
- model `create(..., { session })` or equivalent valid Mongoose form

---

## Required Audit Procedure

For every service method that starts or receives a transaction/session:

### 1) Enumerate all DB calls inside the transactional flow

List every repository call and every direct model call inside the transaction callback.

### 2) Verify session propagation at the call site

For each DB call, verify that the call site passes the `session` explicitly.

### 3) Verify repository contract and forwarding

If the call goes through a repository/helper abstraction, inspect:

- the interface/type declaration
- the implementation signature
- the implementation body

Confirm that:

- the method accepts `session?: ClientSession` (or equivalent)
- the implementation forwards that session to the underlying Mongoose query

If the call site passes `session` but the repository method does not accept or forward it, that is still a finding.

### 4) Flag guard reads with especially high severity

Pay special attention to:

- read/check for existing state
- branch on that result
- then perform create/update/delete

If the guard read is outside the transaction snapshot because it lacks `session`, report this as a high-severity race condition.

### 5) Check for transactionless multi-step correctness risks

If a service performs a multi-step read-then-write or write-then-write flow with business invariants but **without any transaction**, report it as a candidate issue even if no `withTransaction` is present.

---

## Important Rules

- Do **not** assume a repository method is safe just because its name suggests transactional behavior.
- Do **not** stop at the call site; always trace through repository interface and implementation when needed.
- Do **not** treat non-DB helper calls as findings.
- If you are uncertain whether a method touches the DB, mark it as **Needs verification** rather than guessing.
- Prefer false-positive avoidance over speculation, but do not miss likely transactional bugs.

---

## Output Format

For each finding, use this structure:

- **File:** `<path>:<line>`
- **Service method:** `<class>.<method>`
- **Transaction context:** `<withTransaction callback / ClientSession flow / no transaction>`
- **Call:** `<repository/model call missing session>`
- **Operation type:** `read` | `write` | `read-then-write candidate`
- **Why this is a bug:** `<explain exactly how session is missing or not forwarded>`
- **Concurrency / consistency risk:** `<describe the concrete race or partial-commit scenario>`
- **Required fix:** `<call site / interface / implementation / add transaction>`
- **Confidence:** `high` | `medium` | `low`

If relevant, also include:

- **Guard pattern:** `<read → branch → write>`
- **Needs verification:** `<what could not be proven from the code inspected>`

---

## High-Priority Bug Shapes

Prioritize and clearly call out these patterns:

1. **Existence check without session inside transaction**
   - Example shape: read active/current record → if not found, create one

2. **Uniqueness/invariant enforcement without session**
   - Example shape: check no active entity exists → create/update active entity

3. **Write inside transaction callback without session**
   - Any create/update/delete that commits outside the transaction

4. **Repository accepts no session parameter**
   - Interface and implementation prevent correct propagation

5. **Multi-step invariant logic with no transaction**
   - Especially read-then-write flows across multiple collections/documents

---

## Final Deliverable

Produce:

1. A **findings list** with one entry per issue
2. A short **summary section** with:
   - total transactional flows audited
   - total findings
   - count by severity / confidence
   - the most dangerous race condition found

Do not make code changes. Do not propose patches beyond describing the required fix surface.
