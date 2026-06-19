import { z } from 'zod';
import { AnalysisRunStatus } from '../enums/analysis-run-status.enum';
import { ArtefactStatus } from '../enums/artefact-status.enum';
import { ConversationStatus } from '../enums/conversation-status.enum';
import { MessageRole } from '../enums/message-role.enum';
import { MessageStatus } from '../enums/message-status.enum';
import { MessageType } from '../enums/message-type.enum';
import { ThinkingStep } from '../enums/thinking-step.enum';

// Message media
export const MessageMediaSchema = z.object({
  id: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().nullable(),
  durationMs: z.number().nullable(),
  audioUrl: z.string().nullable(),
});

export type MessageMedia = z.infer<typeof MessageMediaSchema>;

// ── Graph interrupt sub-schemas (used to cast LangGraph interrupt payloads) ──

export const ClassificationOptionSchema = z.object({
  code: z.string(),
  label: z.string(),
  confidence: z.number(),
  reasoning: z.string(),
});
export type ClassificationOption = z.infer<typeof ClassificationOptionSchema>;

export const CapabilityOptionSchema = z.object({
  code: z.string(),
  name: z.string(),
  confidence: z.number(),
  reasoning: z.string(),
});
export type CapabilityOption = z.infer<typeof CapabilityOptionSchema>;

export const FollowupQuestionSchema = z.object({
  sectionId: z.string(),
  question: z.string(),
  hints: z.object({
    examples: z.array(z.string()).max(3),
  }),
});
export type FollowupQuestion = z.infer<typeof FollowupQuestionSchema>;

// ── Readiness snapshot (Entry Card) ──
// Rides on the question message each turn so the client can render the live
// readiness card alongside the coaching question. Reuses the existing question
// channel — no separate message type.

export const ReadinessSectionSchema = z.object({
  sectionId: z.string(),
  label: z.string(),
  tier: z.enum(['missing', 'shallow', 'adequate', 'strong']),
  meetsThreshold: z.boolean(),
});
export type ReadinessSection = z.infer<typeof ReadinessSectionSchema>;

export const ReadinessCapabilitySchema = z.object({
  code: z.string(),
  name: z.string(),
  justified: z.boolean(),
});
export type ReadinessCapability = z.infer<typeof ReadinessCapabilitySchema>;

export const ReadinessDocumentFieldSchema = z.object({
  sectionId: z.string(),
  label: z.string(),
  text: z.string(),
});
export type ReadinessDocumentField = z.infer<typeof ReadinessDocumentFieldSchema>;

export const ReadinessSnapshotSchema = z.object({
  /** Overall readiness on a 0–10 scale. */
  score: z.number(),
  draftStatus: z.enum(['in_progress', 'ready', 'needs_attention']),
  sections: z.array(ReadinessSectionSchema),
  capabilities: z.array(ReadinessCapabilitySchema),
  /** The composed document fields — empty until the entry has been organised. */
  document: z.array(ReadinessDocumentFieldSchema),
});
export type ReadinessSnapshot = z.infer<typeof ReadinessSnapshotSchema>;

// ── Question sub-schemas ──

export const QuestionOptionSchema = z.object({
  key: z.string(),
  label: z.string(),
  confidence: z.number().optional(),
  reasoning: z.string().optional(),
});
export type QuestionOption = z.infer<typeof QuestionOptionSchema>;

export const PromptHintsSchema = z.object({
  examples: z
    .array(z.string())
    .max(3)
    .describe('Short example responses showing expected depth, from DIFFERENT clinical scenarios'),
});
export type PromptHints = z.infer<typeof PromptHintsSchema>;

export const FreeTextPromptSchema = z.object({
  key: z.string(),
  text: z.string(),
  hints: PromptHintsSchema,
});
export type FreeTextPrompt = z.infer<typeof FreeTextPromptSchema>;

// ── Question variants (discriminated on questionType) ──

export const SingleSelectQuestionSchema = z.object({
  questionType: z.literal('single_select'),
  options: z.array(QuestionOptionSchema),
  suggestedKey: z.string().optional(),
  readiness: ReadinessSnapshotSchema.optional(),
});
export type SingleSelectQuestion = z.infer<typeof SingleSelectQuestionSchema>;

export const MultiSelectQuestionSchema = z.object({
  questionType: z.literal('multi_select'),
  options: z.array(QuestionOptionSchema),
  readiness: ReadinessSnapshotSchema.optional(),
});
export type MultiSelectQuestion = z.infer<typeof MultiSelectQuestionSchema>;

export const FreeTextQuestionSchema = z.object({
  questionType: z.literal('free_text'),
  prompts: z.array(FreeTextPromptSchema),
  missingSections: z.array(z.string()).optional(),
  followUpRound: z.number().optional(),
  entryType: z.string().optional(),
  readiness: ReadinessSnapshotSchema.optional(),
});
export type FreeTextQuestion = z.infer<typeof FreeTextQuestionSchema>;

export const QuestionSchema = z.discriminatedUnion('questionType', [
  SingleSelectQuestionSchema,
  MultiSelectQuestionSchema,
  FreeTextQuestionSchema,
]);
export type Question = z.infer<typeof QuestionSchema>;

// ── Answer sub-schemas (persisted on ASSISTANT question messages) ──

export const SingleSelectAnswerSchema = z.object({ selectedKey: z.string() });
export type SingleSelectAnswer = z.infer<typeof SingleSelectAnswerSchema>;

export const MultiSelectAnswerSchema = z.object({ selectedKeys: z.array(z.string()) });
export type MultiSelectAnswer = z.infer<typeof MultiSelectAnswerSchema>;

export const AnswerSchema = z.union([SingleSelectAnswerSchema, MultiSelectAnswerSchema]);
export type Answer = z.infer<typeof AnswerSchema>;

