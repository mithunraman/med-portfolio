import { z } from 'zod';
import { AnalysisRunStatus } from '../enums/analysis-run-status.enum';
import { ThinkingStep } from '../enums/thinking-step.enum';
import { ConversationStatus } from '../enums/conversation-status.enum';
import { MessageProcessingStatus } from '../enums/message-processing-status.enum';
import { MessageRole } from '../enums/message-role.enum';
import { MessageType } from '../enums/message-type.enum';

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
});
export type FollowupQuestion = z.infer<typeof FollowupQuestionSchema>;

// ── Question sub-schemas ──

export const QuestionOptionSchema = z.object({
  key: z.string(),
  label: z.string(),
  confidence: z.number().optional(),
  reasoning: z.string().optional(),
});
export type QuestionOption = z.infer<typeof QuestionOptionSchema>;

export const FreeTextPromptSchema = z.object({
  key: z.string(),
  text: z.string(),
});
export type FreeTextPrompt = z.infer<typeof FreeTextPromptSchema>;

// ── Question variants (discriminated on questionType) ──

export const SingleSelectQuestionSchema = z.object({
  questionType: z.literal('single_select'),
  options: z.array(QuestionOptionSchema),
  suggestedKey: z.string().optional(),
});
export type SingleSelectQuestion = z.infer<typeof SingleSelectQuestionSchema>;

export const MultiSelectQuestionSchema = z.object({
  questionType: z.literal('multi_select'),
  options: z.array(QuestionOptionSchema),
});
export type MultiSelectQuestion = z.infer<typeof MultiSelectQuestionSchema>;

export const FreeTextQuestionSchema = z.object({
  questionType: z.literal('free_text'),
  prompts: z.array(FreeTextPromptSchema),
  missingSections: z.array(z.string()).optional(),
  followUpRound: z.number().optional(),
  entryType: z.string().optional(),
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
  processingStatus: z.nativeEnum(MessageProcessingStatus),
  content: z.string().nullable(),
  media: MessageMediaSchema.nullable(),
  question: QuestionSchema.nullable().optional(),
  answer: AnswerSchema.nullable().optional(),
  idempotencyKey: z.string().nullable().optional(),
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
export const SendMessageRequestSchema = z
  .object({
    content: z.string().min(1).max(10000).optional(),
    mediaId: z.string().min(1).max(50).optional(),
    idempotencyKey: z.string().min(1).max(24).optional(),
  })
  .refine((data) => Boolean(data.content) !== Boolean(data.mediaId), {
    message: 'Exactly one of content or mediaId must be provided',
  });

export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;

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

export const QuestionTypeSchema = z.enum(['single_select', 'multi_select', 'free_text']);
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
