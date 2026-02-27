import { z } from 'zod';
import { ConversationStatus } from '../enums/conversation-status.enum';
import { InteractionType } from '../enums/interaction-type.enum';
import { MessageMetadataType } from '../enums/message-metadata-type.enum';
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

// ── Message metadata sub-schemas ──

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
  evidence: z.array(z.string()),
});
export type CapabilityOption = z.infer<typeof CapabilityOptionSchema>;

export const FollowupQuestionSchema = z.object({
  sectionId: z.string(),
  question: z.string(),
});
export type FollowupQuestion = z.infer<typeof FollowupQuestionSchema>;

// ── Presentation metadata (ASSISTANT messages) ──

export const ClassificationOptionsMetadataSchema = z.object({
  type: z.literal(MessageMetadataType.CLASSIFICATION_OPTIONS),
  interactionType: z.literal(InteractionType.SINGLE_SELECT),
  options: z.array(ClassificationOptionSchema),
  suggestedEntryType: z.string(),
  reasoning: z.string(),
});
export type ClassificationOptionsMetadata = z.infer<typeof ClassificationOptionsMetadataSchema>;

export const FollowupQuestionsMetadataSchema = z.object({
  type: z.literal(MessageMetadataType.FOLLOWUP_QUESTIONS),
  interactionType: z.literal(InteractionType.FREE_TEXT),
  questions: z.array(FollowupQuestionSchema),
  missingSections: z.array(z.string()),
  followUpRound: z.number(),
  entryType: z.string(),
});
export type FollowupQuestionsMetadata = z.infer<typeof FollowupQuestionsMetadataSchema>;

export const CapabilityOptionsMetadataSchema = z.object({
  type: z.literal(MessageMetadataType.CAPABILITY_OPTIONS),
  interactionType: z.literal(InteractionType.MULTI_SELECT),
  options: z.array(CapabilityOptionSchema),
  entryType: z.string(),
});
export type CapabilityOptionsMetadata = z.infer<typeof CapabilityOptionsMetadataSchema>;

// ── Audit metadata (SYSTEM messages) ──

export const ClassificationSelectionMetadataSchema = z.object({
  type: z.literal(MessageMetadataType.CLASSIFICATION_SELECTION),
  interactionType: z.literal(InteractionType.DISPLAY_ONLY),
  entryType: z.string(),
});
export type ClassificationSelectionMetadata = z.infer<typeof ClassificationSelectionMetadataSchema>;

export const CapabilitySelectionMetadataSchema = z.object({
  type: z.literal(MessageMetadataType.CAPABILITY_SELECTION),
  interactionType: z.literal(InteractionType.DISPLAY_ONLY),
  selectedCodes: z.array(z.string()),
});
export type CapabilitySelectionMetadata = z.infer<typeof CapabilitySelectionMetadataSchema>;

export const DraftReviewMetadataSchema = z.object({
  type: z.literal(MessageMetadataType.DRAFT_REVIEW),
  interactionType: z.literal(InteractionType.DISPLAY_ONLY),
  approved: z.boolean(),
});
export type DraftReviewMetadata = z.infer<typeof DraftReviewMetadataSchema>;

// ── Discriminated union of all metadata variants ──

export const MessageMetadataSchema = z.discriminatedUnion('type', [
  ClassificationOptionsMetadataSchema,
  FollowupQuestionsMetadataSchema,
  CapabilityOptionsMetadataSchema,
  ClassificationSelectionMetadataSchema,
  CapabilitySelectionMetadataSchema,
  DraftReviewMetadataSchema,
]);
export type MessageMetadata = z.infer<typeof MessageMetadataSchema>;

// Message schemas
export const MessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: z.nativeEnum(MessageRole),
  messageType: z.nativeEnum(MessageType).catch(MessageType.UNKNOWN),
  processingStatus: z.nativeEnum(MessageProcessingStatus),
  content: z.string().nullable(),
  media: MessageMediaSchema.nullable(),
  metadata: MessageMetadataSchema.nullable().optional(),
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
  })
  .refine((data) => Boolean(data.content) !== Boolean(data.mediaId), {
    message: 'Exactly one of content or mediaId must be provided',
  });

export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;

// Analysis action request (unified start + resume)
// Uses z.union because z.discriminatedUnion requires unique discriminator values
// and we have multiple variants with type: "resume" (differentiated by node).
const AnalysisResumeSchema = z.object({ type: z.literal('resume') }).and(
  z.discriminatedUnion('node', [
    z.object({ node: z.literal('ask_followup') }),
    z.object({
      node: z.literal('present_classification'),
      value: z.object({ entryType: z.string().min(1) }),
    }),
    z.object({
      node: z.literal('present_capabilities'),
      value: z.object({ selectedCodes: z.array(z.string()).nonempty() }),
    }),
    z.object({
      node: z.literal('present_draft'),
      value: z.object({ approved: z.boolean() }),
    }),
  ])
);

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

export const MessageListResponseSchema = z.object({
  messages: z.array(MessageSchema),
  nextCursor: z.string().nullable(),
  limit: z.number(),
});

export type MessageListResponse = z.infer<typeof MessageListResponseSchema>;
