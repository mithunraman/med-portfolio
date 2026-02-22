import { z } from 'zod';
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

// Message schemas
export const MessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: z.nativeEnum(MessageRole),
  messageType: z.nativeEnum(MessageType).catch(MessageType.UNKNOWN),
  processingStatus: z.nativeEnum(MessageProcessingStatus),
  content: z.string().nullable(),
  media: MessageMediaSchema.nullable(),
  metadata: z.record(z.unknown()).nullable().optional(),
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
    content: z.string().min(1).optional(),
    mediaId: z.string().min(1).optional(),
  })
  .refine((data) => Boolean(data.content) !== Boolean(data.mediaId), {
    message: 'Exactly one of content or mediaId must be provided',
  });

export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;

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
