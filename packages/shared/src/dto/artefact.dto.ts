import { z } from 'zod';
import { ArtefactStatus } from '../enums/artefact-status.enum';
import { ConversationStatus } from '../enums/conversation-status.enum';
import { PdpGoalStatus } from '../enums/pdp-goal-status.enum';
import { Specialty } from '../enums/specialty.enum';

// PDP Goal Action schema (embedded action within a goal)
export const PdpGoalActionSchema = z.object({
  id: z.string(),
  action: z.string(),
  intendedEvidence: z.string(),
  status: z.nativeEnum(PdpGoalStatus),
  dueDate: z.string().datetime().nullable(),
  completionReview: z.string().nullable(),
});

export type PdpGoalAction = z.infer<typeof PdpGoalActionSchema>;

// PDP Goal schema
export const PdpGoalSchema = z.object({
  id: z.string(),
  goal: z.string(),
  status: z.nativeEnum(PdpGoalStatus),
  reviewDate: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  completionReview: z.string().nullable(),
  actions: z.array(PdpGoalActionSchema),
});

export type PdpGoal = z.infer<typeof PdpGoalSchema>;

// Capability schema
export const CapabilitySchema = z.object({
  code: z.string(),
  name: z.string(),
  evidence: z.string(),
  // The trainee's descriptor-linked justification (their own words). '' until elicited.
  justification: z.string().default(''),
});

export type Capability = z.infer<typeof CapabilitySchema>;

// Completeness signal — which required sections were left unmet when the analysis
// graph finished (loop exhausted or trainee disengaged). Drives a soft "needs your
// input" nudge and lets the UI highlight the specific sections. null until analysis
// completes. General across section types: a thin factual section and a thin
// reflection both appear here.
export const UnmetSectionSchema = z.object({
  sectionId: z.string(),
  label: z.string(),
  status: z.enum(['missing', 'shallow']),
});

export type UnmetSection = z.infer<typeof UnmetSectionSchema>;

export const CompletenessSchema = z.object({
  complete: z.boolean(),
  unmetSections: z.array(UnmetSectionSchema),
});

export type Completeness = z.infer<typeof CompletenessSchema>;

// Draft lifecycle status (graded readiness verdict). Coexists with `completeness`:
// `ready` = the rubric cleared; `needs_attention` = gaps remain or the trainee
// stopped early. null until the analysis graph completes.
export const DraftStatusSchema = z.enum(['in_progress', 'ready', 'needs_attention']);
export type DraftStatus = z.infer<typeof DraftStatusSchema>;

// A rendered output document field — the granular probes projected into the
// FourteenFish-style fields the trainee submits (e.g. "Brief Description").
export const ComposedDocumentFieldSchema = z.object({
  sectionId: z.string(),
  label: z.string(),
  text: z.string(),
});

export type ComposedDocumentField = z.infer<typeof ComposedDocumentFieldSchema>;

// Single source of truth for the review invariants — referenced by the request
// Zod schema below and the Mongoose @Prop bounds in the API. Changing the rating
// scale or comment cap is a one-line edit here.
export const ARTEFACT_RATING_MIN = 1;
export const ARTEFACT_RATING_MAX = 5;
export const ARTEFACT_REVIEW_COMMENT_MAX_LENGTH = 2000;

// Artefact review (embedded in artefact response). Private to the author —
// a 1–5 star rating of the AI output with an optional free-text comment.
export const ArtefactReviewSchema = z.object({
  rating: z.number().int().min(ARTEFACT_RATING_MIN).max(ARTEFACT_RATING_MAX),
  comment: z.string().nullable(),
  updatedAt: z.string().datetime(),
});

export type ArtefactReview = z.infer<typeof ArtefactReviewSchema>;

// Note invariants — single source of truth for the request Zod schema below.
// Enforced at the API boundary (ZodValidationPipe); unlike the review bounds these
// are NOT mirrored onto the Mongoose @Prop, since the only write path
// (PUT :id/notes) is DTO-validated and Mongoose validators wouldn't run on the
// findOneAndUpdate/$set the repo uses anyway. Add persistence-layer validation
// (maxlength + array-length validator + runValidators) only if a non-DTO writer
// for notes ever appears.
export const NOTE_MAX_LENGTH = 5000;
export const NOTES_MAX_COUNT = 100;

