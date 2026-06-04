# Artefact Ratings & Reviews — Implementation Plan

> Status: **Planned, not yet implemented.** No `review` field exists on the Artefact
> document today.
>
> Source: design conversation (31 May 2026). The HLD originally proposed a separate
> `artefactReviews` collection; that was **reversed** after a query-pattern audit. The
> final, agreed design **embeds** the review on the Artefact document. This plan reflects
> the embed decision.

---

## Overall Objective

Let an artefact author leave a single, private, **always-editable** 1–5 star rating with
an optional free-text comment (≤ 2000 chars) on any artefact they own — App Store /
Play Store-style inline review card — to capture per-artefact AI-quality signal for future
product use.

### Confirmed spec

| Question | Decision |
| --- | --- |
| Who rates | The **author**, rating the AI-generated interaction/output |
| Shape | **1–5 stars** (single scalar, no per-dimension) |
| Cardinality | **One review per artefact** |
| Comment | Optional free text, **≤ 2000 chars** |
| Visibility | **Private to the author** |
| Lifecycle | Ratable **anytime** |
| PII redaction | **None** — comment stored as-is |
| Mutability | **Edit-only** (no delete/clear endpoint) |
| Cascade on delete | **Yes** — review dies with the artefact |
| Nudge / prompt | **None** — always-visible card (App/Play Store UX) |
| Admin / analytics | **Not now** |

### Architecture decision: embed, don't separate

The review is embedded as a sub-document on the Artefact, **not** a separate collection.

Why:

1. **1:1 cardinality by spec** — one author, one rating, no multi-rater. The classic
   "embed when 1:1 and read together" rule applies.
2. **The always-visible card means every artefact-detail read needs the review** —
   embedding makes it a free read; a separate collection adds a second query on the
   hottest read path.
3. **Size is negligible** — rating (int) + comment (≤ 2000 chars) + `updatedAt` ≈ 2KB max,
   smaller than the existing `reflection`/`capabilities` fields.
4. **No write contention with the AI pipeline** — LLM nodes write
   `title/reflection/capabilities/tags`; users rate later. Even if simultaneous, `$set` on
   disjoint paths is atomic in Mongo.
5. **Cascade is automatic** — delete the artefact, the review goes with it. No transaction
   wiring, no orphan-cleanup job.
6. **The deletion/anonymisation paths already null content fields** — `anonymizeArtefact`
   and `anonymizeByUser` just add `review: null` to their `$set` (one line each).
7. **~70% less code** — no new module/collection/repository/controller/indexes. Matches
   the CLAUDE.md "keep the solution lean" rule.

Counterarguments considered and rejected: separate-collection "scalability" (no fan-out,
linear volume — Mongo handles either shape trivially); multi-rater future (a *supervisor*
review is a different actor → its own collection *if/when* it arrives; the author's
self-rating staying embedded doesn't block it); analytics aggregation (none required now;
a sparse index on `review.rating` is trivial to add on demand).

**Version-history invariant:** snapshots are `{ title, reflection }` only, so editing or
restoring an artefact never touches the review. Document this with a one-line comment in
`editArtefact` so the invariant is explicit.

---

## Phase 1 — Schema & shared contracts

### Objective
Lock the embedded data model and the DTO every other layer depends on.

### Scope
**In:** `ArtefactReview` sub-schema + `review` field on `Artefact`; `Artefact` type update +
`UpsertArtefactReviewDto` Zod schema in `packages/shared`.
**Out:** repository/service/controller logic, UI.

### Implementation
1. **`apps/api/src/artefacts/schemas/artefact.schema.ts`** — add the sub-schema and field:
   ```ts
   export class ArtefactReview {
     @Prop({ required: true, type: Number, min: 1, max: 5 })
     rating!: number;

     @Prop({ type: String, maxlength: 2000, default: null })
     comment!: string | null;

     @Prop({ required: true, type: Date })
     updatedAt!: Date;
   }

   // on Artefact:
   @Prop({ type: ArtefactReview, default: null, _id: false })
   review!: ArtefactReview | null;
   ```
   - `_id: false` — the embedded review has no external identity (no API surface beyond its parent).
   - `null` default distinguishes "not rated" from any rating value (`min: 1` makes 0 impossible anyway).
   - The sub-doc carries its own `updatedAt`; the artefact's own `updatedAt` (via `timestamps: true`) also bumps on review write, which is fine for "recently touched" sorts.
2. **`packages/shared`** — add the optional `review` field to the `Artefact` type, and a
   new `UpsertArtefactReviewSchema` → `{ rating: 1..5 int, comment?: string | null (≤2000) }`.
   Export from `packages/shared/src/index.ts`.