// Message schemas
export const MessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: z.nativeEnum(MessageRole),
  messageType: z.nativeEnum(MessageType).catch(MessageType.UNKNOWN),
  status: z.nativeEnum(MessageStatus),
  content: z.string().nullable(),
  media: MessageMediaSchema.nullable(),
  question: QuestionSchema.nullable().optional(),
  answer: AnswerSchema.nullable().optional(),
  idempotencyKey: z.string().nullable().optional(),
  // True for system-authored audit messages (e.g. a recorded option selection).
  // These are not user-editable/deletable even though role is USER.
  generated: z.boolean(),
  // Set when the user edits the message in place; null otherwise. Drives the
  // "Edited" indicator in the UI.
  editedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Message = z.infer<typeof MessageSchema>;

// Conversation schemas
export const ConversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.nativeEnum(ConversationStatus),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Conversation = z.infer<typeof ConversationSchema>;

// Request schemas

// Single source of truth for "a valid user message body" — shared by the send
// and edit paths so the length rule can't silently diverge between them.
export const MAX_MESSAGE_CONTENT_LENGTH = 1000;
export const MessageContentSchema = z.string().min(1).max(MAX_MESSAGE_CONTENT_LENGTH);

export const SendMessageRequestSchema = z
  .object({
    content: MessageContentSchema.optional(),
    mediaId: z.string().min(1).max(50).optional(),
    idempotencyKey: z.string().min(1).max(24).optional(),
  })
  .refine((data) => Boolean(data.content) !== Boolean(data.mediaId), {
    message: 'Exactly one of content or mediaId must be provided',
  });

export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;

// Edit an existing user message. The new text replaces the message content
// in place (regex-only PII redaction, no pipeline re-run) — see backend.
export const EditMessageRequestSchema = z.object({
  content: MessageContentSchema,
});

export type EditMessageRequest = z.infer<typeof EditMessageRequestSchema>;

// Analysis action request (unified start + resume)
// Resume sends messageId (the ASSISTANT question message xid) instead of graph node names.
// Value is loosely typed here — backend validates shape against question.questionType.
const AnalysisResumeSchema = z.object({
  type: z.literal('resume'),
  messageId: z.string().min(1),
  value: z.record(z.unknown()).optional(),
});

export const AnalysisActionRequestSchema = z.union([
  z.object({ type: z.literal('start') }),
  AnalysisResumeSchema,
]);

export type AnalysisActionRequest = z.infer<typeof AnalysisActionRequestSchema>;

// Response schemas
export const ConversationListResponseSchema = z.object({
  conversations: z.array(ConversationSchema),
  nextCursor: z.string().nullable(),
  limit: z.number(),
});

export type ConversationListResponse = z.infer<typeof ConversationListResponseSchema>;

// ── ConversationContext schemas ──

export const QuestionTypeSchema = z.enum([
  'single_select',
  'multi_select',
  'free_text',
  'terminal',
]);
export type QuestionType = z.infer<typeof QuestionTypeSchema>;

export const ConversationPhaseSchema = z.enum([
  'composing',
  'analysing',
  'awaiting_input',
  'completed',
  'closed',
]);
export type ConversationPhase = z.infer<typeof ConversationPhaseSchema>;

export const ActionStateSchema = z.object({
  allowed: z.boolean(),
  code: z.string().optional(),
  reason: z.string().optional(),
});
export type ActionState = z.infer<typeof ActionStateSchema>;

export const ConversationContextSchema = z.object({
  artefactId: z.string(),
  // Lifecycle status of the parent artefact. The client uses this (with message
  // facts) to decide whether edit/delete are offered — the backend no longer
  // computes a per-message capability flag. Null when the artefact ref couldn't
  // be resolved (missing/DB error) — the client treats null as "not editable"
  // (fail-closed); the server re-checks the artefact authoritatively.
  artefactStatus: z.nativeEnum(ArtefactStatus).nullable(),
  actions: z.object({
    sendMessage: ActionStateSchema,
    sendAudio: ActionStateSchema,
    startAnalysis: ActionStateSchema,
    resumeAnalysis: ActionStateSchema,
  }),
  phase: ConversationPhaseSchema,
  activeQuestion: z
    .object({
      messageId: z.string(),
      questionType: QuestionTypeSchema,
    })
    .optional(),
  analysisRun: z
    .object({
      id: z.string(),
      status: z.nativeEnum(AnalysisRunStatus),
      thinkingReason: z.nativeEnum(ThinkingStep).nullable().optional(),
    })
    .optional(),
});
export type ConversationContext = z.infer<typeof ConversationContextSchema>;

export const MessageListResponseSchema = z.object({
  messages: z.array(MessageSchema),
  context: ConversationContextSchema,
});

export type MessageListResponse = z.infer<typeof MessageListResponseSchema>;

// ── Analysis Run schemas ──

export const SnapshotRangeSchema = z.object({
  fromMessageId: z.string().nullable(),
  toMessageId: z.string().nullable(),
});

export const AnalysisRunErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export const AnalysisRunSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  runNumber: z.number(),
  status: z.nativeEnum(AnalysisRunStatus),
  snapshotRange: SnapshotRangeSchema,
  currentQuestion: z
    .object({
      messageId: z.string(),
      node: z.string(),
      questionType: QuestionTypeSchema,
    })
    .nullable(),
  artefactId: z.string().nullable(),
  error: AnalysisRunErrorSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type AnalysisRun = z.infer<typeof AnalysisRunSchema>;

export const AnalysisRunListResponseSchema = z.object({
  runs: z.array(AnalysisRunSchema),
});

export type AnalysisRunListResponse = z.infer<typeof AnalysisRunListResponseSchema>;
