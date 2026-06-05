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

## Phase 5 — Mobile UI (two-stage: inline stars → review sheet)

### Objective
A light inline rating affordance on the artefact detail screen that opens a bottom sheet
for the full rating + optional comment. Progressive-disclosure, edit-in-place.

### Scope
**In:** inline `StarRating` entry point, `ReviewSheet` (bottom sheet), redux integration,
plain-merge upsert, accessibility.
**Out:** push prompts, deep links, share affordances, autosave-on-tap, optimistic UI.

### UX — progressive disclosure (two-stage capture)

This is the **Play Store review-composer model, made private and always-on**: a light touch
inline, depth on demand. It supersedes the earlier "always-visible inline card with an inline
comment box" — the text box is moved into a sheet so the detail screen stays clean and the
keyboard only appears when the user opts in.

**Stage 1 — inline entry (on the detail screen):**
- **Empty (unrated):** header "Rate this entry" + five outlined, tappable stars. No text box,
  no Submit inline.
- **Tapping a star** fills it + all to its left **and immediately opens the sheet**, pre-filled
  to that rating. The inline star tap is the *commitment trigger* whose value is carried
  forward (industry-standard — never re-ask the rating the user already gave).
- **Submitted (rated):** header "Your rating" + filled stars (read-only inline) + an Edit
  pencil. Below the stars:
  - The comment as read-only text, **truncated to a maximum of 1 line followed by `…`**
    (`numberOfLines={1}` + `ellipsizeMode="tail"`); omitted entirely if no comment was left.
  - A quiet relative timestamp line — **"Rated {time} ago"** (e.g. "Rated 3d ago") — derived
    from `review.updatedAt` (an ISO string) via the existing `apps/mobile/src/utils/formatTimeAgo.ts`
    helper prefixed with "Rated ". No new date dependency.
  Tapping anywhere on the row (or the Edit pencil) re-opens the sheet pre-filled with the
  current rating + comment (edit = same surface as create; upsert). The inline stars are
  read-only here — editing happens through the sheet, so an accidental tap can't silently
  change a committed rating.

**Stage 2 — the review sheet (modal bottom sheet):**
- Opens pre-filled with the rating from the inline tap (or the existing review when editing).
- Editable star row + optional text area ("Tell us about your experience — optional").
- Primary **Submit** (label **Save** when editing). Enabled whenever a valid rating exists
  (always true here, since a star is required to open the sheet).
- Character counter appears only past ~1800 chars so the common short case stays uncluttered.
- **Submit window (plain merge — no optimistic UI):** on tap, show a spinner and disable the
  star row + text area; fire the request. On success, close the sheet; the inline row
  re-renders into its submitted state from the merged artefact. On failure, **keep the sheet
  open with all input preserved** + an inline error to retry.
- **Dismiss without submitting discards** — and the inline stars **revert to empty** if the
  artefact was previously unrated (nothing persists until Submit). **No delete** by spec.

### Implementation
1. **State**: extend `artefactsSlice` — the artefact detail already holds `review`, so both the
   inline row and the sheet read it from the cached artefact. Add a plain `upsertReview`
   thunk (modelled on `editArtefact`): call `apiClient.artefacts.upsertReview(id, data)` and
   on `fulfilled` replace the cached artefact with the server response (no optimistic update,
   no rollback branch — the failure path is "input preserved in the still-open sheet").
2. **`StarRating`** — `apps/mobile/src/components/common/StarRating.tsx`: presentation-only
   (`value` + `onChange`), native `Pressable`, no thunk imports, no new dependency. Reused by
   both the inline row and the sheet (and a future supervisor rating).
3. **`ReviewSheet`** — `apps/mobile/src/components/artefact/ReviewSheet.tsx`: the capture
   surface (modal bottom sheet). Holds local draft state (`rating`, `comment`, `isSaving`,
   `error`), seeded from the artefact's `review` (or the inline tap value for first-time).
   Dispatches the thunk on Submit; closes on success, stays open on failure.
4. **Inline entry** on the detail screen: empty → "Rate this entry" + stars that open the
   sheet pre-filled; rated → stars + one-line summary that re-opens the sheet to edit.
5. **Accessibility:** each star labelled "Rate N of 5 stars"; text area labelled "Optional
   review"; the sheet announces "Saving" → "Rating saved" via a live region.
6. **Logging:** scoped logger `logger.createScope('ReviewSheet')` — never raw `console.*`
   (CLAUDE.md).

### Mount point
Artefact detail screen ([app/(entry)/[artefactId].tsx]), inline row below
reflection/capabilities (near the version-history row); the sheet is rendered as a modal
overlay controlled by local `isSheetOpen` state.

### Deliverables
Functional two-stage rating flow on a real device, end-to-end persistence, lint + typecheck
clean.

### Patterns / guidance
- **Progressive disclosure** — one tap inline (star) → sheet for depth. Don't front-load the
  text box on the detail screen.
- **Carry the tap forward** — the sheet must open pre-filled with the inline-tapped rating;
  never re-ask it.
- **Bottom sheet, not a center dialog or full screen** — keeps the artefact in context and
  handles the keyboard cleanly for the optional comment.
- **Explicit Submit, no autosave-on-tap** — autosave only fits star-only payloads (Apple's
  system prompt); once a comment field exists you need a deliberate commit so rating + text
  land together and a mis-tap can be corrected first.
- **Plain merge, not optimistic** — the failure path is simply "the sheet stayed open with
  your input"; nothing to roll back. Simpler and correct for a deliberate Submit.
- `StarRating` stays reusable and presentation-only. Keep each component lean; split out a
  `ReviewTextInput` only if the sheet grows.

---

## Explicitly NOT building (and why)

- **Separate `artefactReviews` collection / module** — superseded by the embed decision.
- **DELETE / clear endpoint** — out by spec (edit-only).
- **Separate GET review endpoint** — review rides on `GET /artefacts/:id`.
- **Cascade-delete wiring / orphan job** — automatic with embedding.
- **Admin / analytics endpoints** — out by spec; revisit when product wants to read.
- **Outbox `artefact.rated` event** — no consumer exists; YAGNI.
- **PII redaction on comments** — out by spec.
- **Nudge / prompt-to-rate state** — out by spec; always-visible inline stars replace it.
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
7. `apps/mobile/src/components/common/StarRating.tsx` + `apps/mobile/src/components/artefact/ReviewSheet.tsx`, inline stars on the artefact detail screen, and the `artefactsSlice` `upsertReview` thunk.

No new module, collection, indexes, or cascade-delete wiring.