### Deliverables
Compiles cleanly; types exported; no behavioural change yet.

### Patterns / guidance
- No `Types.ObjectId` leakage into the shared/Zod layer.
- Comment is nullable, not optional-undefined — matches Mongo defaults, avoids tri-state.
- 2000-char cap enforced in **both** Zod and Mongoose `maxlength` (DB is the safety net).
- **No new indexes** — `findByXid` already keys on `(xid, userId)`. Add a sparse index on
  `review.rating` only if/when an aggregation/admin need appears.

---

## Phase 2 — Repository

### Objective
Single write path for the embedded review, with DB-level ownership.

### Scope
**In:** `upsertReview` on `ArtefactsRepository`; `review: null` added to the two
`anonymize*` `$set`s.
**Out:** service/controller.

### Implementation
1. **`apps/api/src/artefacts/artefacts.repository.ts`** — new method (kept separate from
   `updateArtefactById` so the LLM write path's `UpdateArtefactData` type stays narrow):
   ```ts
   async upsertReview(
     artefactId: Types.ObjectId,
     userId: Types.ObjectId,            // ownership check in the same query
     data: { rating: number; comment: string | null },
     session?: ClientSession,
   ): Promise<Result<Artefact, DBError>> {
     const artefact = await this.artefactModel
       .findOneAndUpdate(
         { _id: artefactId, userId },
         { $set: { review: { ...data, updatedAt: new Date() } } },
         { new: true, session },
       )
       .lean();
     if (!artefact) return err({ code: 'NOT_FOUND', message: 'Artefact not found' });
     return ok(artefact);
   }
   ```
   - The `{ _id, userId }` filter does ownership at the DB level — a non-owner gets
     `NOT_FOUND`, which is also the right HTTP shape (don't leak existence).
   - Single-document write → **no transaction needed**.
2. Add `review: null` to the `$set` of both `anonymizeArtefact` and `anonymizeByUser` so
   anonymisation wipes the review alongside other content.

### Deliverables
`upsertReview` available; anonymisation covers the review. Result pattern preserved.

### Patterns / guidance
- Follows the existing `Result<T, DBError>` repository contract — never throws.
- Repository owns all `Types.ObjectId` conversion; the service passes xids/domain ids.

---

## Phase 3 — Service & controller

### Objective
Expose the upsert endpoint; surface the review on the existing detail read.

### Scope
**In:** `upsertReview` service method, `PUT /artefacts/:id/review`, tests.
**Out:** separate GET endpoint (the existing `GET /artefacts/:id` carries `review`),
DELETE (edit-only by spec), nudge state, admin listing.

### Implementation
1. **`apps/api/src/artefacts/artefacts.service.ts`** — `upsertReview(userId, xid, dto)`:
   - Resolve the artefact by xid (`findByXid`) to distinguish 404 (missing) from 403/owner
     (or rely on the repo's `{ _id, userId }` filter and map `NOT_FOUND` → `NotFoundException`).
     Either is defensible; pick one and be consistent.
   - Call `repository.upsertReview(...)`; translate `isErr()` → `NotFoundException`.
   - The existing detail mapper passes `review` straight through (xid-only response, no `_id`).
   - Add a one-line comment in `editArtefact` documenting that version snapshots are
     `{ title, reflection }` only and never touch the review.
2. **`apps/api/src/artefacts/artefacts.controller.ts`** — add:
   ```ts
   @Put(':id/review')
   upsertReview(@CurrentUser() user, @Param('id') id, @Body() dto: UpsertArtefactReviewDto)
   ```
   - `PUT` (idempotent upsert) over POST/PATCH — client needn't know prior state, matching
     the existing `upsertArtefact` pattern and App Store "rating already exists" transparency.
   - **No separate GET** — `GET /artefacts/:id` now includes `review`, removing the second
     mobile round-trip.
3. **Tests**:
   - Unit: ownership rejection, rating bounds (1–5), comment length (≤2000), upsert
     overwrite semantics (second PUT overwrites, no duplicate).
   - Integration: full HTTP round-trip; PUT twice → same single embedded review; detail GET
     returns the review inline.

### Deliverables
Endpoint live, review visible on detail read, full test coverage.

### Patterns / guidance
- Ownership lives in the service/DB filter, **not** a new guard — single check, single call site.
- Service must not touch `Types.ObjectId` (CLAUDE.md service-layer rule).
- No transaction — single-doc upsert.

---

## Phase 4 — API client

### Objective
Type-safe client method for mobile consumption.

### Scope
Add the upsert method to the artefacts client in `packages/api-client`; rebuild `dist/`.

### Implementation
1. Add to the existing Artefacts client (cohesive with the nested resource):
   ```ts
   upsertReview(artefactXid: string, body: UpsertArtefactReviewDto): Promise<Artefact>
   ```
   No separate "reviews" client — the review rides on the artefact resource, and reads come
   back on the existing artefact-detail fetch.
2. `pnpm build` in `packages/api-client` (required for mobile to pick up changes — CLAUDE.md).

### Deliverables
`apiClient.artefacts.upsertReview(...)` callable with full type inference; detail fetch
returns `review`.

### Patterns / guidance
- Reuse the shared `fetch` adapter; no bespoke HTTP code. Pure additive change.

---

## Phase 5 — Mobile UI (App Store-style inline review card)

### Objective
Always-visible, edit-in-place review card on the artefact detail screen.

### Scope
**In:** `ReviewCard` component, redux integration, optimistic upsert, accessibility.
**Out:** push prompts, deep links, share affordances.

### UX (App Store / Play Store conventions)
- **Always inline**, never modal. Sits below the artefact content.
- **Empty state**: card "Rate this entry", five outlined stars, optional placeholder text
  area "Tell us about your experience (optional)", primary **Submit** (disabled until a star
  is tapped).
- **Tapping a star** fills it + all to its left.
- **Submitted state**: header "Your rating", filled stars, comment as read-only text, subtle
  **Edit** pencil top-right.
- **Edit mode**: pre-fills current values, primary button becomes **Save**. Leaving the
  screen without saving discards (standard mobile pattern). **No delete** by spec.

### Implementation
1. **State**: extend `artefactsSlice` — the artefact detail already holds `review`, so the
   card reads it from the cached artefact. Add an `upsertReview` thunk with optimistic
   update + rollback on rejection (same pattern as optimistic messaging).
2. **Component** `apps/mobile/src/components/artefact/ReviewCard.tsx`:
   - Drives off the artefact's `review` field; null → empty mode, non-null → submitted mode
     (toggle to edit via local `isEditing`).
   - `StarRating` sub-component — presentation-only (`value` + `onChange`), extract to
     `components/common/StarRating.tsx` if not already present.
   - Accessibility: each star labelled "Rate N of 5 stars"; text area labelled "Optional review".
   - Character counter shown only past ~1800 chars so it doesn't clutter the common case.
   - Scoped logger `logger.createScope('ReviewCard')` — never raw `console.*` (CLAUDE.md).
3. **Mount point**: artefact detail screen, below reflection/capabilities.

### Deliverables
Functional rating card on a real device, end-to-end persistence, lint + typecheck clean.

### Patterns / guidance
- **Optimistic UI** — stars fill instantly; rollback only on rare network failure.
- **Don't autosave on star tap** — require explicit Submit/Save (users tap-then-correct
  before committing).
- `StarRating` must be reusable and presentation-only (no thunk imports). No new
  star-rating dependency — native `Pressable` suffices.
- Keep the card under ~200 lines; split out `StarRating` / `ReviewTextInput` if it grows.

---

## Explicitly NOT building (and why)

- **Separate `artefactReviews` collection / module** — superseded by the embed decision.
- **DELETE / clear endpoint** — out by spec (edit-only).
- **Separate GET review endpoint** — review rides on `GET /artefacts/:id`.
- **Cascade-delete wiring / orphan job** — automatic with embedding.
- **Admin / analytics endpoints** — out by spec; revisit when product wants to read.
- **Outbox `artefact.rated` event** — no consumer exists; YAGNI.
- **PII redaction on comments** — out by spec.
- **Nudge / prompt-to-rate state** — out by spec; always-visible card replaces it.
- **Per-dimension ratings** (accuracy/usefulness/tone) — single scalar by spec; trivial to
  add later.

---

## Files touched (summary)

1. `apps/api/src/artefacts/schemas/artefact.schema.ts` — `ArtefactReview` sub-class + `review` field.
2. `apps/api/src/artefacts/artefacts.repository.ts` — `upsertReview`; `review: null` in both `anonymize*` `$set`s.
3. `apps/api/src/artefacts/artefacts.service.ts` — `upsertReview(userId, xid, dto)`; detail mapper passthrough; version-snapshot invariant comment.
4. `apps/api/src/artefacts/artefacts.controller.ts` — `PUT /artefacts/:id/review`.
5. `packages/shared` — `review` on `Artefact` type + `UpsertArtefactReviewSchema`.
6. `packages/api-client` — `upsertReview` on the artefacts client.
7. `apps/mobile/src/components/artefact/ReviewCard.tsx` (+ `StarRating`) and `artefactsSlice` thunk.

No new module, collection, indexes, or cascade-delete wiring.
