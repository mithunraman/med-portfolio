import { z } from 'zod';
import { MessageRole } from '../enums/message-role.enum';
import { ConversationStatus } from '../enums/conversation-status.enum';

// Message schemas
export const MessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: z.nativeEnum(MessageRole),
  content: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Message = z.infer<typeof MessageSchema>;

// Conversation schemas
export const ConversationSchema = z.object({
  id: z.string(),
  conversationId: z.string(), // Client-generated UUID
  title: z.string(),
  status: z.nativeEnum(ConversationStatus),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Conversation = z.infer<typeof ConversationSchema>;

// Request schemas
export const SendMessageRequestSchema = z.object({
  conversationId: z.string().min(1, 'Conversation ID is required'),
  content: z.string().min(1, 'Message content is required'),
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