// A freeform note the author attaches to an artefact after creation (embedded in
// the artefact response). Each note carries a server-minted xid so individual
// notes keep their identity (and createdAt) across the array-replace save contract.
export const NoteSchema = z.object({
  xid: z.string(),
  text: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Note = z.infer<typeof NoteSchema>;

// Active conversation (embedded in artefact response)
export const ActiveConversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.nativeEnum(ConversationStatus),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ActiveConversation = z.infer<typeof ActiveConversationSchema>;

// Artefact schema
export const ArtefactSchema = z.object({
  id: z.string(),
  artefactId: z.string(),
  specialty: z.nativeEnum(Specialty),
  trainingStage: z.string(),
  status: z.nativeEnum(ArtefactStatus),
  artefactType: z.string().nullable(),
  artefactTypeLabel: z.string().nullable(),
  title: z.string().nullable(),
  pdpGoals: z.array(PdpGoalSchema).nullable(),
  capabilities: z.array(CapabilitySchema).nullable(),
  completeness: CompletenessSchema.nullable(),
  // Graded readiness outputs (coexist with completeness). null until analysis completes.
  draftStatus: DraftStatusSchema.nullable(),
  readinessScore: z.number().nullable(),
  composedDocument: z.array(ComposedDocumentFieldSchema).nullable(),
  tags: z.record(z.array(z.string())).nullable(),
  review: ArtefactReviewSchema.nullable(),
  // Author notes — always present (defaults to [] server-side), never null.
  notes: z.array(NoteSchema).default([]),
  conversation: ActiveConversationSchema,
  versionCount: z.number().default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Artefact = z.infer<typeof ArtefactSchema>;

// Request schemas
export const CreateArtefactRequestSchema = z.object({
  artefactId: z
    .string()
    .min(10, 'Artefact ID must be at least 10 characters')
    .max(36, 'Artefact ID must not exceed 36 characters'),
});

export type CreateArtefactRequest = z.infer<typeof CreateArtefactRequestSchema>;

export const UpdateArtefactStatusRequestSchema = z.object({
  status: z.nativeEnum(ArtefactStatus),
  archivePdpGoals: z.boolean().optional(),
});

export type UpdateArtefactStatusRequest = z.infer<typeof UpdateArtefactStatusRequestSchema>;

// Finalise request schemas
export const PdpGoalActionSelectionSchema = z.object({
  actionId: z.string(),
  selected: z.boolean(),
});

export type PdpGoalActionSelection = z.infer<typeof PdpGoalActionSelectionSchema>;

export const PdpGoalSelectionSchema = z.object({
  goalId: z.string(),
  selected: z.boolean(),
  reviewDate: z.string().datetime().nullable().optional(),
  actions: z.array(PdpGoalActionSelectionSchema).optional(),
});

export type PdpGoalSelection = z.infer<typeof PdpGoalSelectionSchema>;

export const FinaliseArtefactRequestSchema = z.object({
  pdpGoalSelections: z.array(PdpGoalSelectionSchema),
});

export type FinaliseArtefactRequest = z.infer<typeof FinaliseArtefactRequestSchema>;

// Edit request schemas — the trainee edits the rendered entry fields. Each edit
// targets a section by id and overwrites its text; the label is server-owned.
export const EditArtefactSectionSchema = z.object({
  sectionId: z.string(),
  text: z.string(),
});

export type EditArtefactSection = z.infer<typeof EditArtefactSectionSchema>;

// Each edit targets a capability by code and overwrites its justification; the
// code, name and evidence are server-owned. Mirrors the section edit contract.
export const EditArtefactCapabilitySchema = z.object({
  code: z.string(),
  justification: z.string().max(5000),
});

export type EditArtefactCapability = z.infer<typeof EditArtefactCapabilitySchema>;

export const EditArtefactRequestSchema = z.object({
  title: z.string().max(200).optional(),
  composedDocument: z.array(EditArtefactSectionSchema).optional(),
  capabilities: z.array(EditArtefactCapabilitySchema).optional(),
});

export type EditArtefactRequest = z.infer<typeof EditArtefactRequestSchema>;

// Review request schema — upsert (create or overwrite) the author's review.
export const UpsertArtefactReviewRequestSchema = z.object({
  rating: z.number().int().min(ARTEFACT_RATING_MIN).max(ARTEFACT_RATING_MAX),
  comment: z.string().max(ARTEFACT_REVIEW_COMMENT_MAX_LENGTH).nullable().optional(),
});

export type UpsertArtefactReviewRequest = z.infer<typeof UpsertArtefactReviewRequestSchema>;

// Notes request — the full desired notes array (array-replace, last-write-wins).
// Each entry's xid is optional: present = an existing note to preserve (its
// createdAt is kept server-side), absent = a new note the server mints an xid and
// timestamps for. A persisted note whose xid is omitted from the array is deleted.
export const UpdateNotesRequestSchema = z.object({
  notes: z
    .array(
      z.object({
        xid: z.string().optional(),
        text: z.string().trim().min(1).max(NOTE_MAX_LENGTH),
      })
    )
    .max(NOTES_MAX_COUNT)
    // Each xid identifies one existing note; two entries citing the same xid would
    // reconcile into duplicate-id notes (breaking per-note identity). New notes
    // (no xid) are exempt — they get minted server-side.
    .refine(
      (notes) => {
        const xids = notes.flatMap((n) => (n.xid ? [n.xid] : []));
        return new Set(xids).size === xids.length;
      },
      { message: 'Duplicate note ids are not allowed' }
    ),
});

export type UpdateNotesRequest = z.infer<typeof UpdateNotesRequestSchema>;

// Version schemas
// A version's capability snapshot, projected for preview: justification only
// (the evidence quote is internal provenance and stays hidden), with the name
// enriched from the registry so the preview can label it.
export const ArtefactVersionCapabilitySchema = z.object({
  code: z.string(),
  name: z.string(),
  justification: z.string(),
});

export type ArtefactVersionCapability = z.infer<typeof ArtefactVersionCapabilitySchema>;

export const ArtefactVersionSchema = z.object({
  version: z.number(),
  timestamp: z.string().datetime(),
  title: z.string().nullable(),
  composedDocument: z.array(ComposedDocumentFieldSchema).nullable(),
  capabilities: z.array(ArtefactVersionCapabilitySchema).nullable(),
});

export type ArtefactVersion = z.infer<typeof ArtefactVersionSchema>;

export const ArtefactVersionHistoryResponseSchema = z.object({
  versions: z.array(ArtefactVersionSchema),
});

export type ArtefactVersionHistoryResponse = z.infer<typeof ArtefactVersionHistoryResponseSchema>;

export const RestoreArtefactVersionRequestSchema = z.object({
  version: z.number(),
});

export type RestoreArtefactVersionRequest = z.infer<typeof RestoreArtefactVersionRequestSchema>;

// Response schemas
export const ArtefactListResponseSchema = z.object({
  artefacts: z.array(ArtefactSchema),
  nextCursor: z.string().nullable(),
  limit: z.number(),
});

export type ArtefactListResponse = z.infer<typeof ArtefactListResponseSchema>;
